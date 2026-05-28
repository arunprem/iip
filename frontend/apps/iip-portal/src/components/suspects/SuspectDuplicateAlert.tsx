import { useEffect, useState } from 'react';
import { AlertTriangle, User } from 'lucide-react';
import { fetchSuspectPhotoPreviewDataUrl } from '../../api/suspectFaces';
import type { FaceDuplicateMatch } from '../../pages/suspects/suspectTypes';
import { AdminButton } from '../admin/AdminButton';

interface SuspectDuplicateAlertProps {
  matches: FaceDuplicateMatch[];
  acknowledged: boolean;
  onAcknowledge: () => void;
}

function photoIdFromStorageKey(storageKey: string | null): string | null {
  if (!storageKey) return null;
  const name = storageKey.split('/').pop();
  if (!name) return null;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function DuplicateMatchThumbnail({ match }: { match: FaceDuplicateMatch }) {
  const [src, setSrc] = useState<string | null>(null);
  const [, setFailed] = useState(false);

  const photoId = match.photo_id ?? photoIdFromStorageKey(match.storage_key);
  const dossierId = match.dossier_draft_id;

  useEffect(() => {
    if (!dossierId || !photoId || !match.storage_key) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    void fetchSuspectPhotoPreviewDataUrl(dossierId, photoId, match.storage_key)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierId, photoId, match.storage_key]);

  return (
    <div className="dossier-duplicate-thumb">
      {src ? (
        <img src={src} alt="" className="dossier-duplicate-thumb-img" />
      ) : (
        <div className="dossier-duplicate-thumb-placeholder">
          <User size={18} className="text-iip-text-muted/60" />
        </div>
      )}
    </div>
  );
}

function matchLabel(match: FaceDuplicateMatch): string {
  return match.criminal_name?.trim() || 'Unnamed suspect';
}

function matchMeta(match: FaceDuplicateMatch): string {
  const pct = Math.round(match.similarity_score * 100);
  if (match.suspect_id) {
    return `${pct}% match · Suspect ${match.suspect_id.slice(0, 8)}…`;
  }
  return `${pct}% match`;
}

export function SuspectDuplicateAlert({
  matches,
  acknowledged,
  onAcknowledge,
}: SuspectDuplicateAlertProps) {
  if (matches.length === 0) return null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        acknowledged
          ? 'border-amber-500/30 bg-amber-500/5'
          : 'border-red-500/40 bg-red-500/10'
      }`}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle
          size={22}
          className={acknowledged ? 'text-amber-600 shrink-0' : 'text-red-600 shrink-0'}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-semibold text-iip-text">
            {acknowledged
              ? 'Similar face acknowledged — you may continue if this is a different person'
              : 'Possible duplicate: similar face on a submitted dossier'}
          </p>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li
                key={m.face_id}
                className="dossier-duplicate-match-row flex gap-3 items-center rounded-lg border border-iip-border/60 bg-iip-surface/50 p-2"
              >
                <DuplicateMatchThumbnail match={m} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-iip-text truncate">{matchLabel(m)}</p>
                  <p className="text-[11px] text-iip-text-muted mt-0.5">{matchMeta(m)}</p>
                </div>
              </li>
            ))}
          </ul>
          {!acknowledged && (
            <AdminButton type="button" variant="secondary" size="sm" onClick={onAcknowledge}>
              Different person — continue anyway
            </AdminButton>
          )}
        </div>
      </div>
    </div>
  );
}
