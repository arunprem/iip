import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Shield, ShieldAlert, Trash2, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminInteractiveDataTable } from '../../components/admin/AdminInteractiveDataTable';
import { RoleMenuAccessEditor } from '../../components/admin/RoleMenuAccessEditor';
import { AdminSectionCard } from '../../components/admin/AdminSectionCard';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import {
  confirmDeleteRole,
  showRoleDeleteBlocked,
} from '../../utils/confirmDialog';
import { getApiErrorMessage, useIamRoles, type IAMRole } from '../../hooks/useIamRoles';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';

const PROTECTED_ROLES = new Set(['SYSTEM_ADMIN']);

interface MenuPrivilege {
  id: string;
  privilege_code: string;
  name: string;
  module: string;
}

interface LinkedMenuRow {
  id: string;
  privilege_id: string | null;
  menu_key: string;
  label: string;
  is_group: boolean;
}

interface MenuMatrixRow {
  role_id: string;
  role_name: string;
  privilege_ids: string[];
}

const emptyRoleForm = {
  role_name: '',
  description: '',
  requires_jit: false,
};

function roleToForm(role: IAMRole) {
  return {
    role_name: role.role_name,
    description: role.description,
    requires_jit: role.requires_jit,
  };
}

export default function RoleManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const roleFormRef = useRef<HTMLDivElement>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [menuDraft, setMenuDraft] = useState<Record<string, Set<string>>>({});
  const [menuSaved, setMenuSaved] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

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

  const { data: linkedMenus } = useQuery({
    queryKey: ['admin-menus', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<LinkedMenuRow[]>('/iam/menus/', {
        params: { include_inactive: true, flat: true },
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

  const menuBaseline = useMemo(() => {
    const baseline: Record<string, Set<string>> = {};
    for (const row of menuMatrix ?? []) {
      baseline[row.role_id] = new Set(row.privilege_ids);
    }
    return baseline;
  }, [menuMatrix]);

  const menuState = useMemo(() => {
    const state: Record<string, Set<string>> = {};
    const roleIds = new Set([
      ...Object.keys(menuBaseline),
      ...Object.keys(menuDraft),
    ]);
    for (const roleId of roleIds) {
      state[roleId] =
        menuDraft[roleId] !== undefined
          ? new Set(menuDraft[roleId])
          : new Set(menuBaseline[roleId] ?? []);
    }
    return state;
  }, [menuDraft, menuBaseline]);

  const hasUnsavedMenuChanges = Object.keys(menuDraft).length > 0;
  const roleList = roles ?? [];
  const isEditingRole = Boolean(editingRoleId);

  useEffect(() => {
    if (!selectedRoleId && roleList.length > 0) {
      setSelectedRoleId(roleList[0].role_id);
    }
    if (selectedRoleId && !roleList.some((r) => r.role_id === selectedRoleId)) {
      setSelectedRoleId(roleList[0]?.role_id ?? null);
    }
  }, [roleList, selectedRoleId]);

  const resetRoleForm = () => {
    setRoleForm(emptyRoleForm);
    setEditingRoleId(null);
  };

  const focusRoleForm = () => {
    roleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const el = document.getElementById('role-description');
      if (el instanceof HTMLTextAreaElement) {
        el.focus({ preventScroll: true });
      }
    }, 350);
  };

  const startEditRole = (role: IAMRole) => {
    setEditingRoleId(role.role_id);
    setRoleForm(roleToForm(role));
    requestAnimationFrame(() => focusRoleForm());
  };

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/roles/', {
        role_name: roleForm.role_name.trim(),
        description: roleForm.description.trim(),
        privileges: [],
        requires_jit: roleForm.requires_jit,
      });
    },
    onSuccess: async () => {
      resetRoleForm();
      await queryClient.invalidateQueries({ queryKey: ['iam-roles'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-menu'] });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async () => {
      if (!editingRoleId) return;
      await apiClient.patch(`/iam/roles/${editingRoleId}`, {
        description: roleForm.description.trim(),
        requires_jit: roleForm.requires_jit,
      });
    },
    onSuccess: async () => {
      resetRoleForm();
      await queryClient.invalidateQueries({ queryKey: ['iam-roles'] });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      await apiClient.delete(`/iam/roles/${roleId}`);
    },
    onSuccess: async (_data, deletedId) => {
      if (editingRoleId === deletedId) resetRoleForm();
      await queryClient.invalidateQueries({ queryKey: ['iam-roles'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-menu'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
      void useAuthStore.getState().fetchPermissions();
    },
  });

  const handleDeleteRole = async (role: IAMRole) => {
    if (PROTECTED_ROLES.has(role.role_name)) {
      showToast('error', `${role.role_name} is a protected system role and cannot be deleted.`);
      return;
    }
    try {
      const check = await apiClient.get<{ can_delete: boolean; blockers: string[] }>(
        `/iam/roles/${role.role_id}/deletion-check`
      );
      if (!check.data.can_delete) {
        await showRoleDeleteBlocked(check.data.blockers);
        return;
      }
    } catch {
      showToast('error', 'Could not verify whether this role can be deleted. Try again.');
      return;
    }
    const confirmed = await confirmDeleteRole({
      role_name: role.role_name,
      description: role.description,
    });
    if (!confirmed) return;
    deleteRoleMutation.mutate(role.role_id);
  };

  const saveMenuAccessMutation = useMutation({
    mutationFn: async () => {
      for (const role of roleList) {
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
      const set = new Set(next[roleId] ?? menuBaseline[roleId] ?? []);
      if (set.has(privilegeId)) set.delete(privilegeId);
      else set.add(privilegeId);
      next[roleId] = set;
      return next;
    });
  };

  const setModuleGrants = (roleId: string, privilegeIds: string[], grant: boolean) => {
    setMenuDraft((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? menuBaseline[roleId] ?? []);
      for (const id of privilegeIds) {
        if (grant) set.add(id);
        else set.delete(id);
      }
      next[roleId] = set;
      return next;
    });
  };

  const setAllMenuGrants = (roleId: string, grant: boolean) => {
    setMenuDraft((prev) => {
      const next = { ...prev };
      next[roleId] = grant ? new Set((menuPrivs ?? []).map((p) => p.id)) : new Set();
      return next;
    });
  };

  const linkedMenuHints = useMemo(
    () =>
      (linkedMenus ?? [])
        .filter((m): m is LinkedMenuRow & { privilege_id: string } => Boolean(m.privilege_id))
        .map((m) => ({
          privilege_id: m.privilege_id!,
          menu_key: m.menu_key,
          label: m.label,
          is_group: m.is_group,
        })),
    [linkedMenus]
  );

  const roleFormPending = createRoleMutation.isPending || updateRoleMutation.isPending;
  const canSaveRole =
    roleForm.role_name.trim().length > 0 && roleForm.description.trim().length > 0;
  const canCreateRole = !isEditingRole && canSaveRole;

  return (
    <AdminPageLayout
      title="Role Management"
      description="Define roles, assign menu visibility, and control which navigation each role can access."
      icon={Shield}
    >
      <div className="space-y-6">
        <AdminTipBanner>
          Create roles here, then assign <strong>MENU privileges</strong> per role using the tree
          editor below. Link privileges to menus in <strong>Menu Management</strong>.
        </AdminTipBanner>

        <div className="dashboard-card overflow-hidden">
          <div ref={roleFormRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
            <div className="admin-form-panel-header">
              <p className="text-sm font-semibold text-iip-text">
                {isEditingRole ? 'Edit role' : 'New role'}
              </p>
              <p className="text-xs text-iip-text-muted mt-1 max-w-3xl leading-relaxed">
                {isEditingRole
                  ? 'Update description or JIT requirement. Role name cannot be changed.'
                  : 'Use uppercase names with underscores, e.g. FIELD_ANALYST.'}
              </p>
            </div>

            <div className="admin-form-panel-body space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <AdminFormField
                  id="role-name"
                  label="Role name"
                  required={!isEditingRole}
                  hint={isEditingRole ? 'Immutable after creation.' : 'e.g. FIELD_ANALYST'}
                >
                  <input
                    id="role-name"
                    className={`form-control font-mono text-sm uppercase ${
                      isEditingRole ? 'bg-iip-surface-hover cursor-not-allowed' : ''
                    }`}
                    placeholder="FIELD_ANALYST"
                    value={roleForm.role_name}
                    readOnly={isEditingRole}
                    disabled={isEditingRole}
                    onChange={(e) =>
                      setRoleForm((s) => ({
                        ...s,
                        role_name: e.target.value
                          .toUpperCase()
                          .replace(/\s+/g, '_')
                          .replace(/[^A-Z0-9_]/g, ''),
                      }))
                    }
                  />
                </AdminFormField>

                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2.5 h-[2.75rem] px-3 rounded-lg border border-iip-border bg-iip-bg cursor-pointer w-full">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-iip-border"
                      checked={roleForm.requires_jit}
                      onChange={(e) =>
                        setRoleForm((s) => ({ ...s, requires_jit: e.target.checked }))
                      }
                    />
                    <span className="text-sm text-iip-text">
                      <span className="font-medium">Requires JIT elevation</span>
                    </span>
                  </label>
                </div>
              </div>

              <AdminFormField id="role-description" label="Description" required>
                <textarea
                  id="role-description"
                  className="form-control"
                  rows={3}
                  placeholder="Describe what this role is for and who should receive it."
                  value={roleForm.description}
                  onChange={(e) =>
                    setRoleForm((s) => ({ ...s, description: e.target.value }))
                  }
                />
              </AdminFormField>
            </div>

            <div className="admin-form-panel-footer">
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={resetRoleForm}
                disabled={roleFormPending}
              >
                {isEditingRole ? <X size={15} aria-hidden /> : null}
                {isEditingRole ? 'Cancel' : 'Clear'}
              </AdminButton>
              <span className="admin-form-actions-spacer flex-1" aria-hidden />
              <AdminButton
                variant="primary"
                size="sm"
                onClick={() =>
                  isEditingRole ? updateRoleMutation.mutate() : createRoleMutation.mutate()
                }
                disabled={roleFormPending || (isEditingRole ? !canSaveRole : !canCreateRole)}
              >
                {isEditingRole ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                {roleFormPending
                  ? 'Saving…'
                  : isEditingRole
                    ? 'Save changes'
                    : 'Create role'}
              </AdminButton>
            </div>
          </div>
        </div>

        <AdminSectionCard
          step={1}
          title="Defined roles"
          description="Search and manage all roles. Click Edit to load a role into the form above."
        >
          {isError && (
            <div className="px-5 py-6 flex flex-col gap-3 text-red-600 border-b border-iip-border">
              <div className="flex items-start gap-3">
                <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                <p className="text-sm">{getApiErrorMessage(error)}</p>
              </div>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="self-start"
              >
                {isFetching ? 'Retrying…' : 'Retry'}
              </AdminButton>
            </div>
          )}
          {!isError && (
            <AdminInteractiveDataTable
              isLoading={isLoading}
              data={roleList}
              keyField={(r) => r.role_id}
              searchPlaceholder="Search by role name or description…"
              defaultSort={{ key: 'name', direction: 'asc' }}
              getSearchText={(r) => [r.role_name, r.description].join(' ')}
              emptyMessage="No roles defined yet. Create one above."
              columns={[
                {
                  key: 'name',
                  header: 'Role',
                  sortable: true,
                  sortValue: (r) => r.role_name,
                  render: (r) => (
                    <span className="font-semibold text-iip-text">{r.role_name}</span>
                  ),
                },
                {
                  key: 'desc',
                  header: 'Description',
                  sortable: true,
                  sortValue: (r) => r.description,
                  render: (r) => (
                    <span className="text-iip-text-muted line-clamp-2 max-w-md">
                      {r.description}
                    </span>
                  ),
                },
                {
                  key: 'jit',
                  header: 'JIT',
                  className: 'text-center',
                  sortable: true,
                  sortValue: (r) => r.requires_jit,
                  render: (r) => (
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        r.requires_jit
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400'
                      }`}
                    >
                      {r.requires_jit ? 'Yes' : 'No'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  className: 'text-right w-[150px]',
                  render: (r) => (
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <AdminButton
                        variant={editingRoleId === r.role_id ? 'active' : 'ghost'}
                        size="xs"
                        onClick={() => startEditRole(r)}
                      >
                        <Pencil size={14} aria-hidden />
                        Edit
                      </AdminButton>
                      {!PROTECTED_ROLES.has(r.role_name) && (
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => handleDeleteRole(r)}
                          disabled={deleteRoleMutation.isPending}
                        >
                          <Trash2 size={14} aria-hidden />
                          Delete
                        </AdminButton>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </AdminSectionCard>

        <AdminSectionCard
          step={2}
          title="Role × menu access"
          description="Pick a role, then grant privileges by module. Linked menu items are shown under each privilege."
          className="pb-24 !overflow-hidden"
        >
          <RoleMenuAccessEditor
            roles={roleList}
            privileges={menuPrivs ?? []}
            linkedMenus={linkedMenuHints}
            menuState={menuState}
            menuBaseline={menuBaseline}
            selectedRoleId={selectedRoleId}
            onSelectRole={setSelectedRoleId}
            onTogglePrivilege={toggleMenu}
            onSetModuleGrants={setModuleGrants}
            onSetAllGrants={setAllMenuGrants}
            isLoading={menuMatrixLoading}
          />
        </AdminSectionCard>

        {roleList.length > 0 && (
          <button
            type="button"
            onClick={() => saveMenuAccessMutation.mutate()}
            disabled={saveMenuAccessMutation.isPending || !hasUnsavedMenuChanges}
            className={`admin-fab-save ${hasUnsavedMenuChanges ? 'admin-fab-save--dirty' : ''}`}
            aria-label="Save menu access changes"
            title={
              hasUnsavedMenuChanges
                ? 'Save unsaved menu access changes'
                : 'No changes to save'
            }
          >
            <Save size={18} aria-hidden />
            {saveMenuAccessMutation.isPending
              ? 'Saving…'
              : menuSaved
                ? 'Saved'
                : 'Save menu access'}
            {hasUnsavedMenuChanges && !saveMenuAccessMutation.isPending && !menuSaved && (
              <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" aria-hidden />
            )}
          </button>
        )}
      </div>
    </AdminPageLayout>
  );
}
