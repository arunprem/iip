import { apiClient } from './http';

export interface FingerprintSubmission {
  id: string;
  suspectId: string;
  dossierId: string;
  masterSuspectId: string;
  criminalName: string;
  fingerPosition: string;
  templateFormat: string;
  templateHash: string;
  qualityScore: number | null;
  deviceModel: string | null;
  source: string;
  status: string;
  capturedBy: string | null;
  capturedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  officeName: string | null;
}

export interface FingerprintSubmissionListResponse {
  items: FingerprintSubmission[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listFingerprintSubmissions(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<FingerprintSubmissionListResponse> {
  const res = await apiClient.get<FingerprintSubmissionListResponse>(
    '/intelligence/fingerprint-submissions',
    {
      params: {
        status: params?.status ?? 'PENDING',
        page: params?.page ?? 1,
        page_size: params?.pageSize ?? 50,
      },
      skipSuccessToast: true,
    }
  );
  return res.data;
}

export async function approveFingerprintSubmission(
  submissionId: string,
  reviewNotes?: string
): Promise<FingerprintSubmission> {
  const res = await apiClient.post<FingerprintSubmission>(
    `/intelligence/fingerprint-submissions/${submissionId}/approve`,
    { reviewNotes: reviewNotes?.trim() || undefined }
  );
  return res.data;
}

export async function rejectFingerprintSubmission(
  submissionId: string,
  reviewNotes?: string
): Promise<FingerprintSubmission> {
  const res = await apiClient.post<FingerprintSubmission>(
    `/intelligence/fingerprint-submissions/${submissionId}/reject`,
    { reviewNotes: reviewNotes?.trim() || undefined }
  );
  return res.data;
}

export async function fetchSubmissionPreviewDataUrl(
  submissionId: string
): Promise<string> {
  const res = await apiClient.get<Blob>(`/intelligence/fingerprint-submissions/${submissionId}/image`, {
    responseType: 'blob',
    skipSuccessToast: true,
    skipToast: true,
    timeout: 30_000,
  });
  
  if (!(res.data instanceof Blob) || res.data.size === 0) {
    throw new Error('Empty image response');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(res.data);
  });
}

