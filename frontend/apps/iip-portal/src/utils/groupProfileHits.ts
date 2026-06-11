import type { SuspectProfileHit } from '../api/knowledgeGraph';

function mergeHits(existing: SuspectProfileHit, incoming: SuspectProfileHit): SuspectProfileHit {
  const tags = new Set(existing.match_tags ?? []);
  for (const tag of incoming.match_tags ?? []) tags.add(tag);

  const display = (existing.display_name || '').trim().toLowerCase();
  const criminal = (incoming.criminal_name || '').trim();
  if (criminal && criminal.toLowerCase() !== display) tags.add(criminal);

  const alias = (incoming.alias_name || '').trim();
  if (alias && alias.toLowerCase() !== display) tags.add(alias);

  return {
    ...existing,
    dossier_id: existing.dossier_id ?? incoming.dossier_id,
    photo_id: existing.photo_id ?? incoming.photo_id,
    dossier_draft_id: existing.dossier_draft_id ?? incoming.dossier_draft_id,
    storage_key: existing.storage_key ?? incoming.storage_key,
    match_tags: [...tags],
  };
}

/** One row per master profile; sub-profile names appear in match_tags. */
export function groupProfileHitsByMaster(hits: SuspectProfileHit[]): SuspectProfileHit[] {
  const byMaster = new Map<string, SuspectProfileHit>();
  const order: string[] = [];

  for (const hit of hits) {
    const existing = byMaster.get(hit.master_suspect_id);
    if (!existing) {
      const display = (hit.display_name || '').trim().toLowerCase();
      const criminal = (hit.criminal_name || '').trim();
      const tags = new Set(hit.match_tags ?? []);
      if (criminal && criminal.toLowerCase() !== display) tags.add(criminal);
      byMaster.set(hit.master_suspect_id, { ...hit, match_tags: [...tags] });
      order.push(hit.master_suspect_id);
      continue;
    }
    byMaster.set(hit.master_suspect_id, mergeHits(existing, hit));
  }

  return order.map((id) => byMaster.get(id)!);
}
