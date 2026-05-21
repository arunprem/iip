import type { ReactNode } from 'react';

interface AdminSectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  step?: number;
  actions?: ReactNode;
  className?: string;
}

export function AdminSectionCard({
  title,
  description,
  children,
  step,
  actions,
  className = '',
}: AdminSectionCardProps) {
  return (
    <section className={`dashboard-card overflow-hidden ${className}`}>
      <div className="px-5 py-4 border-b border-iip-border flex flex-wrap items-start justify-between gap-3 bg-iip-surface/80">
        <div className="flex items-start gap-3 min-w-0">
          {step !== undefined && (
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-iip-primary/10 text-xs font-bold text-iip-primary"
              aria-hidden
            >
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="admin-section-title">{title}</h2>
            {description && <p className="admin-section-desc">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
