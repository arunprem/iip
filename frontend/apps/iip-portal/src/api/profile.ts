import { apiClient } from './http';

export interface ProfileData {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  badge_number: string;
  department: string;
  clearance_level: string;
  profile_photo_url: string | null;
}

export async function uploadProfilePhoto(file: File | Blob, filename = 'profile.jpg'): Promise<ProfileData> {
  const form = new FormData();
  form.append('file', file, filename);

  const res = await apiClient.post<ProfileData>('/auth/me/photo', form, {
    skipSuccessToast: true,
  });
  return res.data;
}
