import { apiClient } from '../api/http';

/** Load profile photo with auth headers; returns a blob URL to revoke when done. */
export async function fetchProfilePhotoObjectUrl(cacheBust?: number): Promise<string | null> {
  try {
    const query = cacheBust != null ? `?t=${cacheBust}` : '';
    const res = await apiClient.get(`/auth/me/photo${query}`, {
      responseType: 'blob',
      skipToast: true,
    });
    return URL.createObjectURL(res.data);
  } catch {
    return null;
  }
}
