import asyncio
from sqlalchemy import select
from iip_core.settings import get_settings
from iip_core.db import init_db, get_db
from iam_svc.models.suspect_dossier import SuspectDossier, Suspect
from iam_svc.repositories.suspect_dossier_repository import SuspectDossierRepository
from iam_svc.services.knowledge_graph_service import get_knowledge_graph_service

async def main():
    settings = get_settings()
    init_db(settings)
    db_gen = get_db()
    db = await anext(db_gen)
    
    try:
        # Find Sreejith
        stmt = select(Suspect).where(Suspect.criminal_name.ilike("%sreejith%"))
        s = (await db.execute(stmt)).scalars().first()
        if not s:
            print("Sreejith not found")
            return
            
        d_stmt = select(SuspectDossier).where(SuspectDossier.suspect_id == s.id)
        dossier = (await db.execute(d_stmt)).scalars().first()
        print(f"Suspect: {s.criminal_name}, Dossier: {dossier.id}, Master: {dossier.master_suspect_id}")
        
        repo = SuspectDossierRepository(db)
        associates = await repo.associates_for_graph_sync(dossier.id)
        print(f"Associates for sync: {associates}")
        
        kg = get_knowledge_graph_service()
        print("Neo4j enabled:", kg.enabled)
        
        # Run sync manually with verbose prints
        def _run() -> None:
            with kg._driver() as driver:
                with driver.session() as session:
                    # 1. Check existing relationships
                    res = session.run("MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH]->(tgt) RETURN tgt.masterId, r.role, r.dossierId", sourceId=str(dossier.master_suspect_id))
                    print("Before sync, outgoing edges:")
                    for record in res:
                        print(f"  -> {record['tgt.masterId']} ({record['r.role']}) dossierId={record['r.dossierId']}")
                        
                    # 2. Deletes
                    print("Deleting outgoing for dossier...")
                    session.run(
                        """
                        MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH]->()
                        WHERE r.dossierId = $dossierId
                        DELETE r
                        """,
                        sourceId=str(dossier.master_suspect_id),
                        dossierId=str(dossier.id),
                    )
                    
                    print("Deleting CO_ACCUSED...")
                    session.run(
                        """
                        MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH {role: 'CO_ACCUSED'}]-()
                        DELETE r
                        """,
                        sourceId=str(dossier.master_suspect_id),
                    )
                    
                    # Check edges after delete
                    res = session.run("MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH]-(tgt) RETURN tgt.masterId, r.role, r.dossierId", sourceId=str(dossier.master_suspect_id))
                    print("After delete, any edges left:")
                    for record in res:
                        print(f"  - {record['tgt.masterId']} ({record['r.role']})")
                        
                    # 3. Recreate
                    for assoc in associates:
                        target_raw = assoc.get("master_id")
                        if not target_raw or str(target_raw) == "None":
                            continue
                        target_id = str(target_raw)
                        if target_id == str(dossier.master_suspect_id):
                            continue
                        print(f"Creating edge to {target_id} with role {assoc.get('association_type')}")
                        session.run(
                            """
                            MERGE (src:Suspect {masterId: $sourceId})
                            MERGE (tgt:Suspect {masterId: $targetId})
                            SET tgt.displayName = coalesce($targetName, tgt.displayName),
                                tgt.updatedAt = datetime()
                            MERGE (src)-[r:ASSOCIATED_WITH]->(tgt)
                            SET r.role = $role,
                                r.dossierId = $dossierId,
                                r.updatedAt = datetime()
                            """,
                            sourceId=str(dossier.master_suspect_id),
                            targetId=target_id,
                            targetName=assoc.get("display_name"),
                            role=assoc.get("association_type") or "ASSOCIATE",
                            dossierId=assoc.get("dossier_id"),
                        )
                        
                    # Verify final edges
                    res = session.run("MATCH (src:Suspect {masterId: $sourceId})-[r:ASSOCIATED_WITH]->(tgt) RETURN tgt.masterId, r.role, r.dossierId", sourceId=str(dossier.master_suspect_id))
                    print("Final outgoing edges:")
                    for record in res:
                        print(f"  -> {record['tgt.masterId']} ({record['r.role']})")
                        
        await asyncio.to_thread(_run)
        
    finally:
        await db_gen.aclose()

if __name__ == "__main__":
    asyncio.run(main())
