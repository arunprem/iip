import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { UserContext } from './AppShell';
import { IipLogo } from './IipLogo';
import { useNavMenus, type NavMenuItem } from '../hooks/useNavMenus';
import { resolveIcon } from '../utils/iconMap';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-iip-primary/10 text-iip-primary'
      : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
  }`;

const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 pl-10 pr-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-iip-primary/10 text-iip-primary'
      : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
  }`;

function NavGroup({ item }: { item: NavMenuItem }) {
  const location = useLocation();
  const childPaths = item.children.filter((c) => c.path).map((c) => c.path!);
  const isChildActive = childPaths.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  const [open, setOpen] = useState(isChildActive);
  const Icon = resolveIcon(item.icon);

  useEffect(() => {
    if (isChildActive) setOpen(true);
  }, [isChildActive]);

  if (!item.children.length) return null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isChildActive
            ? 'bg-iip-primary/10 text-iip-primary'
            : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
        }`}
        aria-expanded={open}
      >
        <Icon size={18} className="shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <ul
        className="mt-0.5 space-y-0.5 overflow-hidden transition-all duration-200"
        style={{ maxHeight: open ? item.children.length * 44 + 8 : 0, opacity: open ? 1 : 0 }}
      >
        {item.children.map((child) => {
          const ChildIcon = resolveIcon(child.icon);
          return (
            <li key={child.id}>
              {child.path ? (
                <NavLink to={child.path} className={subLinkClass}>
                  <ChildIcon size={16} className="shrink-0 opacity-80" />
                  <span>{child.label}</span>
                </NavLink>
              ) : null}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function NavSection({ title, items }: { title: string; items: NavMenuItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-6">
      <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) =>
          item.is_group ? (
            <NavGroup key={item.id} item={item} />
          ) : item.path ? (
            <li key={item.id}>
              <NavLink to={item.path} end={item.path === '/dashboard'} className={linkClass}>
                {(() => {
                  const Icon = resolveIcon(item.icon);
                  return <Icon size={18} className="shrink-0" />;
                })()}
                <span>{item.label}</span>
              </NavLink>
            </li>
          ) : null
        )}
      </ul>
    </div>
  );
}

interface SidebarProps {
  user: UserContext;
  className?: string;
}

export function Sidebar({ user, className = '' }: SidebarProps) {
  const { data: menus, isLoading } = useNavMenus();

  const bySection = (menus ?? []).reduce<Record<string, NavMenuItem[]>>((acc, item) => {
    const section = item.section || 'Menu';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  return (
    <aside
      className={`w-[290px] shrink-0 self-stretch bg-iip-surface border-r border-iip-border flex flex-col min-h-0 ${className}`}
      aria-label="Primary navigation"
    >
      <div className="h-16 flex items-center gap-3 px-6 border-b border-iip-border shrink-0">
        <IipLogo size="sm" whiteBackground />
        <div>
          <p className="text-base font-bold text-iip-text leading-tight">IIP</p>
          <p className="text-[11px] text-iip-text-muted">Kerala Police</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6">
        {isLoading && (
          <p className="text-sm text-iip-text-muted px-3">Loading navigation...</p>
        )}
        {Object.entries(bySection).map(([section, items]) => (
          <NavSection key={section} title={section} items={items} />
        ))}
      </nav>
    </aside>
  );
}
