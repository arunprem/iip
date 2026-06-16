import { apiClient } from './http';

export interface AutofillData {
  criminalName: string | null;
  aliasName: string | null;
  fathersName: string | null;
  dateOfBirth: string | null;
  age: string | null;
  gender: string | null;
  address: {
    houseNo?: string | null;
    houseName?: string | null;
    streetName?: string | null;
    locality?: string | null;
    tehsil?: string | null;
    villageTownCity?: string | null;
    pincode?: string | null;
    district?: string | null;
    state?: string | null;
  } | null;
  modusOperandi: string | null;
  cases: Array<{
    crimeNumber: string;
    crimeYear: number;
    policeStationName: string | null;
    actSection: string | null;
    brief: string | null;
    presentStatus: string | null;
  }>;
}

export interface SectionSuggestion {
  section: string;
  explanation: string;
}

export interface SuggestionResponse {
  suggestions: SectionSuggestion[];
}

export interface GraphNodeInfo {
  id: string;
  label: string;
  node_kind: string;
  criminal_name?: string | null;
}

export interface GraphEdgeInfo {
  source: string;
  target: string;
  role: string;
}

export type AssistantLanguage = 'english' | 'malayalam';

export async function assistantAutofill(text: string): Promise<AutofillData> {
  const res = await apiClient.post<AutofillData>('/ml/assistant/autofill', { text });
  return res.data;
}

export async function assistantSynthesizeMO(
  cases: Array<{
    crimeNumber?: string;
    crimeYear?: number;
    policeStationName?: string | null;
    actSection?: string | null;
    brief?: string | null;
    presentStatus?: string | null;
  }>
): Promise<string> {
  const res = await apiClient.post<{ modus_operandi: string }>('/ml/assistant/synthesize-mo', {
    cases,
  });
  return res.data.modus_operandi;
}

export async function assistantSummarizeBrief(text: string): Promise<string> {
  const res = await apiClient.post<{ summary: string }>('/ml/assistant/summarize-brief', { text });
  return res.data.summary;
}

export async function assistantExtractModusTags(text: string): Promise<string[]> {
  const res = await apiClient.post<{ tags: string[] }>('/ml/assistant/extract-mo-tags', { text });
  return res.data.tags;
}

export async function assistantSuggestSections(text: string): Promise<SectionSuggestion[]> {
  const res = await apiClient.post<SuggestionResponse>('/ml/assistant/suggest-sections', { text });
  return res.data.suggestions;
}

export async function assistantTransliterate(text: string): Promise<string> {
  const res = await apiClient.post<{ transliteratedText: string }>('/ml/assistant/transliterate', { text });
  return res.data.transliteratedText;
}

export async function assistantAnalyzeNetwork(
  nodes: GraphNodeInfo[],
  edges: GraphEdgeInfo[],
  language: AssistantLanguage = 'english'
): Promise<string> {
  const res = await apiClient.post<{ analysis: string }>('/ml/assistant/analyze-network', {
    nodes,
    edges,
    language,
  });
  return res.data.analysis;
}

export async function assistantExplainPath(
  path: any[],
  language: AssistantLanguage = 'english'
): Promise<string> {
  const res = await apiClient.post<{ explanation: string }>('/ml/assistant/explain-path', {
    path,
    language,
  });
  return res.data.explanation;
}

export async function assistantSuggestMissingLinks(
  nodes: GraphNodeInfo[],
  edges: GraphEdgeInfo[],
  language: AssistantLanguage = 'english'
): Promise<string[]> {
  const res = await apiClient.post<{ recommendations: string[] }>(
    '/ml/assistant/suggest-missing-links',
    { nodes, edges, language }
  );
  return res.data.recommendations;
}

export async function assistantFilterGraph(
  query: string,
  nodes: GraphNodeInfo[],
  edges: GraphEdgeInfo[],
  language: AssistantLanguage = 'english'
): Promise<string[]> {
  const res = await apiClient.post<{ matching_node_ids: string[] }>(
    '/ml/assistant/filter-graph',
    { query, nodes, edges, language }
  );
  return res.data.matching_node_ids;
}

export interface HotspotBriefPoint {
  criminal_name: string;
  district?: string | null;
  police_station?: string | null;
  address_kind?: string | null;
  modus_operandi?: string | null;
  case_count?: number;
}

export async function assistantHotspotBrief(payload: {
  query?: string | null;
  address_scope: string;
  case_scope: string;
  point_count: number;
  visible_count: number;
  districts: string[];
  police_stations: string[];
  points: HotspotBriefPoint[];
  language?: AssistantLanguage;
}): Promise<string> {
  const res = await apiClient.post<{ briefing: string }>('/ml/assistant/hotspot-brief', {
    ...payload,
    language: payload.language ?? 'english',
  });
  return res.data.briefing;
}

export interface HumintDraftAssistResponse {
  title: string;
  summary: string;
  structured_report: string;
  report_type: 'TIP' | 'EVENT' | 'FIELD_OBSERVATION' | 'INTELLIGENCE_REPORT' | 'FOLLOW_UP';
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  entities: {
    names?: string[];
    phones?: string[];
    vehicles?: string[];
    places?: string[];
    modus_hints?: string[];
  };
}

export async function assistantDraftHumintReport(payload: {
  narrative: string;
  location_text?: string;
  report_type?: string;
}): Promise<HumintDraftAssistResponse> {
  const res = await apiClient.post<HumintDraftAssistResponse>('/ml/assistant/humint-draft', payload);
  return res.data;
}
