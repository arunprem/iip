import { Link } from 'react-router-dom';
import {
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

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

export interface MasterProfileData {
  master_suspect_id: string;
  display_name: string;
  dossier_count: number;
  identities: Record<string, unknown>[];
  addresses: Record<string, unknown>[];
  contacts: Record<string, unknown>[];
  social_accounts: Record<string, unknown>[];
  relatives: Record<string, unknown>[];
  photos: Record<string, unknown>[];
  fingerprints: Record<string, unknown>[];
}

export function SuspectMasterReport({ profile }: { profile: MasterProfileData }) {
  const primary = profile.identities[0];
  const frontPhoto =
    profile.photos.find((p) => str(p.pose_type).toUpperCase() === 'FRONT') ?? profile.photos[0];
  const gallery = profile.photos.filter((p) => p !== frontPhoto);

  return (
    <article className="suspect-report" role="document">
      <SuspectReportMasthead
        title="Suspect profile"
        subtitle="Consolidated watch-list record across linked unit dossiers"
        stamp="PROFILE"
      />

      <SuspectReportMeta
        items={[
          {
            label: 'Profile ref',
            value: shortRefId(profile.master_suspect_id, 'SUS'),
          },
          {
            label: 'Display name',
            value: profile.display_name,
            emphasis: true,
          },
          {
            label: 'Unit dossiers',
            value: String(profile.dossier_count),
          },
          {
            label: 'Latest submission',
            value: primary
              ? formatReportDate(str(primary.submitted_at))
              : '—',
          },
        ]}
      />

      <ReportSection number="I" title="Photographs (all units)">
        <div className="suspect-report__photo-layout">
          <figure className="suspect-report__mugshot">
            {frontPhoto ? (
              <SuspectDossierPhotoThumb
                dossierDraftId={str(frontPhoto.dossier_draft_id)}
                photoId={str(frontPhoto.photo_id)}
                storageKey={str(frontPhoto.storage_key)}
                alt="Primary front"
                size="mugshot"
              />
            ) : (
              <div className="suspect-report__mugshot-empty">No photograph on file</div>
            )}
            <figcaption>
              Primary front
              {Boolean(frontPhoto?.office_name) && (
                <span className="block text-[9px] font-normal normal-case mt-0.5">
                  {str(frontPhoto.office_name)}
                </span>
              )}
            </figcaption>
          </figure>
          {gallery.length > 0 && (
            <div className="suspect-report__photo-grid flex-1">
              <p className="suspect-report__photo-grid-label">
                All angles from linked dossiers ({profile.photos.length})
              </p>
              <div className="suspect-report__photo-grid-inner">
                {gallery.map((p) => (
                  <figure key={`${p.dossier_id}-${p.photo_id}`} className="suspect-report__photo-thumb">
                    <SuspectDossierPhotoThumb
                      dossierDraftId={str(p.dossier_draft_id)}
                      photoId={str(p.photo_id)}
                      storageKey={str(p.storage_key)}
                      size="thumb"
                    />
                    <figcaption>
                      {str(p.pose_type)}
                      <span className="block text-[8px] opacity-80">{str(p.office_name)}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}
        </div>
        {profile.fingerprints && profile.fingerprints.length > 0 && (
          <div className="mt-6 pt-4 border-t border-iip-border border-dashed">
            <p className="text-xs font-semibold text-iip-text-muted uppercase tracking-wide mb-3">
              Fingerprint biometrics (consolidated)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profile.fingerprints.map((f, i) => {
                const pos = str(f.finger_position)
                  .replace('_', ' ')
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                const quality = f.quality_score != null ? Math.round(Number(f.quality_score) * 100) : null;
                const device = f.device_model ? str(f.device_model) : null;
                const office = str(f.office_name) || 'Unknown Unit';
                
                return (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-iip-border bg-iip-bg/40 hover:bg-iip-bg/70 transition-colors shadow-sm">
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
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            quality >= 80 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 
                            quality >= 50 ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 
                            'bg-red-500/10 text-red-600 border border-red-500/20'
                          }`}>
                            {quality}% Quality
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-iip-text-muted mt-1 font-medium">{office}</p>
                      <p className="text-[11px] text-iip-text-muted/80 mt-0.5 font-medium">ISO 19794-2 FMR Template</p>
                      {device && (
                        <p className="text-[10px] text-iip-text-muted/60 mt-0.5 truncate font-mono">
                          Device: {device}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-600 font-semibold">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                        </span>
                        <span>Active & Searchable</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ReportSection>

      <ReportSection number="II" title="Identities reported (by unit)">
        <table className="suspect-report__table suspect-report__table--list">
          <thead>
            <tr>
              <th>Name</th>
              <th>Alias</th>
              <th>Unit</th>
              <th>Submitted</th>
              <th>Dossier</th>
            </tr>
          </thead>
          <tbody>
            {profile.identities.map((id) => (
              <tr key={str(id.dossier_id)}>
                <td className="font-medium">{str(id.criminal_name)}</td>
                <td>{str(id.alias_name) || '—'}</td>
                <td>{str(id.office_name) || '—'}</td>
                <td>{formatReportDate(str(id.submitted_at))}</td>
                <td>
                  <Link
                    to={`/suspects/${str(id.dossier_id)}`}
                    className="text-iip-primary hover:underline font-sans text-xs"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

      <ReportSection number="III" title="Addresses (consolidated)">
        {profile.addresses.length === 0 ? (
          <p className="suspect-report__empty">No addresses recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Location</th>
                <th>PIN</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {profile.addresses.map((a, i) => (
                <tr key={i}>
                  <td>
                    {[a.village_town_city, a.district, a.state].filter(Boolean).join(', ') ||
                      [a.locality, a.street_name].filter(Boolean).join(', ') ||
                      '—'}
                  </td>
                  <td>{str(a.pincode) || '—'}</td>
                  <td>{str(a.office_name) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection number="IV" title="Contacts (consolidated)">
        {profile.contacts.length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {profile.contacts.map((c, i) => (
                <tr key={i}>
                  <td>{str(c.contact_type)}</td>
                  <td>{str(c.value)}</td>
                  <td>{str(c.office_name) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection number="V" title="Digital footprint (consolidated)">
        {profile.social_accounts.length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Details</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {profile.social_accounts.map((s, i) => (
                <tr key={i}>
                  <td>{str(s.platform)}</td>
                  <td>{str(s.details)}</td>
                  <td>{str(s.office_name) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      <ReportSection number="VI" title="Associates & relatives (consolidated)">
        {profile.relatives.length === 0 ? (
          <p className="suspect-report__empty">None recorded.</p>
        ) : (
          <table className="suspect-report__table suspect-report__table--list">
            <thead>
              <tr>
                <th>Name</th>
                <th>Relation</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {profile.relatives.map((r, i) => (
                <tr key={i}>
                  <td>{str(r.name)}</td>
                  <td>{[r.relation, r.gender, r.occupation].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{str(r.office_name) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ReportSection>

      {primary && (
        <ReportSection number="VII" title="Primary identity summary">
          <FieldTable>
            <FieldRow label="Legal name" value={str(primary.criminal_name)} colSpan />
            <FieldRow label="Father's name" value={str(primary.fathers_name)} colSpan />
            <FieldRow
              label="Date of birth"
              value={str(primary.date_of_birth).slice(0, 10)}
              colSpan
            />
          </FieldTable>
        </ReportSection>
      )}

      <SuspectReportFooter />
    </article>
  );
}
