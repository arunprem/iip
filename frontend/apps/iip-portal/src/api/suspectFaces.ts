import { apiClient } from './http';
import { readFileAsDataUrl } from '../utils/cropImage';

async function blobToPreviewDataUrl(blob: Blob): Promise<string> {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('Empty image response');
  }
  const type = blob.type || 'image/jpeg';
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error('Invalid image response');
  }
  const file =
    blob instanceof File ? blob : new File([blob], 'suspect-photo.jpg', { type });
  return readFileAsDataUrl(file);
}

/** Immediate preview from a selected file (data URL — reliable in img src). */
export async function fileToSuspectPhotoPreviewDataUrl(file: File): Promise<string> {
  return readFileAsDataUrl(file);
}

export type SuspectPhotoPoseType =
  | 'FRONT'
  | 'LEFT_PROFILE'
  | 'RIGHT_PROFILE'
  | 'LEFT'
  | 'RIGHT'
  | 'OTHER';

export interface FaceDuplicateMatch {
  face_id: string;
  photo_id: string | null;
  dossier_draft_id: string | null;
  suspect_id: string | null;
  criminal_name: string | null;
  storage_key: string | null;
  pose_type: string;
  similarity_score: number;
}

export interface FaceModelsStatus {
  ready: boolean;
  warming?: boolean;
  service_available?: boolean;
  model_name: string | null;
  warmed_at: number | null;
  warmup_error: string | null;
  message: string;
}

/** No auth required — confirms ml-gateway is accepting HTTP while models may still be loading. */
export async function fetchFaceModelsStatus(): Promise<FaceModelsStatus> {
  const res = await apiClient.get<FaceModelsStatus>('/ml/faces/ping', {
    skipSuccessToast: true,
    skipToast: true,
    timeout: 15_000,
  });
  return res.data;
}

export interface FaceAnalyzeResult {
  photo_id: string;
  face_id: string;
  face_detected: boolean;
  face_count: number;
  declared_pose: string;
  detected_pose: string;
  pose_consistent: boolean;
  storage_key: string;
  indexed: boolean;
  duplicate_matches: FaceDuplicateMatch[];
  has_duplicate: boolean;
  message: string | null;
}

export async function analyzeSuspectPhoto(params: {
  file: File;
  poseType: SuspectPhotoPoseType;
  dossierDraftId: string;
  photoId: string;
  criminalName?: string;
  /** When set, indexes the face for duplicate search (submitted dossier). */
  suspectId?: string;
  replaceFaceId?: string;
}): Promise<FaceAnalyzeResult> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('pose_type', params.poseType);
  form.append('dossier_draft_id', params.dossierDraftId);
  form.append('photo_id', params.photoId);
  if (params.criminalName?.trim()) {
    form.append('criminal_name', params.criminalName.trim());
  }
  if (params.suspectId?.trim()) {
    form.append('suspect_id', params.suspectId.trim());
  }
  if (params.replaceFaceId) {
    form.append('replace_face_id', params.replaceFaceId);
  }

  const res = await apiClient.post<FaceAnalyzeResult>('/ml/faces/analyze', form, {
    skipSuccessToast: true,
    timeout: params.poseType === 'FRONT' ? 180_000 : 60_000,
  });
  return res.data;
}

/** Remove one uploaded draft photo from MinIO (and face index if faceId was indexed). */
export async function deleteSuspectDraftPhoto(params: {
  dossierDraftId: string;
  photoId: string;
  storageKey: string;
  faceId?: string | null;
}): Promise<void> {
  await apiClient.delete(`/ml/faces/photos/${params.photoId}`, {
    params: {
      dossier_draft_id: params.dossierDraftId,
      storage_key: params.storageKey,
      ...(params.faceId ? { face_id: params.faceId } : {}),
    },
    skipSuccessToast: true,
    skipToast: true,
  });
}

/** Remove all photos for a dossier draft when the wizard is discarded without submit. */
export async function discardSuspectDraftPhotos(dossierDraftId: string): Promise<void> {
  await apiClient.delete(`/ml/faces/drafts/${dossierDraftId}`, {
    skipSuccessToast: true,
    skipToast: true,
  });
}

export interface IndexSubmittedFaceResponse {
  indexed: boolean;
  face_id: string;
  suspect_id: string;
  message: string | null;
}

/** Index front face in Elasticsearch after dossier submit. */
export async function indexSubmittedSuspectFace(params: {
  suspectId: string;
  dossierDraftId: string;
  photoId: string;
  storageKey: string;
  faceId: string;
  criminalName: string;
}): Promise<IndexSubmittedFaceResponse> {
  const res = await apiClient.post<IndexSubmittedFaceResponse>(
    '/ml/faces/index-submitted',
    {
      suspect_id: params.suspectId,
      dossier_draft_id: params.dossierDraftId,
      photo_id: params.photoId,
      storage_key: params.storageKey,
      face_id: params.faceId,
      criminal_name: params.criminalName,
    },
    { skipSuccessToast: true }
  );
  return res.data;
}

/** Load stored photo bytes for UI preview (auth via apiClient). */
export async function fetchSuspectPhotoPreviewDataUrl(
  dossierDraftId: string,
  photoId: string,
  storageKey: string
): Promise<string> {
  const res = await apiClient.get<Blob>(`/ml/faces/photos/${photoId}/image`, {
    params: { dossier_draft_id: dossierDraftId, storage_key: storageKey },
    responseType: 'blob',
    skipSuccessToast: true,
    skipToast: true,
    timeout: 30_000,
  });
  return blobToPreviewDataUrl(res.data);
}
