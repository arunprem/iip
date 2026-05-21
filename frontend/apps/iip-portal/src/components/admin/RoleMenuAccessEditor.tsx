import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Search,
  Shield,
} from 'lucide-react';
import { AdminButton } from './AdminButton';

export interface MenuPrivilegeOption {
  id: string;
  privilege_code: string;
  name: string;
  module: string;
}

export interface RoleOption {
  role_id: string;
  role_name: string;
}

export interface LinkedMenuHint {
  privilege_id: string;
  menu_key: string;
  label: string;
  is_group: boolean;
}

interface RoleMenuAccessEditorProps {
  roles: RoleOption[];
  privileges: MenuPrivilegeOption[];
  linkedMenus: LinkedMenuHint[];
  menuState: Record<string, Set<string>>;
  menuBaseline: Record<string, Set<string>>;
  selectedRoleId: string | null;
  onSelectRole: (roleId: string) => void;
  onTogglePrivilege: (roleId: string, privilegeId: string) => void;
  onSetModuleGrants: (roleId: string, privilegeIds: string[], grant: boolean) => void;
  onSetAllGrants: (roleId: string, grant: boolean) => void;
  isLoading?: boolean;
}

function privilegeKey(code: string) {
  return code.replace(/^menu:/i, '');
}

export function RoleMenuAccessEditor({
  roles,
  privileges,
  linkedMenus,
  menuState,
  menuBaseline,
  selectedRoleId,
  onSelectRole,
  onTogglePrivilege,
  onSetModuleGrants,
  onSetAllGrants,
  isLoading,
}: RoleMenuAccessEditorProps) {
  const [roleSearch, setRoleSearch] = useState('');
  const [privSearch, setPrivSearch] = useState('');
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  const menusByPrivilege = useMemo(() => {
    const map = new Map<string, LinkedMenuHint[]>();
    for (const m of linkedMenus) {
      if (!m.privilege_id) continue;
      const list = map.get(m.privilege_id) ?? [];
      list.push(m);
      map.set(m.privilege_id, list);
    }
    return map;
  }, [linkedMenus]);

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.role_name.toLowerCase().includes(q));
  }, [roles, roleSearch]);

  const filteredPrivileges = useMemo(() => {
    const q = privSearch.trim().toLowerCase();
    if (!q) return privileges;
    return privileges.filter((p) => {
      const menus = menusByPrivilege.get(p.id) ?? [];
      return (
        p.name.toLowerCase().includes(q) ||
        p.privilege_code.toLowerCase().includes(q) ||
        p.module.toLowerCase().includes(q) ||
        menus.some(
          (m) =>
            m.label.toLowerCase().includes(q) || m.menu_key.toLowerCase().includes(q)
        )
      );
    });
  }, [privileges, privSearch, menusByPrivilege]);

  const moduleGroups = useMemo(() => {
    const map = new Map<string, MenuPrivilegeOption[]>();
    for (const p of filteredPrivileges) {
      const mod = p.module || 'Other';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([module, items]) => ({
        module,
        privileges: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [filteredPrivileges]);

  const activeRoleId = selectedRoleId ?? roles[0]?.role_id ?? null;
  const activeGrants = activeRoleId ? (menuState[activeRoleId] ?? new Set()) : new Set<string>();
  const baselineGrants = activeRoleId
    ? (menuBaseline[activeRoleId] ?? new Set())
    : new Set<string>();

  const roleHasDraft =
    activeRoleId &&
    (() => {
      const current = menuState[activeRoleId];
      if (!current) return false;
      const base = baselineGrants;
      if (current.size !== base.size) return true;
      for (const id of current) if (!base.has(id)) return true;
      for (const id of base) if (!current.has(id)) return true;
      return false;
    })();

  const grantCountForRole = (roleId: string) => (menuState[roleId] ?? new Set()).size;

  const moduleGrantStats = (privIds: string[]) => {
    const granted = privIds.filter((id) => activeGrants.has(id)).length;
    return { granted, total: privIds.length };
  };

  const toggleModuleCollapse = (module: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  };

  if (isLoading) {
    return (
      <p className="px-5 py-12 text-sm text-iip-text-muted text-center">Loading menu access…</p>
    );
  }

  if (!roles.length) {
    return (
      <p className="px-5 py-10 text-center text-sm text-iip-text-muted">
        Create at least one role to configure menu access.
      </p>
    );
  }

  if (!privileges.length) {
    return (
      <p className="px-5 py-10 text-center text-sm text-iip-text-muted">
        No MENU privileges defined. Create them under Privilege Management first.
      </p>
    );
  }

  return (
    <div className="admin-access-layout border-t border-iip-border">
      {/* Role picker */}
      <aside className="border-b lg:border-b-0 lg:border-r border-iip-border bg-iip-bg/40 flex flex-col min-h-[280px]">
        <div className="p-3 border-b border-iip-border space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-iip-text-muted px-1">
            Roles
          </p>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-iip-text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Filter roles…"
              className="form-control pl-8 py-2 text-xs w-full"
              aria-label="Filter roles"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2 space-y-0.5" role="listbox" aria-label="Roles">
          {filteredRoles.map((role) => {
            const selected = role.role_id === activeRoleId;
            const count = grantCountForRole(role.role_id);
            return (
              <li key={role.role_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onSelectRole(role.role_id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                    selected
                      ? 'bg-iip-primary text-white shadow-sm'
                      : 'text-iip-text hover:bg-iip-surface-hover'
                  }`}
                >
                  <Shield size={14} className="shrink-0 opacity-80" aria-hidden />
                  <span className="flex-1 font-medium truncate">{role.role_name}</span>
                  <span
                    className={`shrink-0 text-[11px] tabular-nums px-1.5 py-0.5 rounded-md ${
                      selected ? 'bg-white/20' : 'bg-iip-surface-hover text-iip-text-muted'
                    }`}
                  >
                    {count}/{privileges.length}
                  </span>
                </button>
              </li>
            );
          })}
          {filteredRoles.length === 0 && (
            <li className="px-3 py-4 text-xs text-iip-text-muted">No roles match filter.</li>
          )}
        </ul>
      </aside>

      {/* Privilege tree */}
      <div className="flex flex-col min-h-[280px] min-w-0">
        {activeRoleId && (
          <>
            <div className="p-4 border-b border-iip-border bg-iip-surface/50 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-iip-text flex items-center gap-2">
                    <FolderTree size={16} className="text-iip-primary" aria-hidden />
                    Menu privileges for{' '}
                    <span className="font-mono text-iip-primary">
                      {roles.find((r) => r.role_id === activeRoleId)?.role_name}
                    </span>
                  </p>
                  <p className="text-xs text-iip-text-muted mt-1">
                    Granting a privilege shows every menu item linked to it in the sidebar.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AdminButton
                    variant="secondary"
                    size="xs"
                    onClick={() =>
                      onSetAllGrants(
                        activeRoleId,
                        activeGrants.size < privileges.length
                      )
                    }
                  >
                    {activeGrants.size === privileges.length ? 'Clear all' : 'Grant all'}
                  </AdminButton>
                  {roleHasDraft && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 px-2 py-1 rounded-md bg-amber-500/10">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                      Unsaved
                    </span>
                  )}
                </div>
              </div>
              <div className="relative max-w-md">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted"
                  aria-hidden
                />
                <input
                  type="search"
                  value={privSearch}
                  onChange={(e) => setPrivSearch(e.target.value)}
                  placeholder="Search privileges or linked menus…"
                  className="form-control pl-9 w-full text-sm"
                  aria-label="Search privileges"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {moduleGroups.length === 0 && (
                <p className="text-sm text-iip-text-muted text-center py-8">
                  No privileges match your search.
                </p>
              )}
              {moduleGroups.map(({ module, privileges: modPrivs }) => {
                const privIds = modPrivs.map((p) => p.id);
                const { granted, total } = moduleGrantStats(privIds);
                const collapsed = collapsedModules.has(module);
                const allGranted = granted === total && total > 0;
                const someGranted = granted > 0 && granted < total;

                return (
                  <div
                    key={module}
                    className="rounded-xl border border-iip-border bg-iip-surface overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-iip-bg/60 border-b border-iip-border/80">
                      <button
                        type="button"
                        onClick={() => toggleModuleCollapse(module)}
                        className="p-1 rounded-md hover:bg-iip-surface-hover text-iip-text-muted"
                        aria-expanded={!collapsed}
                        aria-label={collapsed ? `Expand ${module}` : `Collapse ${module}`}
                      >
                        {collapsed ? (
                          <ChevronRight size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                      <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                        <input
                          type="checkbox"
                          className="admin-matrix-checkbox"
                          checked={allGranted}
                          ref={(el) => {
                            if (el) el.indeterminate = someGranted;
                          }}
                          onChange={() =>
                            onSetModuleGrants(activeRoleId, privIds, !allGranted)
                          }
                          aria-label={`Toggle all in ${module}`}
                        />
                        <span className="text-sm font-semibold text-iip-text truncate">
                          {module}
                        </span>
                        <span className="text-xs text-iip-text-muted tabular-nums shrink-0">
                          {granted}/{total}
                        </span>
                      </label>
                    </div>

                    {!collapsed && (
                      <ul className="divide-y divide-iip-border/60">
                        {modPrivs.map((priv) => {
                          const checked = activeGrants.has(priv.id);
                          const linked = menusByPrivilege.get(priv.id) ?? [];
                          return (
                            <li key={priv.id} className="pl-2">
                              <div
                                className={`flex items-start gap-3 px-3 py-3 transition-colors ${
                                  checked ? 'bg-iip-primary/[0.04]' : ''
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="admin-matrix-checkbox mt-0.5"
                                  checked={checked}
                                  onChange={() =>
                                    onTogglePrivilege(activeRoleId, priv.id)
                                  }
                                  aria-label={`${priv.name} for ${roles.find((r) => r.role_id === activeRoleId)?.role_name}`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <span className="text-sm font-medium text-iip-text">
                                      {priv.name}
                                    </span>
                                    <code className="text-[11px] font-mono text-iip-primary/90">
                                      {privilegeKey(priv.privilege_code)}
                                    </code>
                                  </div>
                                  {linked.length > 0 ? (
                                    <ul className="mt-2 ml-1 border-l-2 border-iip-primary/20 pl-3 space-y-1">
                                      {linked.map((m) => (
                                        <li
                                          key={m.menu_key}
                                          className="text-xs text-iip-text-muted flex items-center gap-1.5"
                                        >
                                          <span
                                            className={`h-1 w-1 rounded-full shrink-0 ${
                                              checked
                                                ? 'bg-iip-primary'
                                                : 'bg-iip-border'
                                            }`}
                                            aria-hidden
                                          />
                                          <span className="truncate">
                                            {m.label}
                                            {m.is_group && (
                                              <span className="ml-1 text-[10px] uppercase text-iip-text-muted/80">
                                                group
                                              </span>
                                            )}
                                          </span>
                                          <code className="text-[10px] font-mono opacity-70">
                                            {m.menu_key}
                                          </code>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="text-xs text-iip-text-muted/80 mt-1 italic">
                                      No menus linked yet
                                    </p>
                                  )}
                                </div>
                                {checked && (
                                  <Check
                                    size={16}
                                    className="text-iip-primary shrink-0 mt-0.5"
                                    aria-hidden
                                  />
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
