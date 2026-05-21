import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, KeyRound, Save, UserCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { uploadProfilePhoto, type ProfileData } from '../api/profile';
import { AdminButton } from '../components/admin/AdminButton';
import { AdminFormField } from '../components/admin/AdminFormField';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { ProfilePhotoCropModal } from '../components/profile/ProfilePhotoCropModal';
import { getApiErrorMessage } from '../hooks/useIamRoles';
import { useAuthStore } from '../stores/authStore';
import { showToast } from '../stores/toastStore';
import {
  fetchProfilePhotoDataUrl,
  fileToProfilePreviewDataUrl,
} from '../utils/profilePhoto';
import { readFileAsDataUrl } from '../utils/cropImage';

const emptyProfileForm = {
  email: '',
  full_name: '',
  badge_number: '',
  department: '',
};

const emptyPasswordForm = {
  current_password: '',
  new_password: '',
  confirm_password: '',
};

export default function MyProfile() {
  const queryClient = useQueryClient();
  const refreshSessionProfile = useAuthStore((s) => s.refreshSessionProfile);
  const bumpProfilePhoto = useAuthStore((s) => s.bumpProfilePhoto);
  const setProfilePhotoDataUrl = useAuthStore((s) => s.setProfilePhotoDataUrl);
  const authUser = useAuthStore((s) => s.user);

  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const res = await apiClient.get<ProfileData>('/auth/me/profile', { skipToast: true });
      return res.data;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setProfileForm({
      email: profile.email,
      full_name: profile.full_name,
      badge_number: profile.badge_number,
      department: profile.department,
    });
  }, [profile]);

  useEffect(() => {
    let cancelled = false;

    const loadPhoto = async () => {
      if (!profile?.profile_photo_url) {
        setPhotoPreviewUrl(null);
        return;
      }
      const dataUrl = await fetchProfilePhotoDataUrl(photoVersion);
      if (cancelled || !dataUrl) {
        return;
      }
      setPhotoPreviewUrl(dataUrl);
    };

    void loadPhoto();

    return () => {
      cancelled = true;
    };
  }, [profile?.profile_photo_url, photoVersion]);

  const closeCropModal = () => {
    setCropModalOpen(false);
    setCropImageSrc(null);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch<ProfileData>('/auth/me/profile', profileForm, {
        skipSuccessToast: true,
      });
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      await refreshSessionProfile();
      showToast('success', 'Profile updated.');
    },
    onError: (err: unknown) => {
      showToast('error', getApiErrorMessage(err));
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(
        '/auth/me/password',
        {
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        },
        { skipSuccessToast: true }
      );
    },
    onSuccess: () => {
      setPasswordForm(emptyPasswordForm);
      setPasswordErrors({});
      showToast('success', 'Password changed successfully.');
    },
    onError: (err: unknown) => {
      showToast('error', getApiErrorMessage(err));
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => uploadProfilePhoto(file),
    onSuccess: async (data, file) => {
      closeCropModal();
      queryClient.setQueryData(['my-profile'], data);

      const preview = await fileToProfilePreviewDataUrl(file);
      if (preview) {
        setPhotoPreviewUrl(preview);
        setProfilePhotoDataUrl(preview);
      }

      setPhotoVersion(Date.now());
      bumpProfilePhoto();
      await refreshSessionProfile();
      showToast('success', 'Profile photo updated.');
    },
    onError: (err: unknown) => {
      showToast('error', getApiErrorMessage(err));
    },
  });

  const validateProfile = (): boolean => {
    const errors: Record<string, string> = {};
    if (!profileForm.full_name.trim()) errors.full_name = 'Full name is required.';
    if (!profileForm.email.trim()) errors.email = 'Email is required.';
    if (!profileForm.badge_number.trim()) errors.badge_number = 'PEN number is required.';
    if (!profileForm.department.trim()) errors.department = 'Department is required.';
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validatePassword = (): boolean => {
    const errors: Record<string, string> = {};
    if (!passwordForm.current_password) {
      errors.current_password = 'Current password is required.';
    }
    if (!passwordForm.new_password || passwordForm.new_password.length < 8) {
      errors.new_password = 'New password must be at least 8 characters.';
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      errors.confirm_password = 'Passwords do not match.';
    }
    if (
      passwordForm.current_password &&
      passwordForm.new_password &&
      passwordForm.current_password === passwordForm.new_password
    ) {
      errors.new_password = 'New password must differ from the current password.';
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfile()) return;
    updateProfileMutation.mutate();
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePassword()) return;
    changePasswordMutation.mutate();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage =
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif)$/i.test(file.name);
    if (!isImage) {
      showToast('error', 'Please choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('error', 'Source image must be 8 MB or smaller.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setCropImageSrc(dataUrl);
      setCropModalOpen(true);
    } catch {
      showToast('error', 'Could not open the selected image.');
    }
  };

  const handleCropConfirm = (file: File) => {
    uploadPhotoMutation.mutate(file);
  };

  const displayName = profile?.full_name || authUser?.full_name || authUser?.username || 'User';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <AdminPageLayout
      title="My profile"
      description="Update your account details, change your password, and upload your profile photo."
      icon={UserCircle}
    >
      <ProfilePhotoCropModal
        imageSrc={cropImageSrc ?? ''}
        open={cropModalOpen && Boolean(cropImageSrc)}
        onClose={closeCropModal}
        onConfirm={handleCropConfirm}
        isUploading={uploadPhotoMutation.isPending}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <section className="dashboard-card p-6 flex flex-col items-center text-center">
          <h2 className="text-sm font-semibold text-iip-text w-full text-left mb-4">Profile photo</h2>
          <div className="relative mb-4">
            <div className="h-36 w-36 rounded-full border-2 border-iip-border bg-iip-bg overflow-hidden flex items-center justify-center">
              {photoPreviewUrl ? (
                <img
                  src={photoPreviewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setPhotoPreviewUrl(null)}
                />
              ) : (
                <span className="text-3xl font-bold text-iip-primary">{initials}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotoMutation.isPending || isLoading}
              className="absolute bottom-0 right-0 p-2.5 rounded-full bg-iip-primary text-white shadow-md hover:bg-iip-primary-hover disabled:opacity-50"
              title="Change photo"
            >
              <Camera size={18} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <p className="text-xs text-iip-text-muted">
            JPEG, PNG, or WebP · crop before upload
          </p>
          <p className="text-sm font-medium text-iip-text mt-3">{displayName}</p>
          <p className="text-xs text-iip-text-muted">@{profile?.username ?? authUser?.username}</p>
        </section>

        <div className="space-y-6">
          <section className="dashboard-card p-6">
            <h2 className="text-sm font-semibold text-iip-text mb-4">Profile information</h2>
            {isLoading ? (
              <p className="text-sm text-iip-text-muted">Loading…</p>
            ) : (
              <form onSubmit={handleProfileSubmit} className="grid gap-4 sm:grid-cols-2">
                <AdminFormField id="profile-username" label="Username" className="sm:col-span-2">
                  <input
                    id="profile-username"
                    type="text"
                    value={profile?.username ?? ''}
                    disabled
                    className="form-control opacity-70 cursor-not-allowed"
                  />
                </AdminFormField>
                <AdminFormField id="profile-full-name" label="Full name" error={profileErrors.full_name}>
                  <input
                    id="profile-full-name"
                    type="text"
                    value={profileForm.full_name}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, full_name: e.target.value }))
                    }
                    className={`form-control ${profileErrors.full_name ? 'is-invalid' : ''}`}
                  />
                </AdminFormField>
                <AdminFormField id="profile-email" label="Email" error={profileErrors.email}>
                  <input
                    id="profile-email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                    className={`form-control ${profileErrors.email ? 'is-invalid' : ''}`}
                  />
                </AdminFormField>
                <AdminFormField id="profile-badge" label="PEN number" error={profileErrors.badge_number}>
                  <input
                    id="profile-badge"
                    type="text"
                    value={profileForm.badge_number}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, badge_number: e.target.value }))
                    }
                    className={`form-control ${profileErrors.badge_number ? 'is-invalid' : ''}`}
                  />
                </AdminFormField>
                <AdminFormField id="profile-department" label="Department" error={profileErrors.department}>
                  <input
                    id="profile-department"
                    type="text"
                    value={profileForm.department}
                    onChange={(e) =>
                      setProfileForm((f) => ({ ...f, department: e.target.value }))
                    }
                    className={`form-control ${profileErrors.department ? 'is-invalid' : ''}`}
                  />
                </AdminFormField>
                <AdminFormField id="profile-clearance" label="Clearance level" className="sm:col-span-2">
                  <input
                    id="profile-clearance"
                    type="text"
                    value={profile?.clearance_level ?? ''}
                    disabled
                    className="form-control opacity-70 cursor-not-allowed"
                  />
                </AdminFormField>
                <div className="sm:col-span-2 flex justify-end pt-1">
                  <AdminButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={updateProfileMutation.isPending}
                  >
                    <Save size={15} aria-hidden />
                    {updateProfileMutation.isPending ? 'Saving…' : 'Save profile'}
                  </AdminButton>
                </div>
              </form>
            )}
          </section>

          <section className="dashboard-card p-6">
            <h2 className="text-sm font-semibold text-iip-text mb-1 flex items-center gap-2">
              <KeyRound size={16} className="text-iip-text-muted" />
              Change password
            </h2>
            <p className="text-xs text-iip-text-muted mb-4">
              Use at least 8 characters. You will need your current password.
            </p>
            <form onSubmit={handlePasswordSubmit} className="grid gap-4 max-w-md">
              <AdminFormField id="pwd-current" label="Current password" error={passwordErrors.current_password}>
                <input
                  id="pwd-current"
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.current_password}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, current_password: e.target.value }))
                  }
                  className={`form-control ${passwordErrors.current_password ? 'is-invalid' : ''}`}
                />
              </AdminFormField>
              <AdminFormField id="pwd-new" label="New password" error={passwordErrors.new_password}>
                <input
                  id="pwd-new"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.new_password}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, new_password: e.target.value }))
                  }
                  className={`form-control ${passwordErrors.new_password ? 'is-invalid' : ''}`}
                />
              </AdminFormField>
              <AdminFormField id="pwd-confirm" label="Confirm new password" error={passwordErrors.confirm_password}>
                <input
                  id="pwd-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm_password}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, confirm_password: e.target.value }))
                  }
                  className={`form-control ${passwordErrors.confirm_password ? 'is-invalid' : ''}`}
                />
              </AdminFormField>
              <div className="flex justify-end pt-1">
                <AdminButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={changePasswordMutation.isPending}
                >
                  <KeyRound size={15} aria-hidden />
                  {changePasswordMutation.isPending ? 'Updating…' : 'Update password'}
                </AdminButton>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AdminPageLayout>
  );
}
