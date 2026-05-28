import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { AdminButton } from '../../admin/AdminButton';
import type { SuspectDossierDraft, WizardStepId } from '../../../pages/suspects/suspectTypes';

interface SuspectReviewStepProps {
  draft: SuspectDossierDraft;
  onEditStep: (step: WizardStepId) => void;
}

function ReviewBlock({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: WizardStepId;
  onEdit: (step: WizardStepId) => void;
  children: ReactNode;
}) {
  return (
    <section className="dossier-review-block">
      <div className="dossier-review-block-header">
        <h3 className="text-sm font-semibold text-iip-text">{title}</h3>
        <AdminButton type="button" variant="ghost" size="xs" onClick={() => onEdit(step)}>
          <Pencil size={14} />
          Edit
        </AdminButton>
      </div>
      <div className="dossier-review-block-body">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="dossier-review-row">
      <dt className="dossier-review-label">{label}</dt>
      <dd className="dossier-review-value">{value}</dd>
    </div>
  );
}

export function SuspectReviewStep({ draft, onEditStep }: SuspectReviewStepProps) {
  const addr = draft.address;
  const addressLine = [
    addr.houseNo,
    addr.houseName,
    addr.streetName,
    addr.locality,
    addr.tehsil,
    addr.villageTownCity,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-4">
      <p className="text-sm text-iip-text-muted">
        Review the dossier below. Saving will be enabled once the backend is connected — for now
        this confirms your screen design.
      </p>

      <div className="dossier-review-layout">
        {draft.photos.some((p) => p.previewUrl) && (
          <div className="dossier-review-photos-grid">
            {draft.photos
              .filter((p) => p.previewUrl)
              .map((p) => (
                <figure key={p.id} className="dossier-review-photo-card">
                  <img src={p.previewUrl!} alt="" />
                  <figcaption>
                    {p.label}
                    {p.faceId && (
                      <span className="text-emerald-600 dark:text-emerald-400"> · FRS indexed</span>
                    )}
                  </figcaption>
                </figure>
              ))}
          </div>
        )}

        <div className="space-y-3 min-w-0 flex-1">
          <ReviewBlock title="Photographs" step="photo" onEdit={onEditStep}>
            <ul className="text-sm space-y-1">
              {draft.photos
                .filter((p) => p.status === 'validated' || p.status === 'duplicate')
                .map((p) => (
                  <li key={p.id}>
                    <span className="font-medium">{p.label}</span>
                    <span className="text-iip-text-muted">
                      {' '}
                      · {p.detectedPose ?? p.poseType}
                      {p.duplicateMatches.length > 0 && ' · similar match flagged'}
                    </span>
                  </li>
                ))}
              {!draft.photos.some((p) => p.poseType === 'FRONT' && p.faceId) && (
                <li className="text-red-600">Front photo not indexed</li>
              )}
            </ul>
          </ReviewBlock>

          <ReviewBlock title="Identity" step="identity" onEdit={onEditStep}>
            <dl className="space-y-1">
              <Row label="Criminal name" value={draft.criminalName} />
              <Row label="Alias" value={draft.aliasName} />
              <Row label="Gender" value={draft.gender} />
              <Row label="Father's name" value={draft.fathersName} />
              <Row label="Date of birth" value={draft.dateOfBirth} />
              <Row label="Age" value={draft.age} />
              <Row label="Place of birth" value={draft.placeOfBirth} />
              <Row label="Religion" value={draft.religion} />
              <Row label="Category" value={draft.category} />
            </dl>
          </ReviewBlock>

          <ReviewBlock title="Address" step="address" onEdit={onEditStep}>
            <dl className="space-y-1">
              <Row
                label="Address type"
                value={addr.isPermanent ? 'Permanent' : 'Current / temporary'}
              />
              <Row label="Address" value={addressLine} />
              <Row label="Pincode" value={addr.pincode} />
              <Row
                label="Location"
                value={[addr.district, addr.state, addr.country].filter(Boolean).join(', ')}
              />
              <Row label="Police station" value={addr.policeStation} />
              {(addr.latitude || addr.longitude) && (
                <Row label="Coordinates" value={`${addr.latitude}, ${addr.longitude}`} />
              )}
            </dl>
          </ReviewBlock>

          <ReviewBlock title="Contacts" step="contacts" onEdit={onEditStep}>
            {draft.contacts.length === 0 ? (
              <p className="text-sm text-iip-text-muted">None recorded</p>
            ) : (
              <ul className="space-y-2">
                {draft.contacts.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium text-iip-text">{c.type}</span>
                    <span className="text-iip-text-muted mx-2">·</span>
                    {c.value || '—'}
                  </li>
                ))}
              </ul>
            )}
          </ReviewBlock>

          <ReviewBlock title="Social media" step="social" onEdit={onEditStep}>
            {draft.socialAccounts.length === 0 ? (
              <p className="text-sm text-iip-text-muted">None recorded</p>
            ) : (
              <ul className="space-y-2">
                {draft.socialAccounts.map((s) => (
                  <li key={s.id} className="text-sm">
                    <span className="font-medium text-iip-text">{s.platform}</span>
                    <span className="text-iip-text-muted mx-2">·</span>
                    {s.details || '—'}
                  </li>
                ))}
              </ul>
            )}
          </ReviewBlock>

          <ReviewBlock title="Relatives & whereabouts" step="relatives" onEdit={onEditStep}>
            {draft.relatives.length === 0 ? (
              <p className="text-sm text-iip-text-muted">None recorded</p>
            ) : (
              <ul className="space-y-3">
                {draft.relatives.map((r) => (
                  <li key={r.id} className="text-sm border-l-2 border-iip-primary/30 pl-3">
                    <p className="font-medium text-iip-text">{r.name || 'Unnamed'}</p>
                    <p className="text-iip-text-muted text-xs mt-0.5">
                      {[r.relation, r.gender, r.occupation].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </ReviewBlock>
        </div>
      </div>
    </div>
  );
}
