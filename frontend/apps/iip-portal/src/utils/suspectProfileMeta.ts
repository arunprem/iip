import type { SuspectProfileHit } from '../api/knowledgeGraph';

/** One-line identifying details for profile search / picker rows. */
export function formatSuspectProfileMeta(hit: SuspectProfileHit): string {
  const parts: string[] = [];
  if (hit.fathers_name) parts.push(`Father: ${hit.fathers_name}`);
  if (hit.alias_name) parts.push(`Alias: ${hit.alias_name}`);
  if (hit.gender) parts.push(hit.gender);
  if (hit.age != null) parts.push(`Age ${hit.age}`);
  if (hit.office_name) parts.push(hit.office_name);
  if (hit.link_status === 'LINKED') parts.push('Linked dossier');
  else if (hit.link_status === 'STANDALONE') parts.push('Standalone dossier');
  if (hit.profile_kind === 'stub') parts.push('Profile stub');
  const shortId = hit.master_suspect_id.slice(0, 8);
  if (shortId) parts.push(`Ref ${shortId}`);
  return parts.join(' · ');
}
