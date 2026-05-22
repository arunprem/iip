import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { UserContext } from './AppShell';
import { IipLogo } from './IipLogo';
import { useNavMenus, type NavMenuItem } from '../hooks/useNavMenus';
import { useSidebarStore } from '../stores/sidebarStore';
import { resolveIcon } from '../utils/iconMap';

function useSidebarNavClasses(collapsed: boolean) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-lg text-sm font-medium transition-colors ${
      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
    } ${
      isActive
        ? 'bg-iip-primary/10 text-iip-primary'
        : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
    }`;

  const subLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
      collapsed ? 'justify-center pl-2 pr-2 py-2' : 'pl-10 pr-3 py-2'
    } ${
      isActive
        ? 'bg-iip-primary/10 text-iip-primary'
        : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
    }`;

  return { linkClass, subLinkClass };
}

function NavLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  return (
    <span
      className={`truncate text-left transition-all duration-300 ease-in-out ${
        collapsed ? 'w-0 max-w-0 opacity-0 overflow-hidden' : 'flex-1 opacity-100'
      }`}
    >
      {children}
    </span>
  );
}

function CollapsedNavFlyout({
  item,
  anchorRef,
  open,
  onClose,
}: {
  item: NavMenuItem;
  anchorRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onClose: () => void;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuHeight = Math.min(320, 48 + item.children.filter((c) => c.path).length * 40);
      let top = rect.top;
      const left = rect.right + 8;
      const maxTop = window.innerHeight - menuHeight - 12;
      if (top > maxTop) top = Math.max(12, maxTop);

      setPosition({ top, left });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, anchorRef, item.children]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const flyoutLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-iip-primary/10 text-iip-primary'
        : 'text-iip-text hover:bg-iip-surface-hover'
    }`;

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-[90] cursor-default"
        aria-label="Close submenu"
        onClick={onClose}
      />
      <div
        role="menu"
        aria-label={item.label}
        className="sidebar-nav-flyout fixed z-[100] min-w-[11rem] max-w-[16rem] rounded-xl border border-iip-border bg-iip-surface shadow-xl py-1.5 animate-[sidebar-flyout-in_0.15s_ease-out]"
        style={{ top: position.top, left: position.left }}
      >
        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted border-b border-iip-border mb-1">
          {item.label}
        </p>
        <ul className="px-1.5 space-y-0.5 max-h-[min(20rem,70vh)] overflow-y-auto">
          {item.children.map((child) => {
            if (!child.path) return null;
            const ChildIcon = resolveIcon(child.icon);
            return (
              <li key={child.id} role="none">
                <NavLink
                  to={child.path}
                  role="menuitem"
                  className={flyoutLinkClass}
                  onClick={() => {
                    useSidebarStore.getState().setMobileOpen(false);
                    onClose();
                  }}
                >
                  <ChildIcon size={16} className="shrink-0 opacity-80" />
                  <span className="truncate">{child.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </>,
    document.body
  );
}

function NavGroup({
  item,
  collapsed,
  openFlyoutId,
  setOpenFlyoutId,
}: {
  item: NavMenuItem;
  collapsed: boolean;
  openFlyoutId: string | null;
  setOpenFlyoutId: (id: string | null) => void;
}) {
  const location = useLocation();
  const { subLinkClass } = useSidebarNavClasses(collapsed);
  const childPaths = item.children.filter((c) => c.path).map((c) => c.path!);
  const isChildActive = childPaths.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
  );
  const [open, setOpen] = useState(isChildActive && !collapsed);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const flyoutOpen = openFlyoutId === item.id;
  const Icon = resolveIcon(item.icon);

  useEffect(() => {
    if (isChildActive && !collapsed) setOpen(true);
    if (collapsed) setOpen(false);
  }, [isChildActive, collapsed]);

  useEffect(() => {
    if (!collapsed) setOpenFlyoutId(null);
  }, [collapsed, setOpenFlyoutId]);

  useEffect(() => {
    setOpenFlyoutId(null);
  }, [location.pathname, setOpenFlyoutId]);

  if (!item.children.length) return null;

  if (collapsed) {
    const hasChildren = item.children.some((c) => c.path);
    return (
      <li className="relative">
        <button
          ref={anchorRef}
          type="button"
          title={item.label}
          aria-label={`${item.label} submenu`}
          aria-expanded={flyoutOpen}
          aria-haspopup="menu"
          onClick={() => setOpenFlyoutId(flyoutOpen ? null : item.id)}
          className={`flex w-full items-center justify-center rounded-lg p-2.5 transition-colors ${
            isChildActive || flyoutOpen
              ? 'bg-iip-primary/10 text-iip-primary'
              : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
          }`}
        >
          <Icon size={18} className="shrink-0" />
        </button>
        {hasChildren && (
          <CollapsedNavFlyout
            item={item}
            anchorRef={anchorRef}
            open={flyoutOpen}
            onClose={() => setOpenFlyoutId(null)}
          />
        )}
      </li>
    );
  }

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
        <NavLabel collapsed={false}>{item.label}</NavLabel>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <ul
        className="mt-0.5 space-y-0.5 overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: open ? item.children.length * 44 + 8 : 0, opacity: open ? 1 : 0 }}
      >
        {item.children.map((child) => {
          const ChildIcon = resolveIcon(child.icon);
          return (
            <li key={child.id}>
              {child.path ? (
                <NavLink
                  to={child.path}
                  className={subLinkClass}
                  onClick={() => useSidebarStore.getState().setMobileOpen(false)}
                >
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

function NavSection({
  title,
  items,
  collapsed,
  openFlyoutId,
  setOpenFlyoutId,
}: {
  title: string;
  items: NavMenuItem[];
  collapsed: boolean;
  openFlyoutId: string | null;
  setOpenFlyoutId: (id: string | null) => void;
}) {
  const { linkClass } = useSidebarNavClasses(collapsed);

  if (!items.length) return null;

  return (
    <div className={collapsed ? 'mb-3' : 'mb-6'}>
      <p
        className={`px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted transition-all duration-300 overflow-hidden whitespace-nowrap ${
          collapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-8 opacity-100'
        }`}
      >
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item) =>
          item.is_group ? (
            <NavGroup
              key={item.id}
              item={item}
              collapsed={collapsed}
              openFlyoutId={openFlyoutId}
              setOpenFlyoutId={setOpenFlyoutId}
            />
          ) : item.path ? (
            <li key={item.id}>
              <NavLink
                to={item.path}
                end={item.path === '/dashboard'}
                className={linkClass}
                title={collapsed ? item.label : undefined}
                onClick={() => useSidebarStore.getState().setMobileOpen(false)}
              >
                {(() => {
                  const Icon = resolveIcon(item.icon);
                  return <Icon size={18} className="shrink-0" />;
                })()}
                <NavLabel collapsed={collapsed}>{item.label}</NavLabel>
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
  /** Mobile drawer always shows expanded layout */
  forceExpanded?: boolean;
}

/** Desktop sidebar + mobile overlay drawer */
export function SidebarDrawer({ user }: { user: UserContext }) {
  const mobileOpen = useSidebarStore((s) => s.mobileOpen);
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    if (mobileOpen) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [mobileOpen, setMobileOpen]);

  return (
    <>
      <Sidebar user={user} className="hidden lg:flex" />

      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full shadow-2xl transition-transform duration-300 ease-in-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <Sidebar user={user} forceExpanded className="h-full" />
        </div>
      </div>
    </>
  );
}

export function Sidebar({ user: _user, className = '', forceExpanded = false }: SidebarProps) {
  const collapsed = useSidebarStore((s) => s.collapsed) && !forceExpanded;
  const [openFlyoutId, setOpenFlyoutId] = useState<string | null>(null);
  const { data: menus, isLoading } = useNavMenus();

  useEffect(() => {
    if (!collapsed) setOpenFlyoutId(null);
  }, [collapsed]);

  const sortedRoots = [...(menus ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  const bySection = sortedRoots.reduce<Record<string, NavMenuItem[]>>((acc, item) => {
    const section = item.section || 'Menu';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  const sectionEntries = Object.entries(bySection).sort(([, itemsA], [, itemsB]) => {
    const minA = Math.min(...itemsA.map((i) => i.sort_order));
    const minB = Math.min(...itemsB.map((i) => i.sort_order));
    return minA - minB || itemsA[0].section.localeCompare(itemsB[0].section);
  });

  return (
    <aside
      className={`relative shrink-0 self-stretch bg-iip-surface border-r border-iip-border flex flex-col min-h-0 transition-[width] duration-300 ease-in-out ${
        collapsed ? 'w-[4.5rem]' : 'w-[290px]'
      } ${className}`}
      aria-label="Primary navigation"
      aria-expanded={!collapsed}
    >
      <div
        className={`h-16 flex items-center border-b border-iip-border shrink-0 transition-all duration-300 ${
          collapsed ? 'justify-center px-2' : 'gap-3 px-5'
        }`}
      >
        <IipLogo size="sm" whiteBackground className="shrink-0" />
        <div
          className={`min-w-0 overflow-hidden transition-all duration-300 ease-in-out ${
            collapsed ? 'w-0 max-w-0 opacity-0' : 'opacity-100'
          }`}
        >
          <p className="text-base font-bold text-iip-text leading-tight whitespace-nowrap">IIP</p>
          <p className="text-[11px] text-iip-text-muted whitespace-nowrap">Kerala Police</p>
        </div>
      </div>

      <nav
        className={`flex-1 overflow-y-auto overflow-x-hidden py-5 transition-all duration-300 ${
          collapsed ? 'px-2' : 'px-4'
        }`}
      >
        {isLoading && !collapsed && (
          <p className="text-sm text-iip-text-muted px-3">Loading navigation...</p>
        )}
        {isLoading && collapsed && (
          <div className="h-8 w-8 mx-auto border-2 border-iip-primary/30 border-t-iip-primary rounded-full animate-spin" />
        )}
        {sectionEntries.map(([section, items]) => (
          <NavSection
            key={section}
            title={section}
            collapsed={collapsed}
            openFlyoutId={openFlyoutId}
            setOpenFlyoutId={setOpenFlyoutId}
            items={[...items].sort(
              (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
            )}
          />
        ))}
      </nav>
    </aside>
  );
}
