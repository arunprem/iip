import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { SuspectDossierPhotoThumb } from '../SuspectDossierPhotoThumb';
import { SuspectLinkReview } from '../SuspectLinkReview';

const KERALA_POLICE_LOGO = '/kerala-police-logo-transparent.png';
import type { SuspectAddress, SuspectDossierDraft, WizardStepId } from '../../../pages/suspects/suspectTypes';

interface SuspectReviewStepProps {
  draft: SuspectDossierDraft;
  onEditStep: (step: WizardStepId) => void;
  onLinkDecision: (decision: SuspectDossierDraft['linkDecision']) => void;
}

function ReportSection({
  number,
  title,
  step,
  onEdit,
  children,
}: {
  number: string;
  title: string;
  step: WizardStepId;
  onEdit: (step: WizardStepId) => void;
  children: ReactNode;
}) {
  return (
    <section className="suspect-report__section group">
      <div className="suspect-report__section-head">
        <h2 className="suspect-report__section-title">
          <span className="suspect-report__section-num">{number}</span>
          {title}
        </h2>
        <button
          type="button"
          className="suspect-report__edit-btn"
          onClick={() => onEdit(step)}
          aria-label={`Edit ${title}`}
          title={`Edit ${title}`}
        >
          <Pencil size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="suspect-report__section-body">{children}</div>
    </section>
  );
}

function FieldTable({ children }: { children: ReactNode }) {
  return (
    <table className="suspect-report__table">
      <tbody>{children}</tbody>
    </table>
  );
}

function FieldRow({
  label,
  value,
  colSpan,
}: {
  label: string;
  value: string;
  colSpan?: boolean;
}) {
  const text = value?.trim() || '—';
  if (colSpan) {
    return (
      <tr className="suspect-report__field-row suspect-report__field-row--full">
        <th scope="row">{label}</th>
        <td colSpan={3}>{text}</td>
      </tr>
    );
  }
  return (
    <tr className="suspect-report__field-row">
      <th scope="row">{label}</th>
      <td>{text}</td>
    </tr>
  );
}

function FieldPair({
  left,
  right,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
}) {
  return (
    <tr className="suspect-report__field-row">
      <th scope="row">{left.label}</th>
      <td>{left.value?.trim() || '—'}</td>
      <th scope="row">{right.label}</th>
      <td>{right.value?.trim() || '—'}</td>
    </tr>
  );
}

function formatReportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return new Date().toLocaleDateString('en-IN');
  }
}

function shortDraftId(id: string): string {
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
}

function ReportPhoto({
  photo,
  dossierDraftId,
  alt,
  size,
  className,
}: {
  photo: SuspectDossierDraft['photos'][number];
  dossierDraftId: string;
  alt: string;
  size: 'mugshot' | 'thumb';
  className?: string;
}) {
  if (photo.previewUrl) {
    return <img src={photo.previewUrl} alt={alt} className={className} />;
  }
  if (photo.storageKey) {
    return (
      <SuspectDossierPhotoThumb
        dossierDraftId={dossierDraftId}
        photoId={photo.id}
        storageKey={photo.storageKey}
        alt={alt}
        size={size}
        className={className}
      />
    );
  }
  return null;
}

function formatAddressLine(addr: SuspectAddress): string {
  return [
    addr.houseNo,
    addr.houseName,
    addr.streetName,
    addr.locality,
    addr.tehsil,
    addr.villageTownCity,
  ]
    .filter(Boolean)
    .join(', ');
}

function AddressReportBlock({ title, addr }: { title: string; addr: SuspectAddress }) {
  const addressLine = formatAddressLine(addr);
  return (
    <div className="suspect-report__address-block space-y-0">
      <p className="text-xs font-semibold text-iip-text uppercase tracking-wide mb-2">{title}</p>
      <FieldTable>
        <FieldRow label="Full address" value={addressLine} colSpan />
        <FieldPair
          left={{ label: 'PIN code', value: addr.pincode }}
          right={{ label: 'Police station', value: addr.policeStation }}
        />
        <FieldPair
          left={{ label: 'District', value: addr.district }}
          right={{ label: 'State', value: addr.state }}
        />
        <FieldRow label="Country" value={addr.country} colSpan />
        {(addr.latitude || addr.longitude) && (
          <FieldRow
            label="Geo coordinates"
            value={`${addr.latitude || '—'}, ${addr.longitude || '—'}`}
            colSpan
          />
        )}
      </FieldTable>
    </div>
  );
}

