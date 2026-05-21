import type { LucideIcon } from 'lucide-react';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface AdminTipBannerProps {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: 'info' | 'warning';
}

export function AdminTipBanner({
  children,
  icon: Icon = Info,
  variant = 'info',
}: AdminTipBannerProps) {
  return (
    <div
      className={`admin-tip-banner ${
        variant === 'warning'
          ? 'border-amber-500/30 bg-amber-500/[0.08] !text-iip-text'
          : ''
      }`}
      role="note"
    >
      <Icon
        size={18}
        className={`shrink-0 mt-0.5 ${
          variant === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-iip-primary'
        }`}
        aria-hidden
      />
      <div className="text-iip-text-muted [&_strong]:text-iip-text [&_strong]:font-medium">
        {children}
      </div>
    </div>
  );
}
