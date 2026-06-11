import { apiClient } from './http';

export interface SuspectProfileHit {
  master_suspect_id: string;
  display_name: string;
  criminal_name: string;
  alias_name: string | null;
  dossier_id: string | null;
  gender?: string | null;
  fathers_name?: string | null;
  age?: number | null;
  photo_id?: string | null;
  dossier_draft_id?: string | null;
  storage_key?: string | null;
  office_name?: string | null;
  profile_kind?: 'dossier' | 'stub';
  link_status?: string | null;
  match_tags?: string[];
}

export interface SuspectProfileSearchOptions {
  limit?: number;
  offset?: number;
  alias?: string;
  gender?: string;
  fathersName?: string;
  age?: number;
  hasPhoto?: boolean;
  excludeMasterSuspectId?: string;
}

export interface SuspectProfileSearchResponse {
  query: string;
  results: SuspectProfileHit[];
  has_more: boolean;
  offset: number;
  limit: number;
}

export type GraphNodeKind = 'center' | 'associate' | 'relative';
export type GraphLinkKind = 'associate' | 'relative';

export interface GraphNode {
  id: string;
  label: string;
  is_center: boolean;
  node_kind?: GraphNodeKind;
  gender?: string | null;
  criminal_name?: string | null;
  photo_id?: string | null;
  dossier_draft_id?: string | null;
  storage_key?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  role: string;
  link_kind?: GraphLinkKind;
  dossier_id: string | null;
}

export interface NetworkGraphResponse {
  center_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  error?: string | null;
}

function buildSearchParams(query: string, options?: SuspectProfileSearchOptions): string {
  const params = new URLSearchParams({ q: query });
  if (options?.limit != null) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.alias?.trim()) params.set('alias', options.alias.trim());
  if (options?.gender?.trim()) params.set('gender', options.gender.trim());
  if (options?.fathersName?.trim()) params.set('fathers_name', options.fathersName.trim());
  if (options?.age != null) params.set('age', String(options.age));
  if (options?.hasPhoto) params.set('has_photo', 'true');
  if (options?.excludeMasterSuspectId) {
    params.set('exclude_master_suspect_id', options.excludeMasterSuspectId);
  }
  return params.toString();
}

export async function searchSuspectProfiles(
  query: string,
  options?: SuspectProfileSearchOptions
): Promise<SuspectProfileSearchResponse> {
  const res = await apiClient.get<SuspectProfileSearchResponse>(
    `/intelligence/knowledge-graph/search?${buildSearchParams(query, options)}`
  );
  return res.data;
}

export async function fetchAssociateNetwork(
  masterSuspectId: string,
  depth = 2
): Promise<NetworkGraphResponse> {
  const res = await apiClient.get<NetworkGraphResponse>(
    `/intelligence/knowledge-graph/network/${masterSuspectId}?depth=${depth}`
  );
  return res.data;
}
