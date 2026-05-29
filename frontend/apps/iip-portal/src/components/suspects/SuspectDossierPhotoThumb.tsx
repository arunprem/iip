import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { fetchSuspectPhotoPreviewDataUrl } from '../../api/suspectFaces';

interface SuspectDossierPhotoThumbProps {
  dossierDraftId: string | null | undefined;
  photoId: string | null | undefined;
  storageKey: string | null | undefined;
  alt?: string;
  className?: string;
  size?: 'list' | 'mugshot' | 'thumb';
}

const sizeClass: Record<NonNullable<SuspectDossierPhotoThumbProps['size']>, string> = {
  list: 'suspect-thumb--list',
  mugshot: 'suspect-thumb--mugshot',
  thumb: 'suspect-thumb--grid',
};

export function SuspectDossierPhotoThumb({
  dossierDraftId,
  photoId,
  storageKey,
  alt = '',
  className = '',
  size = 'list',
}: SuspectDossierPhotoThumbProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!dossierDraftId || !photoId || !storageKey) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    void fetchSuspectPhotoPreviewDataUrl(dossierDraftId, photoId, storageKey)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierDraftId, photoId, storageKey]);

  return (
    <div className={`suspect-thumb ${sizeClass[size]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="suspect-thumb__img" />
      ) : (
        <div className="suspect-thumb__placeholder" aria-hidden>
          <User size={size === 'mugshot' ? 28 : 16} className="text-iip-text-muted/50" />
        </div>
      )}
    </div>
  );
}
