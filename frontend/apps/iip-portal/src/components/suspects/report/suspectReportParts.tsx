import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';

export const KERALA_POLICE_LOGO = '/kerala-police-logo-transparent.png';

export function formatReportDate(iso: string): string {
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

export function shortRefId(id: string, prefix = 'DOS'): string {
  const short = id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase();
  return `${prefix}-${short}`;
}

export function ReportSection({
  number,
  title,
  onEdit,
  children,
}: {
  number: string;
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="suspect-report__section group">
      <div className="suspect-report__section-head">
        <h2 className="suspect-report__section-title">
          <span className="suspect-report__section-num">{number}</span>
          {title}
        </h2>
        {onEdit && (
          <button
            type="button"
            className="suspect-report__edit-btn"
            onClick={onEdit}
            aria-label={`Edit ${title}`}
            title={`Edit ${title}`}
          >
            <Pencil size={15} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="suspect-report__section-body">{children}</div>
    </section>
  );
}

export function FieldTable({ children }: { children: ReactNode }) {
  return (
    <table className="suspect-report__table">
      <tbody>{children}</tbody>
    </table>
  );
}

export function FieldRow({
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

export function FieldPair({
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

export function SuspectReportMasthead({
  title,
  subtitle,
  stamp = 'RECORD',
}: {
  title: string;
  subtitle: string;
  stamp?: string;
}) {
  return (
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
        <h1 className="suspect-report__title">{title}</h1>
        <p className="suspect-report__subtitle">{subtitle}</p>
      </div>
      <div className="suspect-report__stamp" aria-hidden>
        <span>{stamp}</span>
      </div>
    </header>
  );
}

export function SuspectReportMeta({
  items,
}: {
  items: { label: string; value: string; emphasis?: boolean }[];
}) {
  return (
    <div className="suspect-report__meta">
      {items.map((item) => (
        <div key={item.label} className="suspect-report__meta-item">
          <span className="suspect-report__meta-label">{item.label}</span>
          <span
            className={
              item.emphasis
                ? 'suspect-report__meta-value suspect-report__meta-value--emphasis'
                : 'suspect-report__meta-value'
            }
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SuspectReportFooter() {
  return (
    <footer className="suspect-report__footer">
      <div className="suspect-report__certification">
        <p className="suspect-report__cert-label">Certification</p>
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
        CONFIDENTIAL — For official use within the Integrated Intelligence Platform (IIP).
        Unauthorized disclosure is prohibited.
      </p>
    </footer>
  );
}
