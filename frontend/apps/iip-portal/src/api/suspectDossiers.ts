import { apiClient } from './http';
import { addressesToApiPayload, draftToUpdatePayload } from '../pages/suspects/suspectDetailMappers';
import type { SuspectDossierDraft, SuspectLinkDecision } from '../pages/suspects/suspectTypes';

export interface ScoredMatch {
  master_suspect_id: string;
  dossier_id: string | null;
  dossier_draft_id: string | null;
  criminal_name: string;
  alias_name: string | null;
  office_name: string | null;
  face_similarity: number;
  match_score: number;
  tier: 'STRONG' | 'WEAK' | 'IDENTITY' | 'BELOW_FACE_GATE';
  storage_key: string | null;
  photo_id: string | null;
}

export interface CreateSuspectDossierResponse {
  message: string;
  dossier_id: string;
  suspect_id: string;
  master_suspect_id: string;
  criminal_name: string;
  dossier_draft_id: string;
  link_status: string;
  front_photo: {
    photo_id: string;
    pose_type: string;
    storage_key: string;
    face_id: string | null;
  } | null;
}

export interface SuspectDossierSummary {
  dossier_id: string;
  suspect_id: string;
  master_suspect_id: string;
  criminal_name: string;
  alias_name: string | null;
  status: string;
  link_status: string;
  office_name: string | null;
  submitted_at: string;
  dossier_draft_id: string | null;
  front_photo_id: string | null;
  front_photo_storage_key: string | null;
  front_face_id: string | null;
  child_dossier_count: number;
}

export interface SuspectDossierListResponse {
  dossiers: SuspectDossierSummary[];
  total: number;
  page: number;
  page_size: number;
}

function draftToCreatePayload(
  draft: SuspectDossierDraft,
  linkDecision?: SuspectLinkDecision | null
) {
  return {
    dossierDraftId: draft.dossierDraftId,
    criminalName: draft.criminalName,
    aliasName: draft.aliasName,
    gender: draft.gender,
    fathersName: draft.fathersName,
    dateOfBirth: draft.dateOfBirth,
    age: draft.age,
    yearOfBirth: draft.yearOfBirth,
    placeOfBirth: draft.placeOfBirth,
    religion: draft.religion,
    category: draft.category,
    ...addressesToApiPayload(draft),
    contacts: draft.contacts,
    socialAccounts: draft.socialAccounts,
    relatives: draft.relatives,
    associates: draft.associates.map((a) => ({
      id: a.id,
      name: a.name,
      associationType: a.associationType,
      occupation: a.occupation,
      notes: a.notes,
      linkedMasterSuspectId: a.linkedMasterSuspectId,
    })),
    photos: draft.photos.map((p) => ({
      id: p.id,
      poseType: p.poseType,
      storageKey: p.storageKey,
      faceId: p.faceId,
      detectedPose: p.detectedPose,
      faceCount: p.faceCount,
      status: p.status === 'duplicate' && p.storageKey ? 'validated' : p.status,
    })),
    linkDecision: linkDecision
      ? {
          masterSuspectId: linkDecision.masterSuspectId,
          matchedDossierId: linkDecision.matchedDossierId,
          faceSimilarity: linkDecision.faceSimilarity,
          matchScore: linkDecision.matchScore,
          decision: linkDecision.decision,
        }
      : undefined,
  };
}

export async function scoreSuspectMatches(
  draft: SuspectDossierDraft
): Promise<ScoredMatch[]> {
  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  const faceMatches = (front?.duplicateMatches ?? []).map((m) => ({
    suspectId: m.suspect_id ?? m.master_suspect_id,
    masterSuspectId: m.master_suspect_id ?? m.suspect_id,
    dossierId: m.dossier_id,
    storageKey: m.storage_key,
    photoId: m.photo_id,
    criminalName: m.criminal_name,
    similarityScore: m.similarity_score,
  }));

  const hasIdentity =
    draft.criminalName.trim().length > 0 || draft.fathersName.trim().length > 0;
  if (!hasIdentity && faceMatches.length === 0) return [];

  const res = await apiClient.post<ScoredMatch[]>(
    '/intelligence/suspect-dossiers/score-matches',
    {
      criminalName: draft.criminalName,
      aliasName: draft.aliasName,
      fathersName: draft.fathersName,
      dateOfBirth: draft.dateOfBirth,
      yearOfBirth: draft.yearOfBirth,
      address: draft.address,
      faceMatches,
      excludeDossierId: draft.editingDossierId,
      excludeMasterId: draft.editingMasterSuspectId,
    },
    { skipSuccessToast: true }
  );
  return res.data;
}

export async function createSuspectDossier(
  draft: SuspectDossierDraft
): Promise<CreateSuspectDossierResponse> {
  const res = await apiClient.post<CreateSuspectDossierResponse>(
    '/intelligence/suspect-dossiers',
    draftToCreatePayload(draft, draft.linkDecision)
  );
  return res.data;
}

export async function listSuspectDossiers(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
}): Promise<SuspectDossierListResponse> {
  const res = await apiClient.get<SuspectDossierListResponse>('/intelligence/suspect-dossiers', {
    params: {
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 50,
      q: params?.q?.trim() || undefined,
    },
  });
  return res.data;
}

export async function getSuspectDossierDetail(dossierId: string): Promise<Record<string, unknown>> {
  const res = await apiClient.get<Record<string, unknown>>(
    `/intelligence/suspect-dossiers/${dossierId}`
  );
  return res.data;
}

export async function getMasterSuspectProfile(masterId: string): Promise<Record<string, unknown>> {
  const res = await apiClient.get<Record<string, unknown>>(
    `/intelligence/suspect-dossiers/masters/${masterId}`
  );
  return res.data;
}

export async function updateSuspectDossier(
  dossierId: string,
  draft: SuspectDossierDraft
): Promise<Record<string, unknown>> {
  const res = await apiClient.put<Record<string, unknown>>(
    `/intelligence/suspect-dossiers/${dossierId}`,
    draftToUpdatePayload(draft)
  );
  return res.data;
}

export interface QuickSuspectCapture {
  id: string;
  name: string;
  storage_key: string;
  latitude: number | null;
  longitude: number | null;
  captured_at: string;
  used: boolean;
}

export async function fetchQuickSuspects(): Promise<QuickSuspectCapture[]> {
  const res = await apiClient.get<QuickSuspectCapture[]>(
    '/intelligence/suspect-dossiers/quick-suspects',
    { skipSuccessToast: true }
  );
  return res.data;
}

export async function fetchQuickSuspectImageBlob(id: string): Promise<Blob> {
  const res = await apiClient.get<Blob>(
    `/intelligence/suspect-dossiers/quick-suspects/${id}/image`,
    {
      responseType: 'blob',
      skipSuccessToast: true,
      skipToast: true,
    }
  );
  return res.data;
}
