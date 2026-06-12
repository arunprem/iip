import { Link } from 'react-router-dom';
import {
  FieldPair,
  FieldRow,
  FieldTable,
  ReportSection,
  SuspectReportFooter,
  SuspectReportMasthead,
  SuspectReportMeta,
  formatReportDate,
  shortRefId,
} from './suspectReportParts';
import { SuspectDossierPhotoThumb } from '../SuspectDossierPhotoThumb';
import { FingerprintImagePreview } from '../FingerprintImagePreview';

export interface DossierReportDetail {
  dossier_id: string;
  master_suspect_id: string;
  dossier_draft_id?: string | null;
  link_status: string;
  status: string;
  office_name?: string | null;
  submitted_at: string;
  identity: Record<string, unknown>;
  address?: Record<string, unknown> | null;
  present_address?: Record<string, unknown> | null;
  has_different_present_address?: boolean;
  contacts?: Record<string, unknown>[];
  social_accounts?: Record<string, unknown>[];
  relatives?: Record<string, unknown>[];
  photos?: Record<string, unknown>[];
  fingerprints?: Record<string, unknown>[];
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

export function SuspectDossierReportView({
  detail,
  onEdit,
  editHref,
}: {
  detail: DossierReportDetail;
  onEdit?: () => void;
  editHref?: string;
}) {
  const identity = detail.identity;
  const permAddr = detail.address ?? {};
  const presAddr = detail.present_address ?? {};
  const hasDifferentPresent = detail.has_different_present_address === true;
  const photos = detail.photos ?? [];
  const front = photos.find((p) => str(p.pose_type).toUpperCase() === 'FRONT');
  const otherPhotos = photos.filter((p) => str(p.pose_type).toUpperCase() !== 'FRONT');
  const draftId = detail.dossier_draft_id ?? null;

  const formatLine = (row: Record<string, unknown>) =>
    [
      str(row.house_no),
      str(row.house_name),
      str(row.street_name),
      str(row.locality),
      str(row.tehsil),
      str(row.village_town_city),
    ]
      .filter(Boolean)
      .join(', ');

  const renderAddressTable = (row: Record<string, unknown>, title: string) => (
    <div key={title} className="suspect-report__address-block space-y-0">
      <p className="text-xs font-semibold text-iip-text uppercase tracking-wide mb-2">{title}</p>
      <FieldTable>
        <FieldRow label="Full address" value={formatLine(row)} colSpan />
        <FieldPair
          left={{ label: 'PIN', value: str(row.pincode) }}
          right={{ label: 'Police station', value: str(row.police_station) }}
        />
        <FieldPair
          left={{ label: 'District', value: str(row.district) }}
          right={{ label: 'State', value: str(row.state) }}
        />
        {(row.latitude != null || row.longitude != null) && (
          <FieldRow
            label="Geo coordinates"
            value={`${row.latitude ?? '—'}, ${row.longitude ?? '—'}`}
            colSpan
          />
        )}
      </FieldTable>
    </div>
  );

  const editAction = editHref
    ? () => {
        /* navigation via Link in section - use onEdit for button */
      }
    : onEdit;

  return (
    <article className="suspect-report" role="document">
      <SuspectReportMasthead
        title="Unit suspect dossier"
        subtitle="Submitted intelligence record — official copy"
        stamp={detail.status === 'SUBMITTED' ? 'SUBMITTED' : str(detail.status)}
      />

      <SuspectReportMeta
        items={[
          { label: 'Dossier ref', value: shortRefId(detail.dossier_id) },
          { label: 'Submitted', value: formatReportDate(detail.submitted_at) },
          {
            label: 'Subject',
            value: str(identity.criminal_name) || 'Unnamed',
            emphasis: true,
          },
          {
            label: 'Unit / link',
            value: `${detail.office_name ?? '—'} · ${detail.link_status}`,
          },
        ]}
      />

      <ReportSection
        number="I"
        title="Photographs & biometric capture"
        onEdit={editHref ? undefined : editAction}
      >
        {editHref && (
          <p className="mb-3 font-sans text-xs">
            <Link to={editHref} className="text-iip-primary font-medium hover:underline">
              Edit dossier →
            </Link>
          </p>
        )}
        <div className="suspect-report__photo-layout">
          <figure className="suspect-report__mugshot">
            <SuspectDossierPhotoThumb
              dossierDraftId={draftId}
              photoId={front ? str(front.photo_id) : null}
              storageKey={front ? str(front.storage_key) : null}
              alt="Front photograph"
              size="mugshot"
            />
            <figcaption>
              Primary (front)
              {Boolean(front?.face_id) && (
                <span className="suspect-report__frs-tag">FRS indexed</span>
              )}
            </figcaption>
          </figure>
          {otherPhotos.length > 0 && (
            <div className="suspect-report__photo-grid">
              <p className="suspect-report__photo-grid-label">Supplementary angles</p>
              <div className="suspect-report__photo-grid-inner">
                {otherPhotos.map((p) => (
                  <figure key={str(p.photo_id)} className="suspect-report__photo-thumb">
                    <SuspectDossierPhotoThumb
                      dossierDraftId={draftId ?? str(p.dossier_draft_id)}
                      photoId={str(p.photo_id)}
                      storageKey={str(p.storage_key)}
                      size="thumb"
                    />
                    <figcaption>{str(p.pose_type)}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
      </ReportSection>

      <ReportSection number="II" title="Fingerprint biometrics">
        {editHref && (
          <p className="mb-3 font-sans text-xs">
            <Link
              to={`${editHref}?step=fingerprint`}
              className="text-iip-primary font-medium hover:underline"
            >
              Manage fingerprints →
            </Link>
          </p>
        )}
        {detail.fingerprints && detail.fingerprints.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {detail.fingerprints.map((f, i) => {
              const pos = str(f.finger_position)
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/\b\w/g, (c) => c.toUpperCase());
              const quality =
                f.quality_score != null ? Math.round(Number(f.quality_score) * 100) : null;
              const device = f.device_model ? str(f.device_model) : null;

              return (
                <div
                  key={str(f.print_id) || str(f.template_id) || i}
                  className="flex items-start gap-4 p-4 rounded-xl border border-iip-border bg-iip-bg/40 hover:bg-iip-bg/70 transition-colors shadow-sm"
                >
                  <FingerprintImagePreview
                    printId={str(f.print_id)}
                    altText={pos}
                    className="w-14 h-18 object-cover rounded border border-iip-border bg-iip-bg shrink-0"
                    iconSize={28}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-iip-text truncate">{pos}</p>
                      {quality !== null && (
                        <span
                          className={[
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                            quality >= 80
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : quality >= 50
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-600 border border-red-500/20',
                          ].join(' ')}
                        >
                          {quality}% Quality
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-iip-text-muted mt-1 font-medium">
                      ISO 19794-2 FMR Template
                    </p>
                    {device && (
                      <p className="text-[11px] text-iip-text-muted/80 mt-0.5 truncate font-mono">
                        Device: {device}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-600 font-semibold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span>Active & Searchable</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="suspect-report__empty">No fingerprints on file.</p>
        )}
      </ReportSection>

      <ReportSection number="III" title="Personal particulars" onEdit={editHref ? undefined : editAction}>
        <FieldTable>
          <FieldRow label="Criminal / legal name" value={str(identity.criminal_name)} colSpan />
          <FieldPair
            left={{ label: 'Alias', value: str(identity.alias_name) }}
            right={{ label: 'Gender', value: str(identity.gender) }}
          />
          <FieldPair
            left={{ label: "Father's name", value: str(identity.fathers_name) }}
            right={{
              label: 'Date of birth',
              value: str(identity.date_of_birth).slice(0, 10),
            }}
          />
          <FieldPair
            left={{ label: 'Age', value: str(identity.age) }}
            right={{ label: 'Year of birth', value: str(identity.year_of_birth) }}
          />
          <FieldPair
            left={{ label: 'Place of birth', value: str(identity.place_of_birth) }}
            right={{ label: 'Religion', value: str(identity.religion) }}
          />
          <FieldRow label="Social category" value={str(identity.category)} colSpan />
        </FieldTable>
      </ReportSection>

      <ReportSection number="IV" title="Address & location" onEdit={editHref ? undefined : editAction}>
        <div className="space-y-6">
          {!hasDifferentPresent && (
            <FieldTable>
              <FieldRow label="Address type" value="Permanent and present (same)" colSpan />
            </FieldTable>
          )}
          {renderAddressTable(permAddr, 'Permanent address')}
          {hasDifferentPresent && renderAddressTable(presAddr, 'Present / current address')}
        </div>
      </ReportSection>

      <ReportSection number="V" title="Contact details" onEdit={editHref ? undefined : editAction}>
        {(detail.contacts ?? []).length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {(detail.contacts ?? []).map((c, i) => (
                <tr key={i}>
                  <td>{str(c.contact_type)}</td>
                  <td>{str(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection number="VI" title="Digital footprint" onEdit={editHref ? undefined : editAction}>
        {(detail.social_accounts ?? []).length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {(detail.social_accounts ?? []).map((s, i) => (
                <tr key={i}>
                  <td>{str(s.platform)}</td>
                  <td>{str(s.details)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection
        number="VII"
        title="Associates & relatives"
        onEdit={editHref ? undefined : editAction}
      >
        {(detail.relatives ?? []).length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
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
              {(detail.relatives ?? []).map((r, i) => (
                <tr key={i}>
                  <td>{str(r.name)}</td>
                  <td>{str(r.relation)}</td>
                  <td>{str(r.gender)}</td>
                  <td>{str(r.occupation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <SuspectReportFooter />
    </article>
  );
}
