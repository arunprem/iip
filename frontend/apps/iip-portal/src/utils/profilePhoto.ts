import { apiClient } from '../api/http';
import { readFileAsDataUrl } from './cropImage';

function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (!(blob instanceof Blob) || blob.size === 0) {
    return Promise.resolve(null);
  }
  const type = blob.type || 'image/jpeg';
  if (!type.startsWith('image/')) {
    return Promise.resolve(null);
  }
  return readFileAsDataUrl(
    blob instanceof File ? blob : new File([blob], 'profile.jpg', { type })
  );
}

/** Load profile photo as a data URL (works reliably in img src; no blob URL lifecycle issues). */
export async function fetchProfilePhotoDataUrl(cacheBust?: number): Promise<string | null> {
  try {
    const query = cacheBust != null ? `?t=${cacheBust}` : '';
    const res = await apiClient.get(`/auth/me/photo${query}`, {
      responseType: 'blob',
      skipToast: true,
    });
    return await blobToDataUrl(res.data as Blob);
  } catch {
    return null;
  }
}

/** Preview an uploaded/cropped file immediately in the profile placeholder. */
export async function fileToProfilePreviewDataUrl(file: File | Blob): Promise<string | null> {
  try {
    const typed =
      file instanceof File
        ? file
        : new File([file], 'profile.jpg', { type: file.type || 'image/jpeg' });
    return await readFileAsDataUrl(typed);
  } catch {
    return null;
  }
}
