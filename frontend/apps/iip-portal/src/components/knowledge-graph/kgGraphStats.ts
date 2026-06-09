import type { GraphEdge } from '../../api/knowledgeGraph';
import { formatRelationRole } from './kgGraphCanvas';

export interface RelationStat {
  role: string;
  label: string;
  count: number;
  linkKind: string;
}

export function relationFilterKey(linkKind: string, role: string): string {
  return `${linkKind}:${role}`;
}

export function relationStatKey(stat: RelationStat): string {
  return relationFilterKey(stat.linkKind, stat.role);
}

export function buildRelationStats(edges: GraphEdge[]): RelationStat[] {
  const map = new Map<string, RelationStat>();
  for (const edge of edges) {
    const role = edge.role || 'UNKNOWN';
    const key = `${edge.link_kind ?? 'associate'}:${role}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        role,
        label: formatRelationRole(role),
        count: 1,
        linkKind: edge.link_kind ?? 'associate',
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
