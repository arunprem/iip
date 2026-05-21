import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Shield, ShieldAlert } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { getApiErrorMessage, useIamRoles } from '../../hooks/useIamRoles';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';

interface MenuPrivilege {
  id: string;
  privilege_code: string;
  name: string;
}

interface MenuMatrixRow {
  role_id: string;
  role_name: string;
  privilege_ids: string[];
}

interface RoleRow {
  role_id: string;
  role_name: string;
}

export default function RoleManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const [menuDraft, setMenuDraft] = useState<Record<string, Set<string>>>({});
  const [menuSaved, setMenuSaved] = useState(false);

  const { data: roles, isLoading, isError, error, refetch, isFetching } = useIamRoles();

  const { data: menuPrivs } = useQuery({
    queryKey: ['privileges-menu', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<MenuPrivilege[]>('/iam/privileges/', {
        params: { privilege_type: 'MENU' },
      });
      return res.data;
    },
  });

  const { data: menuMatrix, isLoading: menuMatrixLoading } = useQuery({
    queryKey: ['matrix-menu', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<MenuMatrixRow[]>('/iam/privileges/matrix/menu');
      return res.data;
    },
  });

  const menuState = useMemo(() => {
    const draft: Record<string, Set<string>> = { ...menuDraft };
    for (const row of menuMatrix ?? []) {
      if (!draft[row.role_id]) draft[row.role_id] = new Set(row.privilege_ids);
    }
    return draft;
  }, [menuMatrix, menuDraft]);

  const saveMenuAccessMutation = useMutation({
    mutationFn: async () => {
      for (const role of roles ?? []) {
        await apiClient.put(
          '/iam/privileges/matrix/menu',
          {
            role_id: role.role_id,
            privilege_ids: Array.from(menuState[role.role_id] ?? []),
          },
          { skipSuccessToast: true }
        );
      }
    },
    onSuccess: async () => {
      showToast('success', 'Role menu access saved successfully.');
      setMenuSaved(true);
      setMenuDraft({});
      await queryClient.invalidateQueries({ queryKey: ['matrix-menu'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
      void useAuthStore.getState().fetchPermissions();
      setTimeout(() => setMenuSaved(false), 2000);
    },
  });

  const toggleMenu = (roleId: string, privilegeId: string) => {
    setMenuDraft((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? menuState[roleId] ?? []);
      if (set.has(privilegeId)) set.delete(privilegeId);
      else set.add(privilegeId);
      next[roleId] = set;
      return next;
    });
  };

  const roleRows: RoleRow[] = (roles ?? []).map((r) => ({
    role_id: r.role_id,
    role_name: r.role_name,
  }));

  return (
    <AdminPageLayout
      title="Role Management"
      description="Maintain roles and assign MENU privileges so each role can see the linked navigation items."
      icon={Shield}
      actions={
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover transition-colors opacity-60 cursor-not-allowed"
          disabled
          title="Coming soon"
        >
          <Plus size={16} />
          Create Role
        </button>
      }
    >
      <div className="dashboard-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-iip-border flex items-center justify-between">
          <p className="text-sm font-semibold text-iip-text">Defined Roles</p>
          <span className="text-xs text-iip-text-muted">
            {roles?.length ?? 0} role{(roles?.length ?? 0) === 1 ? '' : 's'}
          </span>
        </div>

        {isLoading && (
          <p className="p-8 text-sm text-iip-text-muted text-center">Loading roles...</p>
        )}

        {isError && (
          <div className="p-8 flex flex-col gap-3 text-red-600">
            <div className="flex items-start gap-3">
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <p className="text-sm">{getApiErrorMessage(error)}</p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="self-start text-sm font-medium text-iip-primary hover:underline disabled:opacity-50"
            >
              {isFetching ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-iip-border bg-iip-bg/50 text-left">
                  <th className="px-5 py-3 font-medium text-iip-text-muted">Role</th>
                  <th className="px-5 py-3 font-medium text-iip-text-muted">Description</th>
                  <th className="px-5 py-3 font-medium text-iip-text-muted">JIT Required</th>
                </tr>
              </thead>
              <tbody>
                {(roles ?? []).map((role) => (
                  <tr key={role.role_id} className="border-b border-iip-border/80 last:border-0">
                    <td className="px-5 py-4 font-semibold text-iip-text">{role.role_name}</td>
                    <td className="px-5 py-4 text-iip-text-muted">{role.description || '—'}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          role.requires_jit
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400'
                        }`}
                      >
                        {role.requires_jit ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
                {(roles ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-iip-text-muted">
                      No roles defined yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-iip-text">Role × menu access</p>
            <p className="text-xs text-iip-text-muted mt-1">
              Grant MENU privileges to roles. Menus linked to the same privilege become visible
              together.
            </p>
          </div>
          <button
            type="button"
            onClick={() => saveMenuAccessMutation.mutate()}
            disabled={saveMenuAccessMutation.isPending || !roleRows.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover disabled:opacity-50"
          >
            <Save size={16} />
            {menuSaved ? 'Saved' : 'Save menu access'}
          </button>
        </div>
        <AdminDataTable
          isLoading={menuMatrixLoading}
          data={roleRows}
          keyField={(r) => r.role_id}
          columns={[
            {
              key: 'role',
              header: 'Role',
              render: (r) => <span className="font-medium">{r.role_name}</span>,
            },
            ...(menuPrivs ?? []).map((p) => ({
              key: p.id,
              header: p.privilege_code.replace('menu:', ''),
              className: 'text-center',
              render: (r: RoleRow) => (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={(menuState[r.role_id] ?? new Set()).has(p.id)}
                  onChange={() => toggleMenu(r.role_id, p.id)}
                />
              ),
            })),
          ]}
        />
      </div>
    </AdminPageLayout>
  );
}
