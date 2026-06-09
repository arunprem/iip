"""Knowledge graph — suspect search and associate network analysis."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from iip_core.auth import CurrentUser, get_current_user
from iip_core.db import get_db
from iip_core.errors import ErrorCode, IIPException
from iip_core.logging import get_logger

from iam_svc.dependencies import require_suspect_dossier_read
from iam_svc.models.role import Role
from iam_svc.repositories.suspect_dossier_repository import SuspectDossierRepository
from iam_svc.services.knowledge_graph_service import get_knowledge_graph_service

router = APIRouter()
logger = get_logger(__name__)


class SuspectProfileHit(BaseModel):
    master_suspect_id: str
    display_name: str
    criminal_name: str
    alias_name: str | None = None
    dossier_id: str
    gender: str | None = None
    fathers_name: str | None = None
    age: int | None = None
    photo_id: str | None = None
    dossier_draft_id: str | None = None
    storage_key: str | None = None


class SuspectSearchResponse(BaseModel):
    query: str
    results: list[SuspectProfileHit]
    has_more: bool = False
    offset: int = 0
    limit: int = 20


class GraphNode(BaseModel):
    id: str
    label: str
    is_center: bool = False
    node_kind: str = "associate"
    gender: str | None = None
    criminal_name: str | None = None
    photo_id: str | None = None
    dossier_draft_id: str | None = None
    storage_key: str | None = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    role: str = "ASSOCIATE"
    link_kind: str = "associate"
    dossier_id: str | None = None


class NetworkGraphResponse(BaseModel):
    center_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    error: str | None = None


@router.get("/search", response_model=SuspectSearchResponse)
async def search_suspect_profiles(
    q: Annotated[str, Query(min_length=2, max_length=120)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    _role: Annotated[Role, Depends(require_suspect_dossier_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=15, ge=1, le=50),
    offset: int = Query(default=0, ge=0, le=500),
    alias: str | None = Query(default=None, max_length=120),
    gender: str | None = Query(default=None, max_length=50),
    fathers_name: str | None = Query(default=None, max_length=120),
    age: int | None = Query(default=None, ge=1, le=120),
    has_photo: bool | None = Query(default=None),
    exclude_master_suspect_id: uuid.UUID | None = Query(default=None),
) -> SuspectSearchResponse:
    """Search suspect dossier profiles for linking and knowledge-graph analysis."""
    _ = current_user
    repo = SuspectDossierRepository(db)
    rows, has_more = await repo.search_suspect_profiles(
        q,
        limit=limit,
        offset=offset,
        alias=alias,
        gender=gender,
        fathers_name=fathers_name,
        age=age,
        has_photo=has_photo,
        exclude_master_id=exclude_master_suspect_id,
    )
    return SuspectSearchResponse(
        query=q,
        results=[SuspectProfileHit(**row) for row in rows],
        has_more=has_more,
        offset=offset,
        limit=limit,
    )


@router.get("/network/{master_suspect_id}", response_model=NetworkGraphResponse)
async def get_associate_network(
    master_suspect_id: uuid.UUID,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    _role: Annotated[Role, Depends(require_suspect_dossier_read)],
    db: Annotated[AsyncSession, Depends(get_db)],
    depth: int = Query(default=2, ge=1, le=3),
) -> NetworkGraphResponse:
    """Return associate network graph for link analysis."""
    _ = current_user
    repo = SuspectDossierRepository(db)
    master = await repo.get_master(master_suspect_id)
    if not master:
        raise IIPException(
            status_code=404,
            error_code=ErrorCode.NOT_FOUND,
            detail="Suspect profile not found",
        )

    kg = get_knowledge_graph_service()
    await kg.upsert_suspect_node(str(master.id), master.display_name)
    payload = await kg.fetch_network(str(master_suspect_id), depth=depth)

    if not payload.get("nodes"):
        payload = await _fallback_network_from_postgres(repo, master_suspect_id)
    else:
        _tag_graph_node_kinds(payload, str(master_suspect_id))

    await _merge_relatives_into_network(repo, master_suspect_id, payload)
    await _enrich_graph_nodes(repo, payload)

    return NetworkGraphResponse(
        center_id=str(master_suspect_id),
        nodes=[GraphNode(**n) for n in payload.get("nodes", [])],
        edges=[GraphEdge(**e) for e in payload.get("edges", [])],
        error=payload.get("error"),
    )


def _tag_graph_node_kinds(payload: dict, center_id: str) -> None:
    for n in payload.get("nodes") or []:
        if n.get("node_kind"):
            continue
        if n.get("is_center") or str(n.get("id")) == center_id:
            n["node_kind"] = "center"
        elif str(n.get("id", "")).startswith("relative:"):
            n["node_kind"] = "relative"
        else:
            n["node_kind"] = "associate"
    for e in payload.get("edges") or []:
        if not e.get("link_kind"):
            e["link_kind"] = "relative" if str(e.get("target", "")).startswith("relative:") else "associate"


async def _merge_relatives_into_network(
    repo: SuspectDossierRepository,
    master_id: uuid.UUID,
    payload: dict,
) -> None:
    """Add family relative nodes and edges (muted tier) to the network."""
    center_id = str(master_id)
    relatives = await repo.relatives_for_graph(master_id)
    if not relatives:
        return

    nodes_map = {str(n["id"]): n for n in (payload.get("nodes") or [])}
    if center_id not in nodes_map:
        master = await repo.get_master(master_id)
        if master:
            nodes_map[center_id] = {
                "id": center_id,
                "label": master.display_name,
                "is_center": True,
                "node_kind": "center",
            }

    edges: list[dict] = list(payload.get("edges") or [])
    seen_edges = {e["id"] for e in edges}

    for rel in relatives:
        node_id = f"relative:{rel['id']}"
        nodes_map[node_id] = {
            "id": node_id,
            "label": rel["name"],
            "is_center": False,
            "node_kind": "relative",
            "gender": rel.get("gender"),
            "criminal_name": rel["name"],
        }
        edge_id = f"{center_id}->{node_id}:{rel['relation']}"
        if edge_id in seen_edges:
            continue
        seen_edges.add(edge_id)
        edges.append(
            {
                "id": edge_id,
                "source": center_id,
                "target": node_id,
                "role": rel["relation"] or "Relative",
                "link_kind": "relative",
                "dossier_id": rel.get("dossier_id"),
            }
        )

    payload["nodes"] = list(nodes_map.values())
    payload["edges"] = edges


async def _enrich_graph_nodes(repo: SuspectDossierRepository, payload: dict) -> None:
    nodes = payload.get("nodes") or []
    if not nodes:
        return
    master_ids: list[uuid.UUID] = []
    for n in nodes:
        if str(n.get("id", "")).startswith("relative:"):
            continue
        try:
            master_ids.append(uuid.UUID(str(n["id"])))
        except ValueError:
            continue
    profiles = await repo.get_master_graph_profiles(master_ids)
    for n in nodes:
        prof = profiles.get(str(n["id"]), {})
        if prof.get("criminal_name"):
            n["label"] = prof["criminal_name"]
        n["gender"] = prof.get("gender")
        n["criminal_name"] = prof.get("criminal_name")
        n["photo_id"] = prof.get("photo_id")
        n["dossier_draft_id"] = prof.get("dossier_draft_id")
        n["storage_key"] = prof.get("storage_key")


async def _fallback_network_from_postgres(
    repo: SuspectDossierRepository,
    master_id: uuid.UUID,
) -> dict:
    """Build a one-hop network from PostgreSQL when Neo4j has no data yet."""
    from sqlalchemy import select

    from iam_svc.models.suspect_dossier import SuspectAssociate, SuspectDossier, SuspectMaster

    master = await repo.get_master(master_id)
    if not master:
        return {"nodes": [], "edges": []}

    nodes = {
        str(master.id): {
            "id": str(master.id),
            "label": master.display_name,
            "is_center": True,
            "node_kind": "center",
        }
    }
    edges: list[dict] = []

    stmt = (
        select(SuspectAssociate, SuspectDossier)
        .join(SuspectDossier, SuspectDossier.id == SuspectAssociate.dossier_id)
        .where(SuspectDossier.master_suspect_id == master_id)
    )
    rows = (await repo.session.execute(stmt)).all()
    for assoc, _dossier in rows:
        if not assoc.linked_master_suspect_id:
            continue
        target_id = str(assoc.linked_master_suspect_id)
        target_master = await repo.get_master(assoc.linked_master_suspect_id)
        nodes[target_id] = {
            "id": target_id,
            "label": target_master.display_name if target_master else assoc.name,
            "is_center": False,
            "node_kind": "associate",
        }
        edge_id = f"{master_id}->{target_id}:{assoc.association_type or ''}"
        edges.append(
            {
                "id": edge_id,
                "source": str(master_id),
                "target": target_id,
                "role": assoc.association_type or "ASSOCIATE",
                "link_kind": "associate",
                "dossier_id": str(assoc.dossier_id),
            }
        )

    return {"nodes": list(nodes.values()), "edges": edges}