export function SuspectReviewStep({ draft, onEditStep, onLinkDecision }: SuspectReviewStepProps) {
  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  const galleryPhotos = draft.photos.filter(
    (p) =>
      (p.previewUrl || p.storageKey) &&
      (p.status === 'validated' || p.status === 'duplicate')
  );
  const annexPhotos = galleryPhotos.filter((p) => p.poseType !== 'FRONT');

  const linkLabel =
    draft.linkDecision?.decision === 'CONFIRMED_LINK'
      ? 'Linked to existing master profile'
      : draft.linkDecision?.decision === 'REJECTED_LINK'
        ? 'Recorded as different person (new master)'
        : null;

  return (
    <div className="suspect-report-wrap">
      <p className="suspect-report-wrap__hint">
        Final review before watch-list submission. Hover a section and use the edit control to
        return to that step.
      </p>

      <article className="suspect-report" role="document" aria-label="Suspect dossier report">
        <header className="suspect-report__masthead">
          <div className="suspect-report__masthead-emblem">
            <div className="suspect-report__masthead-logo">
              <img
                src={KERALA_POLICE_LOGO}
                alt="Kerala Police emblem"
                className="suspect-report__masthead-logo-img"
                draggable={false}
              />
            </div>
          </div>
          <div className="suspect-report__masthead-text">
            <p className="suspect-report__org">Government of Kerala · Kerala Police</p>
            <h1 className="suspect-report__title">Suspect intelligence dossier</h1>
            <p className="suspect-report__subtitle">
              Watch-list nomination — analyst submission (draft preview)
            </p>
          </div>
          <div className="suspect-report__stamp" aria-hidden>
            <span>DRAFT</span>
          </div>
        </header>

        <div className="suspect-report__meta">
          <div className="suspect-report__meta-item">
            <span className="suspect-report__meta-label">Reference</span>
            <span className="suspect-report__meta-value">DOS-{shortDraftId(draft.dossierDraftId)}</span>
          </div>
          <div className="suspect-report__meta-item">
            <span className="suspect-report__meta-label">Report date</span>
            <span className="suspect-report__meta-value">{formatReportDate(draft.updatedAt)}</span>
          </div>
          <div className="suspect-report__meta-item">
            <span className="suspect-report__meta-label">Subject</span>
            <span className="suspect-report__meta-value suspect-report__meta-value--emphasis">
              {draft.criminalName.trim() || 'Unnamed subject'}
            </span>
          </div>
          <div className="suspect-report__meta-item">
            <span className="suspect-report__meta-label">Link status</span>
            <span className="suspect-report__meta-value">{linkLabel ?? 'Pending / not linked'}</span>
          </div>
        </div>

        <SuspectLinkReview
          draft={draft}
          linkDecision={draft.linkDecision}
          onLinkDecision={onLinkDecision}
        />

        <ReportSection number="I" title="Photographs & biometric capture" step="photo" onEdit={onEditStep}>
          <div className="suspect-report__photo-layout">
            <figure className="suspect-report__mugshot">
              {front && (front.previewUrl || front.storageKey) ? (
                <ReportPhoto
                  photo={front}
                  dossierDraftId={draft.dossierDraftId}
                  alt="Front face photograph"
                  size="mugshot"
                  className="suspect-report__mugshot-img"
                />
              ) : (
                <div className="suspect-report__mugshot-empty">No front photograph</div>
              )}
              <figcaption>
                Primary (front)
                {front?.faceId && <span className="suspect-report__frs-tag">FRS captured</span>}
              </figcaption>
            </figure>
            <div className="suspect-report__photo-details">
              <FieldTable>
                <FieldRow label="Front pose detected" value={front?.detectedPose ?? front?.poseType ?? ''} />
                <FieldRow
                  label="Face recognition"
                  value={front?.faceId ? 'Embedding stored (draft)' : 'Not indexed'}
                />
                <FieldRow
                  label="Duplicate screening"
                  value={
                    (front?.duplicateMatches.length ?? 0) > 0
                      ? `${front!.duplicateMatches.length} similar face(s) flagged`
                      : 'No match flagged'
                  }
                />
              </FieldTable>
              {annexPhotos.length > 0 && (
                <div className="suspect-report__photo-grid">
                  <p className="suspect-report__photo-grid-label">Supplementary angles</p>
                  <div className="suspect-report__photo-grid-inner">
                    {annexPhotos.map((p) => (
                      <figure key={p.id} className="suspect-report__photo-thumb">
                        <ReportPhoto
                          photo={p}
                          dossierDraftId={draft.dossierDraftId}
                          alt={p.label}
                          size="thumb"
                        />
                        <figcaption>{p.label}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ReportSection>

        <ReportSection number="II" title="Personal particulars" step="identity" onEdit={onEditStep}>
          <FieldTable>
            <FieldRow label="Criminal / legal name" value={draft.criminalName} colSpan />
            <FieldPair
              left={{ label: 'Alias / known as', value: draft.aliasName }}
              right={{ label: 'Gender', value: draft.gender }}
            />
            <FieldPair
              left={{ label: "Father's name", value: draft.fathersName }}
              right={{ label: 'Date of birth', value: draft.dateOfBirth }}
            />
            <FieldPair
              left={{ label: 'Age', value: draft.age }}
              right={{ label: 'Year of birth', value: draft.yearOfBirth }}
            />
            <FieldPair
              left={{ label: 'Place of birth', value: draft.placeOfBirth }}
              right={{ label: 'Religion', value: draft.religion }}
            />
            <FieldRow label="Social category" value={draft.category} colSpan />
          </FieldTable>
        </ReportSection>

        <ReportSection number="III" title="Address & location" step="address" onEdit={onEditStep}>
          <div className="space-y-6">
            {!draft.hasDifferentPresentAddress && (
              <FieldTable>
                <FieldRow label="Address type" value="Permanent and present (same)" colSpan />
              </FieldTable>
            )}
            <AddressReportBlock title="Permanent address" addr={draft.address} />
            {draft.hasDifferentPresentAddress && (
              <AddressReportBlock title="Present / current address" addr={draft.presentAddress} />
            )}
          </div>
        </ReportSection>

        <ReportSection number="IV" title="Contact details" step="contacts" onEdit={onEditStep}>
          {draft.contacts.length === 0 ? (
            <p className="suspect-report__empty">No contact numbers or email recorded.</p>
          ) : (
            <table className="suspect-report__table suspect-report__table--list">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Number / identifier</th>
                </tr>
              </thead>
              <tbody>
                {draft.contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.type}</td>
                    <td>{c.value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        <ReportSection number="V" title="Digital footprint" step="social" onEdit={onEditStep}>
          {draft.socialAccounts.length === 0 ? (
            <p className="suspect-report__empty">No social media accounts recorded.</p>
          ) : (
            <table className="suspect-report__table suspect-report__table--list">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Profile / handle details</th>
                </tr>
              </thead>
              <tbody>
                {draft.socialAccounts.map((s) => (
                  <tr key={s.id}>
                    <td>{s.platform}</td>
                    <td>{s.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        <ReportSection
          number="VI"
          title="Associates, relatives & whereabouts"
          step="relatives"
          onEdit={onEditStep}
        >
          {draft.relatives.length === 0 ? (
            <p className="suspect-report__empty">No relatives or associates recorded.</p>
          ) : (
            <table className="suspect-report__table suspect-report__table--list">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Relation</th>
                  <th>Gender</th>
                  <th>Occupation</th>
                </tr>
              </thead>
              <tbody>
                {draft.relatives.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name || '—'}</td>
                    <td>{r.relation || '—'}</td>
                    <td>{r.gender || '—'}</td>
                    <td>{r.occupation || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportSection>

        <footer className="suspect-report__footer">
          <div className="suspect-report__certification">
            <p className="suspect-report__cert-label">Certification (on submit)</p>
            <p className="suspect-report__cert-line">
              I certify that the particulars above are recorded to the best of my knowledge for
              intelligence watch-list purposes and have been verified against available records.
            </p>
            <div className="suspect-report__sig-row">
              <span className="suspect-report__sig-block">Submitting officer</span>
              <span className="suspect-report__sig-block">Office / unit</span>
              <span className="suspect-report__sig-block">Date</span>
            </div>
          </div>
          <p className="suspect-report__disclaimer">
            CONFIDENTIAL — For official use within the Integrated Intelligence Platform (IIP). Unauthorized
            disclosure is prohibited.
          </p>
        </footer>
      </article>
    </div>
  );
}
