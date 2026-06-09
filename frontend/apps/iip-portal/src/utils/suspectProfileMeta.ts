import type { SuspectProfileHit } from '../api/knowledgeGraph';

/** One-line identifying details for profile search / picker rows. */
export function formatSuspectProfileMeta(hit: SuspectProfileHit): string {
  const parts: string[] = [];
  if (hit.alias_name) parts.push(`Alias: ${hit.alias_name}`);
  if (hit.fathers_name) parts.push(`Father: ${hit.fathers_name}`);
  if (hit.gender) parts.push(hit.gender);
  if (hit.age != null) parts.push(`Age ${hit.age}`);
  return parts.join(' · ');
}
