"""Neo4j knowledge graph sync and network queries for suspect associates."""

from __future__ import annotations

import asyncio
import uuid
from functools import lru_cache
from typing import Any

from iip_core.logging import get_logger
from iip_core.settings import BaseServiceSettings, get_settings

logger = get_logger(__name__)


class KnowledgeGraphService:
    def __init__(self, settings: BaseServiceSettings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self._settings.neo4j_enabled)

    def _driver(self):
        from neo4j import GraphDatabase

        return GraphDatabase.driver(
            self._settings.neo4j_uri,
            auth=(self._settings.neo4j_user, self._settings.neo4j_password),
        )

    async def upsert_suspect_node(self, master_id: str, display_name: str) -> None:
        if not self.enabled:
            return

        def _run() -> None:
            with self._driver() as driver:
                with driver.session() as session:
                    session.run(
                        """
                        MERGE (s:Suspect {masterId: $masterId})
                        SET s.displayName = $displayName,
                            s.updatedAt = datetime()
                        """,
                        masterId=master_id,
                        displayName=display_name,
                    )

        await asyncio.to_thread(_run)

    async def sync_associate_links(
        self,
        *,
        dossier_id: str,
        source_master_id: str,
        source_display_name: str,
        associates: list[dict[str, Any]],
    ) -> None:
        """Mirror associate edges from a dossier into Neo4j."""
        if not self.enabled:
            return

        def _run() -> None:
            with self._driver() as driver:
                with driver.session() as session:
                    # Clear existing relationships for this dossier first
                    session.run(
                        """
                        MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH]->()
                        WHERE r.dossierId = $dossierId
                        DELETE r
                        """,
                        sourceId=source_master_id,
                        dossierId=dossier_id,
                    )
                    # Clear all CO_ACCUSED relationships involving this suspect (inbound or outbound)
                    session.run(
                        """
                        MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH {role: 'CO_ACCUSED'}]-()
                        DELETE r
                        """,
                        sourceId=source_master_id,
                    )
                    session.run(
                        """
                        MERGE (s:Suspect {masterId: $masterId})
                        SET s.displayName = $displayName,
                            s.updatedAt = datetime()
                        """,
                        masterId=source_master_id,
                        displayName=source_display_name,
                    )
                    for assoc in associates:
                        target_raw = assoc.get("master_id")
                        if not target_raw or str(target_raw) == "None":
                            continue
                        target_id = str(target_raw)
                        if target_id == source_master_id:
                            continue
                        session.run(
                            """
                            MERGE (src:Suspect {masterId: $sourceId})
                            MERGE (tgt:Suspect {masterId: $targetId})
                            SET tgt.displayName = coalesce($targetName, tgt.displayName),
                                tgt.updatedAt = datetime()
                            MERGE (src)-[r:ASSOCIATED_WITH]->(tgt)
                            SET r.role = $role,
                                r.dossierId = $dossierId,
                                r.crimeNumber = $crimeNumber,
                                r.psName = $psName,
                                r.updatedAt = datetime()
                            """,
                            sourceId=source_master_id,
                            targetId=target_id,
                            targetName=assoc.get("display_name"),
                            role=assoc.get("association_type") or "ASSOCIATE",
                            dossierId=assoc.get("dossier_id"),
                            crimeNumber=assoc.get("crime_number"),
                            psName=assoc.get("ps_name"),
                        )

        try:
            await asyncio.to_thread(_run)
        except Exception as exc:
            logger.warning(
                "knowledge_graph_sync_failed",
                source_master_id=source_master_id,
                error=str(exc),
            )

    async def fetch_network(
        self,
        master_id: str,
        *,
        depth: int = 2,
    ) -> dict[str, Any]:
        """Return nodes and edges for link-analysis visualization."""
        if not self.enabled:
            return {"nodes": [], "edges": [], "center_id": master_id}

        depth = max(1, min(depth, 3))

        def _run() -> dict[str, Any]:
            hop = max(1, min(depth, 3))
            cypher = f"""
                MATCH (center:Suspect {{masterId: $masterId}})
                OPTIONAL MATCH (center)-[rel:ASSOCIATED_WITH*1..{hop}]-(other:Suspect)
                WITH center, collect(DISTINCT other) AS others
                OPTIONAL MATCH (a:Suspect)-[edge:ASSOCIATED_WITH]-(b:Suspect)
                WHERE a.masterId = $masterId
                   OR b.masterId = $masterId
                   OR a IN others OR b IN others
                RETURN center, others, collect(DISTINCT edge) AS edges
            """
            with self._driver() as driver:
                with driver.session() as session:
                    result = session.run(cypher, masterId=master_id)
                    record = result.single()
                    if not record:
                        return {"nodes": [], "edges": [], "center_id": master_id}

                    nodes_map: dict[str, dict[str, Any]] = {}
                    center = record["center"]
                    if center:
                        nodes_map[center["masterId"]] = {
                            "id": center["masterId"],
                            "label": center.get("displayName") or center["masterId"],
                            "is_center": True,
                        }

                    for node in record["others"] or []:
                        if node is None:
                            continue
                        node_id = node.get("masterId")
                        if not node_id or str(node_id) == "None":
                            continue
                        nodes_map[node_id] = {
                            "id": node_id,
                            "label": node.get("displayName") or node_id,
                            "is_center": node_id == master_id,
                        }

                    edges: list[dict[str, Any]] = []
                    seen_edges: set[str] = set()
                    for rel in record["edges"] or []:
                        if rel is None:
                            continue
                        start = rel.start_node.get("masterId")
                        end = rel.end_node.get("masterId")
                        if not start or not end or str(start) == "None" or str(end) == "None":
                            continue
                        key = f"{start}->{end}:{rel.get('role', '')}"
                        if key in seen_edges:
                            continue
                        seen_edges.add(key)
                        edges.append(
                            {
                                "id": key,
                                "source": start,
                                "target": end,
                                "role": rel.get("role") or "ASSOCIATE",
                                "dossier_id": rel.get("dossierId"),
                                "crime_number": rel.get("crimeNumber"),
                                "ps_name": rel.get("psName"),
                            }
                        )
                        for n in (rel.start_node, rel.end_node):
                            n_id = n.get("masterId")
                            if not n_id or str(n_id) == "None":
                                continue
                            nodes_map[n_id] = {
                                "id": n_id,
                                "label": n.get("displayName") or n_id,
                                "is_center": n_id == master_id,
                            }

                    return {
                        "nodes": list(nodes_map.values()),
                        "edges": edges,
                        "center_id": master_id,
                    }

        try:
            return await asyncio.to_thread(_run)
        except Exception as exc:
            logger.warning("knowledge_graph_fetch_failed", master_id=master_id, error=str(exc))
            return {"nodes": [], "edges": [], "center_id": master_id, "error": str(exc)}


@lru_cache(maxsize=1)
def get_knowledge_graph_service() -> KnowledgeGraphService:
    return KnowledgeGraphService()


async def sync_dossier_associates_to_graph(
    *,
    dossier_id: uuid.UUID,
    master_id: uuid.UUID,
    display_name: str,
    associates: list[dict[str, Any]],
) -> None:
    kg = get_knowledge_graph_service()
    await kg.upsert_suspect_node(str(master_id), display_name)
    await kg.sync_associate_links(
        dossier_id=str(dossier_id),
        source_master_id=str(master_id),
        source_display_name=display_name,
        associates=associates,
    )
