import { apiClient } from './http';

export type HumintReportType = 'TIP' | 'EVENT' | 'FIELD_OBSERVATION' | 'INTELLIGENCE_REPORT' | 'FOLLOW_UP';
export type HumintReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'ACTIONED' | 'CLOSED';

export interface HumintAttachment {
  id: string;
  attachment_type: string;
  file_name: string;
  content_type: string | null;
  object_key: string;
  file_size_bytes: number | null;
  extracted_text: string | null;
  ocr_text: string | null;
  vision_caption: string | null;
  audio_transcript: string | null;
  vector_status: string;
}

export interface HumintReport {
  id: string;
  office_id: string;
  reported_by: string;
  title: string;
  report_type: HumintReportType;
  status: HumintReportStatus;
  narrative: string;
  event_at: string | null;
  location_text: string | null;
  latitude: string | null;
  longitude: string | null;
  urgency: string | null;
  supervisor_cross_unit_visible: boolean;
  linked_suspect_dossier_id: string | null;
  linked_case_ref: string | null;
  linked_hotspot_label: string | null;
  linked_graph_node_id: string | null;
  llm_summary: string | null;
  llm_structured_report: string | null;
  llm_entities: Record<string, unknown> | null;
  attachments: HumintAttachment[];
  created_at: string;
  updated_at: string;
}

export interface HumintReportListResponse {
  reports: HumintReport[];
  total: number;
  page: number;
  page_size: number;
}

export interface HumintSemanticSearchHit {
  report_id: string;
  title: string | null;
  report_type: string | null;
  status: string | null;
  urgency: string | null;
  location_text: string | null;
  linked_case_ref: string | null;
  linked_hotspot_label: string | null;
  score: number;
  search_text: string | null;
}

export interface HumintSemanticSearchResponse {
  hits: HumintSemanticSearchHit[];
}

export async function listHumintReports(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  reportType?: string;
  status?: string;
}): Promise<HumintReportListResponse> {
  const res = await apiClient.get<HumintReportListResponse>('/intelligence/humint-reports', {
    params: {
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 50,
      q: params?.q?.trim() || undefined,
      reportType: params?.reportType || undefined,
      status: params?.status || undefined,
    },
  });
  return res.data;
}

export async function createHumintReport(payload: Record<string, unknown>): Promise<HumintReport> {
  const res = await apiClient.post<HumintReport>('/intelligence/humint-reports', payload);
  return res.data;
}

export async function uploadHumintAttachment(params: {
  reportId: string;
  attachmentType: 'PHOTO' | 'AUDIO' | 'DOCUMENT';
  file: File;
}): Promise<HumintAttachment> {
  const form = new FormData();
  form.append('attachmentType', params.attachmentType);
  form.append('file', params.file);
  const res = await apiClient.post<HumintAttachment>(
    `/intelligence/humint-reports/${params.reportId}/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return res.data;
}

export async function searchHumintReportsSemantic(params: {
  query: string;
  size?: number;
}): Promise<HumintSemanticSearchResponse> {
  const res = await apiClient.post<HumintSemanticSearchResponse>('/intelligence/humint-reports/search/semantic', {
    query: params.query,
    size: params.size ?? 10,
  });
  return res.data;
}
