import { useEffect, useState } from 'react';
import { AlertTriangle, Link2, User } from 'lucide-react';
import { fetchSuspectPhotoPreviewDataUrl } from '../../api/suspectFaces';
import type { FaceDuplicateMatch, SuspectLinkDecision } from '../../pages/suspects/suspectTypes';
import { AdminButton } from '../admin/AdminButton';

interface SuspectDuplicateAlertProps {
  matches: FaceDuplicateMatch[];
  linkDecision: SuspectLinkDecision | null;
  onConfirmLink: (match: FaceDuplicateMatch) => void;
  onRejectLink: () => void;
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

  const photoId = match.photo_id ?? photoIdFromStorageKey(match.storage_key);
  const dossierDraftId = match.dossier_draft_id;

  useEffect(() => {
    if (!dossierDraftId || !photoId || !match.storage_key) return;
    let cancelled = false;
    void fetchSuspectPhotoPreviewDataUrl(dossierDraftId, photoId, match.storage_key)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierDraftId, photoId, match.storage_key]);

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

function masterId(match: FaceDuplicateMatch): string | null {
  return match.master_suspect_id ?? match.suspect_id;
}

function matchLabel(match: FaceDuplicateMatch): string {
  return match.criminal_name?.trim() || 'Unnamed suspect';
}

function matchMeta(match: FaceDuplicateMatch): string {
  const pct = Math.round(match.similarity_score * 100);
  const mid = masterId(match);
  const parts = [`${pct}% face match`];
  if (match.office_name) parts.push(match.office_name);
  else if (mid) parts.push(`Profile ${mid.slice(0, 8)}…`);
  return parts.join(' · ');
}

export function SuspectDuplicateAlert({
  matches,
  linkDecision,
  onConfirmLink,
  onRejectLink,
}: SuspectDuplicateAlertProps) {
  if (matches.length === 0) return null;

  const linked = linkDecision?.decision === 'CONFIRMED_LINK';
  const rejected = linkDecision?.decision === 'REJECTED_LINK';
  const resolved = linked || rejected;

  return (
    <div
      className={`rounded-xl border p-4 ${
        linked
          ? 'border-emerald-500/35 bg-emerald-500/5'
          : rejected
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-red-500/40 bg-red-500/10'
      }`}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertTriangle
          size={22}
          className={
            linked
              ? 'text-emerald-600 shrink-0'
              : rejected
                ? 'text-amber-600 shrink-0'
                : 'text-red-600 shrink-0'
          }
        />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-semibold text-iip-text">
            {linked
              ? 'Linked to existing master profile — continue with dossier details'
              : rejected
                ? 'Marked as different person — continue with a new master profile'
                : 'Possible duplicate: similar face on a submitted dossier'}
          </p>
          {!resolved && (
            <p className="text-xs text-iip-text-muted leading-relaxed">
              If this is the same person, link to the existing master profile. Otherwise choose
              different person to create a new profile.
            </p>
          )}

          <ul className="space-y-2">
            {matches.map((m) => {
              const mid = masterId(m);
              const isSelected =
                linked && mid && linkDecision?.masterSuspectId === mid;
              return (
                <li
                  key={m.face_id}
                  className="dossier-duplicate-match-row flex flex-wrap gap-2 sm:gap-3 items-center rounded-lg border border-iip-border/60 bg-iip-surface/50 p-2"
                >
                  <DuplicateMatchThumbnail match={m} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-iip-text truncate">{matchLabel(m)}</p>
                    <p className="text-[11px] text-iip-text-muted mt-0.5">{matchMeta(m)}</p>
                  </div>
                  {!resolved && mid && (
                    <AdminButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onConfirmLink(m)}
                    >
                      <Link2 size={14} />
                      Same person
                    </AdminButton>
                  )}
                  {isSelected && (
                    <span className="text-[10px] font-semibold text-emerald-600 uppercase">
                      Linked
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {!resolved && (
            <div className="flex flex-wrap gap-2 pt-1">
              <AdminButton type="button" variant="ghost" size="sm" onClick={onRejectLink}>
                Different person — new profile
              </AdminButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
