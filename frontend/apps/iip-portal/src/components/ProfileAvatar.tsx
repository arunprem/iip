import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { fetchProfilePhotoDataUrl } from '../utils/profilePhoto';

interface ProfileAvatarProps {
  name: string;
  hasPhoto: boolean;
  /** Bust cached photo fetch after upload (e.g. auth store revision). */
  photoRevision?: number;
  className?: string;
  textClassName?: string;
}

export function ProfileAvatar({
  name,
  hasPhoto,
  photoRevision = 0,
  className = 'h-9 w-9',
  textClassName = 'text-sm',
}: ProfileAvatarProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const cachedPhoto = useAuthStore((s) => s.profilePhotoDataUrl);
  const setProfilePhotoDataUrl = useAuthStore((s) => s.setProfilePhotoDataUrl);

  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const initial = (name.trim().charAt(0) || '?').toUpperCase();

  useEffect(() => {
    let cancelled = false;

    if (!hasPhoto) {
      setPhotoSrc(null);
      return;
    }

    if (!accessToken) {
      setPhotoSrc(cachedPhoto);
      return;
    }

    const load = async () => {
      const dataUrl = await fetchProfilePhotoDataUrl(photoRevision || undefined);
      if (cancelled) {
        return;
      }
      setPhotoSrc(dataUrl);
      if (dataUrl) {
        setProfilePhotoDataUrl(dataUrl);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [hasPhoto, photoRevision, accessToken, cachedPhoto, setProfilePhotoDataUrl]);

  return (
    <div
      className={`${className} shrink-0 rounded-full bg-iip-primary/15 flex items-center justify-center overflow-hidden text-iip-primary font-semibold ${textClassName}`}
    >
      {photoSrc ? (
        <img
          src={photoSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPhotoSrc(null)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
