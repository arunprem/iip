import { Link } from 'react-router-dom';
import { ChevronRight, Clock, FileText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';

type ConfigCard = {
  to?: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  available: boolean;
  badge?: string;
};

const CONFIG_CARDS: ConfigCard[] = [
  {
    to: '/system/security',
    title: 'Security & MFA',
    description:
      'Require two-factor authentication for all users, and manage organization-wide sign-in security.',
    icon: ShieldCheck,
    available: true,
    badge: 'Active',
  },
  {
    title: 'Session & lock policy',
    description: 'Idle timeout, session lock, and re-authentication rules.',
    icon: Clock,
    available: false,
    badge: 'Coming soon',
  },
  {
    title: 'Audit & retention',
    description: 'Log retention periods and export policies for compliance.',
    icon: FileText,
    available: false,
    badge: 'Coming soon',
  },
];

export default function SystemConfiguration() {
  return (
    <AdminPageLayout
      title="System configuration"
      description="Platform-wide settings for authentication, security, and operational policies. IAM structure (roles, users, offices) is managed under the other System Management items."
      icon={SlidersHorizontal}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 max-w-5xl">
        {CONFIG_CARDS.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-iip-primary/10 text-iip-primary shrink-0">
                  <Icon size={20} aria-hidden />
                </div>
                {card.badge && (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                      card.available
                        ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
                        : 'bg-iip-bg text-iip-text-muted border-iip-border'
                    }`}
                  >
                    {card.badge}
                  </span>
                )}
              </div>
              <h2 className="text-sm font-semibold text-iip-text">{card.title}</h2>
              <p className="text-xs text-iip-text-muted mt-1.5 leading-relaxed">{card.description}</p>
              {card.available && (
                <span className="inline-flex items-center gap-1 mt-4 text-xs font-semibold text-iip-primary">
                  Open settings
                  <ChevronRight size={14} aria-hidden />
                </span>
              )}
            </>
          );

          if (card.available && card.to) {
            return (
              <Link
                key={card.title}
                to={card.to}
                className="dashboard-card p-5 block transition-colors hover:border-iip-primary/40 hover:bg-iip-primary/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-iip-primary/35 rounded-2xl"
              >
                {inner}
              </Link>
            );
          }

          return (
            <div
              key={card.title}
              className="dashboard-card p-5 opacity-70 cursor-not-allowed"
              aria-disabled
            >
              {inner}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-iip-text-muted max-w-2xl mt-2">
        Additional configuration modules will appear here as they are implemented. Role, menu, office,
        and user administration remain under <strong className="font-medium text-iip-text">System Management</strong>{' '}
        in the sidebar.
      </p>
    </AdminPageLayout>
  );
}
