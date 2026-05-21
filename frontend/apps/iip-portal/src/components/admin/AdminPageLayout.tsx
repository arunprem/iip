import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface AdminPageLayoutProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  /** Fill main content height (e.g. office tree + form panels). */
  fillHeight?: boolean;
}

export function AdminPageLayout({
  title,
  description,
  icon: Icon,
  actions,
  children,
  fillHeight = false,
}: AdminPageLayoutProps) {
  return (
    <div
      className={
        fillHeight
          ? 'flex flex-col flex-1 min-h-0 gap-3 h-full'
          : 'space-y-6'
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-iip-primary/10 text-iip-primary shrink-0">
            <Icon size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-iip-text">{title}</h1>
            <p className="text-sm text-iip-text-muted mt-1 max-w-2xl">{description}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
