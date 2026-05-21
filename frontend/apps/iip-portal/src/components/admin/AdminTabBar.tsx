import type { LucideIcon } from 'lucide-react';

export interface AdminTabItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface AdminTabBarProps<T extends string> {
  tabs: AdminTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function AdminTabBar<T extends string>({ tabs, active, onChange }: AdminTabBarProps<T>) {
  return (
    <div className="admin-tab-bar" role="tablist" aria-label="Sections">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`admin-tab-btn ${isActive ? 'admin-tab-btn-active' : 'admin-tab-btn-inactive'}`}
          >
            <Icon size={16} className="shrink-0 opacity-90" aria-hidden />
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`min-w-[1.25rem] px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-iip-surface-hover text-iip-text-muted'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
