import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, User } from 'lucide-react';
import { scoreSuspectMatches, type ScoredMatch } from '../../api/suspectDossiers';
import { fetchSuspectPhotoPreviewDataUrl } from '../../api/suspectFaces';
import type { SuspectDossierDraft, SuspectLinkDecision } from '../../pages/suspects/suspectTypes';
import { AdminButton } from '../admin/AdminButton';

interface SuspectLinkReviewProps {
  draft: SuspectDossierDraft;
  linkDecision: SuspectLinkDecision | null;
  onLinkDecision: (decision: SuspectLinkDecision | null) => void;
}

function MatchThumbnail({ match }: { match: ScoredMatch }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!match.photo_id || !match.storage_key || !match.dossier_draft_id) return;
    let cancelled = false;
    void fetchSuspectPhotoPreviewDataUrl(
      match.dossier_draft_id,
      match.photo_id,
      match.storage_key
    )
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [match.dossier_draft_id, match.photo_id, match.storage_key]);

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

function isOtherMaster(match: ScoredMatch, draft: SuspectDossierDraft): boolean {
  if (!draft.editingMasterSuspectId) return true;
  return match.master_suspect_id !== draft.editingMasterSuspectId;
}

export function SuspectLinkReview({
  draft,
  linkDecision,
  onLinkDecision,
}: SuspectLinkReviewProps) {
  const [matches, setMatches] = useState<ScoredMatch[]>([]);
  const [loading, setLoading] = useState(false);

  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  const hasFaceMatches = (front?.duplicateMatches.length ?? 0) > 0;
  const canScore =
    draft.criminalName.trim().length > 0 || draft.fathersName.trim().length > 0;

  useEffect(() => {
    if (!canScore && !hasFaceMatches) {
      setMatches([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void scoreSuspectMatches(draft)
      .then((rows) => {
        if (!cancelled) setMatches(rows.filter((m) => isOtherMaster(m, draft)));
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    draft.criminalName,
    draft.fathersName,
    draft.aliasName,
    draft.dateOfBirth,
    draft.yearOfBirth,
    draft.address.pincode,
    draft.address.district,
    draft.address.villageTownCity,
    draft.editingDossierId,
    draft.editingMasterSuspectId,
    hasFaceMatches,
    front?.duplicateMatches,
    canScore,
  ]);

  const faceFallback: ScoredMatch[] = useMemo(
    () =>
      (front?.duplicateMatches ?? [])
        .filter((m) => m.master_suspect_id ?? m.suspect_id)
        .map((m) => ({
          master_suspect_id: (m.master_suspect_id ?? m.suspect_id)!,
          dossier_id: m.dossier_id ?? null,
          dossier_draft_id: m.dossier_draft_id,
          criminal_name: m.criminal_name?.trim() || 'Unnamed suspect',
          alias_name: null,
          office_name: m.office_name ?? null,
          face_similarity: m.similarity_score,
          match_score: m.match_score ?? 0,
          tier: (m.tier ?? 'WEAK') as ScoredMatch['tier'],
          storage_key: m.storage_key,
          photo_id: m.photo_id ?? null,
        }))
        .filter((m) => isOtherMaster(m, draft)),
    [front?.duplicateMatches, draft.editingMasterSuspectId]
  );

  const displayMatches = useMemo(() => {
    const scored = matches.length > 0 ? matches : faceFallback;
    return scored.filter((m) => m.tier !== 'BELOW_FACE_GATE' && (m.match_score > 0 || m.face_similarity >= 0.85));
  }, [matches, faceFallback]);

  if (!canScore && !hasFaceMatches) return null;
  if (loading) return null;
  if (displayMatches.length === 0) return null;

  const strongMatches = displayMatches.filter((m) => m.tier === 'STRONG');
  const weakMatches = displayMatches.filter((m) => m.tier === 'WEAK');
  const identityMatches = displayMatches.filter((m) => m.tier === 'IDENTITY');

  const matchDetailLine = (m: ScoredMatch) => {
    const facePart =
      m.face_similarity >= 0.01 ? `${Math.round(m.face_similarity * 100)}% face · ` : '';
    const tierLabel =
      m.tier === 'STRONG'
        ? 'Strong match'
        : m.tier === 'IDENTITY'
          ? 'Identity overlap'
          : 'Review recommended';
    return `${facePart}score ${m.match_score}${m.office_name ? ` · ${m.office_name}` : ''} · ${tierLabel}`;
  };

  const confirmLink = (match: ScoredMatch) => {
    onLinkDecision({
      masterSuspectId: match.master_suspect_id,
      matchedDossierId: match.dossier_id ?? undefined,
      faceSimilarity: match.face_similarity,
      matchScore: match.match_score,
      decision: 'CONFIRMED_LINK',
    });
  };

  const rejectAll = () => {
    const top = strongMatches[0] ?? displayMatches[0];
    if (top) {
      onLinkDecision({
        masterSuspectId: top.master_suspect_id,
        matchedDossierId: top.dossier_id ?? undefined,
        faceSimilarity: top.face_similarity,
        matchScore: top.match_score,
        decision: 'REJECTED_LINK',
      });
    } else {
      onLinkDecision(null);
    }
  };

  return (
    <div className="suspect-report__annex">
      <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-4 space-y-3">
        <div className="flex gap-2 items-start">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-iip-text">Possible link to existing profile</p>
            <p className="text-xs text-iip-text-muted leading-relaxed">
              Compare face and identity fields (name, father&apos;s name, DOB, address). Confirm only
              if this is the same person — the dossier will attach to the master profile for that
              suspect across units.
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {displayMatches.map((m) => (
            <li
              key={m.master_suspect_id}
              className="dossier-duplicate-match-row flex gap-3 items-center rounded-lg border border-iip-border/60 bg-iip-surface/50 p-2"
            >
              <MatchThumbnail match={m} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-iip-text truncate">{m.criminal_name}</p>
                <p className="text-[11px] text-iip-text-muted mt-0.5">{matchDetailLine(m)}</p>
              </div>
              {linkDecision?.masterSuspectId === m.master_suspect_id &&
              linkDecision.decision === 'CONFIRMED_LINK' ? (
                <span className="text-[10px] font-semibold text-emerald-600 uppercase">Linked</span>
              ) : (
                <AdminButton type="button" variant="secondary" size="sm" onClick={() => confirmLink(m)}>
                  <Link2 size={14} />
                  Same person
                </AdminButton>
              )}
            </li>
          ))}
        </ul>

        {strongMatches.length > 0 && !linkDecision && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            A strong match was found — confirm same person or reject before submitting.
          </p>
        )}

        {identityMatches.length > 0 && strongMatches.length === 0 && !linkDecision && (
          <p className="text-xs text-iip-text-muted">
            Identity overlap without face confirmation — review before linking or submit as a new
            profile.
          </p>
        )}

        {weakMatches.length > 0 &&
          strongMatches.length === 0 &&
          identityMatches.length === 0 &&
          !linkDecision && (
            <p className="text-xs text-iip-text-muted">
              Weak match only — you may submit without linking; supervisor review recommended.
            </p>
          )}

        {linkDecision?.decision === 'CONFIRMED_LINK' ? (
          <p className="text-xs text-emerald-600">This dossier will link to the selected master profile.</p>
        ) : (
          <AdminButton type="button" variant="ghost" size="sm" onClick={rejectAll}>
            Different person — new master profile
          </AdminButton>
        )}
      </div>
    </div>
  );
}
