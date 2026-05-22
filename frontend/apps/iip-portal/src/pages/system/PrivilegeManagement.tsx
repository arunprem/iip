import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  KeyRound,
  LayoutList,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  confirmDeleteAction,
  confirmDeletePrivilege,
  showPrivilegeDeleteBlocked,
} from '../../utils/confirmDialog';
import { apiClient } from '../../api/client';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { AdminInteractiveDataTable } from '../../components/admin/AdminInteractiveDataTable';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminSectionCard } from '../../components/admin/AdminSectionCard';
import { AdminTabBar } from '../../components/admin/AdminTabBar';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';

interface Privilege {
  id: string;
  privilege_code: string;
  name: string;
  description: string;
  module: string;
  privilege_type: string;
  is_active: boolean;
  actions: { id: string; action_code: string; action_label: string }[];
}

interface RoleRow {
  role_id: string;
  role_name: string;
}

interface DataMatrixRow {
  role_id: string;
  role_name: string;
  privilege_id: string;
  privilege_code: string;
  actions: { action_id: string; granted: boolean }[];
}

type Tab = 'menu' | 'data';

const emptyMenuPrivilegeForm = {
  privilege_code: '',
  name: '',
  description: '',
  module: 'Menu',
};

const emptyDataPrivilegeForm = {
  privilege_code: '',
  name: '',
  description: '',
  module: 'Cases',
  seedDefaultActions: true,
};

const DATA_MODULE_OPTIONS = [
  'Cases',
  'HUMINT',
  'Analytics',
  'IAM',
  'System',
  'Administration',
] as const;

interface LinkedMenuRow {
  id: string;
  privilege_id: string | null;
}

export default function PrivilegeManagement() {
  const [tab, setTab] = useState<Tab>('menu');
  const [saved, setSaved] = useState(false);
  const [menuPrivForm, setMenuPrivForm] = useState(emptyMenuPrivilegeForm);
  const [editingMenuPrivId, setEditingMenuPrivId] = useState<string | null>(null);
  const [dataPrivForm, setDataPrivForm] = useState(emptyDataPrivilegeForm);
  const [editingDataPrivId, setEditingDataPrivId] = useState<string | null>(null);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [dataModuleFilter, setDataModuleFilter] = useState('all');
  const [dataActiveFilter, setDataActiveFilter] = useState('all');
  const menuPrivFormRef = useRef<HTMLDivElement>(null);
  const dataPrivFormRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);

  const { data: menuPrivs, isLoading: menuPrivsLoading } = useQuery({
    queryKey: ['privileges-menu', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<Privilege[]>('/iam/privileges/', {
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
    enabled: tab === 'menu',
  });

  const { data: dataPrivs, isLoading: dataPrivsLoading } = useQuery({
    queryKey: ['privileges-data', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<Privilege[]>('/iam/privileges/', {
        params: { privilege_type: 'DATA' },
      });
      return res.data;
    },
  });

  const { data: roles } = useQuery({
    queryKey: ['iam-roles', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<{ role_id: string; role_name: string }[]>('/iam/roles/');
      return res.data;
    },
  });

  const { data: dataMatrix, isLoading: dataLoading } = useQuery({
    queryKey: ['matrix-data', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<DataMatrixRow[]>('/iam/privileges/matrix/data');
      return res.data;
    },
  });

  const [dataDraft, setDataDraft] = useState<Record<string, Set<string>>>({});

  const roleActionBaseline = useMemo(() => {
    const baseline: Record<string, Set<string>> = {};
    for (const row of dataMatrix ?? []) {
      if (!baseline[row.role_id]) baseline[row.role_id] = new Set();
      for (const a of row.actions) {
        if (a.granted) baseline[row.role_id].add(a.action_id);
      }
    }
    return baseline;
  }, [dataMatrix]);

  const dataState = useMemo(() => {
    const state: Record<string, Set<string>> = {};
    const roleIds = new Set([
      ...Object.keys(roleActionBaseline),
      ...Object.keys(dataDraft),
    ]);
    for (const roleId of roleIds) {
      state[roleId] =
        dataDraft[roleId] !== undefined
          ? new Set(dataDraft[roleId])
          : new Set(roleActionBaseline[roleId] ?? []);
    }
    return state;
  }, [dataDraft, roleActionBaseline]);

  const menuPrivList = menuPrivs ?? [];

  const linkedMenuCountByPriv = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of linkedMenus ?? []) {
      if (m.privilege_id) {
        counts[m.privilege_id] = (counts[m.privilege_id] ?? 0) + 1;
      }
    }
    return counts;
  }, [linkedMenus]);

  const moduleOptions = useMemo(() => {
    const modules = [...new Set(menuPrivList.map((p) => p.module))].sort();
    return [
      { value: 'all', label: 'All modules' },
      ...modules.map((m) => ({ value: m, label: m })),
    ];
  }, [menuPrivList]);

  const filteredMenuPrivs = useMemo(() => {
    return menuPrivList.filter((p) => {
      if (moduleFilter !== 'all' && p.module !== moduleFilter) return false;
      if (activeFilter === 'active' && !p.is_active) return false;
      if (activeFilter === 'inactive' && p.is_active) return false;
      return true;
    });
  }, [menuPrivList, moduleFilter, activeFilter]);

  const resetMenuPrivForm = () => {
    setMenuPrivForm(emptyMenuPrivilegeForm);
    setEditingMenuPrivId(null);
  };

  const resetDataPrivForm = () => {
    setDataPrivForm(emptyDataPrivilegeForm);
    setEditingDataPrivId(null);
  };

  const focusDataPrivForm = () => {
    dataPrivFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const nameInput = document.getElementById('data-priv-name');
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus({ preventScroll: true });
      }
    }, 350);
  };

  const startEditDataPriv = (priv: Privilege) => {
    setEditingDataPrivId(priv.id);
    setDataPrivForm({
      privilege_code: priv.privilege_code,
      name: priv.name,
      description: priv.description,
      module: priv.module,
      seedDefaultActions: true,
    });
    requestAnimationFrame(() => focusDataPrivForm());
  };

  const focusMenuPrivForm = () => {
    menuPrivFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => {
      const nameInput = document.getElementById('menu-priv-name');
      if (nameInput instanceof HTMLInputElement) {
        nameInput.focus({ preventScroll: true });
      }
    }, 350);
  };

  const startEditMenuPriv = (priv: Privilege) => {
    setEditingMenuPrivId(priv.id);
    setMenuPrivForm({
      privilege_code: priv.privilege_code,
      name: priv.name,
      description: priv.description,
      module: priv.module,
    });
    requestAnimationFrame(() => focusMenuPrivForm());
  };

  const createMenuPrivilegeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/privileges/', {
        privilege_code: menuPrivForm.privilege_code.trim(),
        name: menuPrivForm.name.trim(),
        description: menuPrivForm.description.trim() || menuPrivForm.name.trim(),
        module: menuPrivForm.module.trim() || 'Menu',
        privilege_type: 'MENU',
      });
    },
    onSuccess: async () => {
      resetMenuPrivForm();
      await queryClient.invalidateQueries({ queryKey: ['privileges-menu'] });
    },
  });

  const updateMenuPrivilegeMutation = useMutation({
    mutationFn: async () => {
      if (!editingMenuPrivId) return;
      await apiClient.patch(`/iam/privileges/${editingMenuPrivId}`, {
        name: menuPrivForm.name.trim(),
        description: menuPrivForm.description.trim() || menuPrivForm.name.trim(),
        module: menuPrivForm.module.trim() || 'Menu',
      });
    },
    onSuccess: async () => {
      resetMenuPrivForm();
      await queryClient.invalidateQueries({ queryKey: ['privileges-menu'] });
    },
  });

  const toggleMenuPrivActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await apiClient.patch(`/iam/privileges/${id}`, { is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['privileges-menu'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
    },
  });

  const createDataPrivilegeMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/privileges/', {
        privilege_code: dataPrivForm.privilege_code.trim(),
        name: dataPrivForm.name.trim(),
        description: dataPrivForm.description.trim() || dataPrivForm.name.trim(),
        module: dataPrivForm.module.trim() || 'Cases',
        privilege_type: 'DATA',
        seed_default_actions: dataPrivForm.seedDefaultActions,
      });
    },
    onSuccess: async () => {
      resetDataPrivForm();
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
      showToast('success', 'Data privilege created.');
    },
  });

  const updateDataPrivilegeMutation = useMutation({
    mutationFn: async () => {
      if (!editingDataPrivId) return;
      await apiClient.patch(`/iam/privileges/${editingDataPrivId}`, {
        name: dataPrivForm.name.trim(),
        description: dataPrivForm.description.trim() || dataPrivForm.name.trim(),
        module: dataPrivForm.module.trim() || 'Cases',
      });
    },
    onSuccess: async () => {
      resetDataPrivForm();
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      showToast('success', 'Data privilege updated.');
    },
  });

  const toggleDataPrivActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await apiClient.patch(`/iam/privileges/${id}`, { is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
      void useAuthStore.getState().fetchPermissions();
    },
  });

  const deletePrivilegeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/iam/privileges/${id}`);
    },
    onSuccess: async (_data, deletedId) => {
      if (editingMenuPrivId === deletedId) resetMenuPrivForm();
      if (editingDataPrivId === deletedId) resetDataPrivForm();
      if (newAction.privilegeId === deletedId) {
        setNewAction({ privilegeId: '', code: '', label: '' });
      }
      await queryClient.invalidateQueries({ queryKey: ['privileges-menu'] });
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-menu'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
      void useAuthStore.getState().fetchPermissions();
    },
  });

  const handleDeletePrivilege = async (priv: Privilege) => {
    try {
      const check = await apiClient.get<{ can_delete: boolean; blockers: string[] }>(
        `/iam/privileges/${priv.id}/deletion-check`
      );
      if (!check.data.can_delete) {
        await showPrivilegeDeleteBlocked(check.data.blockers);
        return;
      }
    } catch {
      showToast('error', 'Could not verify whether this privilege can be deleted. Try again.');
      return;
    }

    const confirmed = await confirmDeletePrivilege({
      name: priv.name,
      privilege_code: priv.privilege_code,
      privilege_type: priv.privilege_type,
      linkedMenuCount: linkedMenuCountByPriv[priv.id] ?? 0,
      actionCount: priv.actions.length,
    });
    if (!confirmed) return;
    deletePrivilegeMutation.mutate(priv.id);
  };

  const saveDataMutation = useMutation({
    mutationFn: async () => {
      for (const role of roles ?? []) {
        await apiClient.put(
          '/iam/privileges/matrix/data',
          {
            role_id: role.role_id,
            action_ids: Array.from(dataState[role.role_id] ?? []),
          },
          { skipSuccessToast: true }
        );
      }
    },
    onSuccess: async () => {
      showToast('success', 'Data privileges saved successfully.');
      setSaved(true);
      setDataDraft({});
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
      void useAuthStore.getState().fetchPermissions();
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggleDataAction = (roleId: string, actionId: string) => {
    setDataDraft((prev) => {
      const next = { ...prev };
      const set = new Set(next[roleId] ?? roleActionBaseline[roleId] ?? []);
      if (set.has(actionId)) set.delete(actionId);
      else set.add(actionId);
      next[roleId] = set;
      return next;
    });
  };

  const [newAction, setNewAction] = useState({ privilegeId: '', code: '', label: '' });

  const addActionMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/iam/privileges/${newAction.privilegeId}/actions`, {
        action_code: newAction.code,
        action_label: newAction.label,
      });
    },
    onSuccess: async () => {
      setNewAction({ privilegeId: '', code: '', label: '' });
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
    },
  });

  const deleteActionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      await apiClient.delete(`/iam/privileges/actions/${actionId}`);
    },
    onSuccess: async () => {
      setDataDraft({});
      await queryClient.invalidateQueries({ queryKey: ['privileges-data'] });
      await queryClient.invalidateQueries({ queryKey: ['matrix-data'] });
      void useAuthStore.getState().fetchPermissions();
    },
  });

  const grantedRoleCountByAction = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of dataMatrix ?? []) {
      for (const a of row.actions) {
        if (a.granted) {
          counts[a.action_id] = (counts[a.action_id] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [dataMatrix]);

  const handleDeleteAction = async (
    action: { id: string; action_code: string; action_label: string },
    priv: Privilege
  ) => {
    const confirmed = await confirmDeleteAction({
      action_code: action.action_code,
      action_label: action.action_label,
      privilege_code: priv.privilege_code,
      grantedRoleCount: grantedRoleCountByAction[action.id] ?? 0,
    });
    if (!confirmed) return;
    deleteActionMutation.mutate(action.id);
  };

  const isEditingMenuPriv = Boolean(editingMenuPrivId);
  const canSaveMenuPriv = menuPrivForm.name.trim().length > 0;
  const canCreateMenuPriv =
    !isEditingMenuPriv &&
    menuPrivForm.privilege_code.trim().length > 0 &&
    menuPrivForm.name.trim().length > 0;
  const menuFormPending =
    createMenuPrivilegeMutation.isPending || updateMenuPrivilegeMutation.isPending;

  const isEditingDataPriv = Boolean(editingDataPrivId);
  const canSaveDataPriv = dataPrivForm.name.trim().length > 0;
  const canCreateDataPriv =
    !isEditingDataPriv &&
    dataPrivForm.privilege_code.trim().length > 0 &&
    dataPrivForm.name.trim().length > 0;
  const dataFormPending =
    createDataPrivilegeMutation.isPending || updateDataPrivilegeMutation.isPending;

  const dataPrivList = dataPrivs ?? [];

  const dataModuleOptions = useMemo(() => {
    const modules = [...new Set(dataPrivList.map((p) => p.module))].sort();
    return [
      { value: 'all', label: 'All modules' },
      ...modules.map((m) => ({ value: m, label: m })),
    ];
  }, [dataPrivList]);

  const filteredDataPrivs = useMemo(() => {
    return dataPrivList.filter((p) => {
      if (dataModuleFilter !== 'all' && p.module !== dataModuleFilter) return false;
      if (dataActiveFilter === 'active' && !p.is_active) return false;
      if (dataActiveFilter === 'inactive' && p.is_active) return false;
      return true;
    });
  }, [dataPrivList, dataModuleFilter, dataActiveFilter]);

  const hasUnsavedDataChanges = Object.keys(dataDraft).length > 0;
  const dataPrivsWithActions = dataPrivList.filter((p) => p.actions.length > 0);

  return (
    <AdminPageLayout
      title="Privilege Management"
      description="Create MENU and DATA privileges for new modules. Link menus in Menu Management, then assign data actions per role."
      icon={KeyRound}
    >
      <AdminTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'menu',
            label: 'Menu privileges',
            icon: LayoutList,
            badge: menuPrivList.length,
          },
          {
            id: 'data',
            label: 'Data privileges',
            icon: Database,
            badge: dataPrivs?.length ?? 0,
          },
        ]}
      />

      {tab === 'menu' && (
        <div className="space-y-6 mt-6">
          <AdminTipBanner>
            Create <strong>MENU</strong> privileges here, link them in{' '}
            <strong>Menu Management</strong>, and assign roles in{' '}
            <strong>Role Management</strong>.
          </AdminTipBanner>
          <div className="dashboard-card mb-4 overflow-hidden">
            <div ref={menuPrivFormRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
              <div className="admin-form-panel-header">
                <p className="text-sm font-semibold text-iip-text">
                  {isEditingMenuPriv ? 'Edit MENU privilege' : 'New MENU privilege'}
                </p>
                <p className="text-xs text-iip-text-muted mt-1 max-w-3xl leading-relaxed">
                  {isEditingMenuPriv ? (
                    <>
                      Update the display name, description, or module. The privilege code cannot
                      be changed after creation.
                    </>
                  ) : (
                    <>
                      Create privileges here, then link them to navigation items in{' '}
                      <span className="font-medium text-iip-text">Menu Management</span>. Assign
                      which roles receive each privilege in{' '}
                      <span className="font-medium text-iip-text">Role Management</span>.
                    </>
                  )}
                </p>
              </div>

              <div className="admin-form-panel-body space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <AdminFormField
                    id="menu-priv-code"
                    label="Privilege code"
                    required={!isEditingMenuPriv}
                    hint={
                      isEditingMenuPriv
                        ? 'Immutable after creation.'
                        : 'Unique identifier. Use the "menu:" prefix, e.g. menu:cases.'
                    }
                  >
                    {isEditingMenuPriv ? (
                      <input
                        id="menu-priv-code"
                        className="form-control font-mono text-sm bg-iip-surface-hover cursor-not-allowed"
                        value={menuPrivForm.privilege_code}
                        readOnly
                        disabled
                      />
                    ) : (
                      <div className="flex rounded-lg border border-iip-border bg-iip-bg overflow-hidden focus-within:ring-2 focus-within:ring-iip-primary/25 focus-within:border-iip-primary">
                        <span className="inline-flex items-center px-3 text-xs font-mono text-iip-text-muted bg-iip-surface border-r border-iip-border shrink-0">
                          menu:
                        </span>
                        <input
                          id="menu-priv-code"
                          className="flex-1 min-h-[2.75rem] px-3 py-2.5 text-sm font-mono bg-transparent border-0 text-iip-text placeholder:text-iip-text-muted/70 focus:outline-none focus:ring-0"
                          placeholder="cases"
                          value={menuPrivForm.privilege_code.replace(/^menu:/i, '')}
                          onChange={(e) => {
                            const slug = e.target.value
                              .trim()
                              .toLowerCase()
                              .replace(/\s+/g, '-')
                              .replace(/[^a-z0-9-_]/g, '');
                            setMenuPrivForm((s) => ({
                              ...s,
                              privilege_code: slug ? `menu:${slug}` : '',
                            }));
                          }}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </AdminFormField>

                  <AdminFormField
                    id="menu-priv-name"
                    label="Display name"
                    required
                    hint="Shown in admin screens and privilege pickers."
                  >
                    <input
                      id="menu-priv-name"
                      className="form-control"
                      placeholder="Intelligence Cases"
                      value={menuPrivForm.name}
                      onChange={(e) => setMenuPrivForm((s) => ({ ...s, name: e.target.value }))}
                    />
                  </AdminFormField>
                </div>

                <AdminFormField
                  id="menu-priv-desc"
                  label="Description"
                  hint="Optional. Explain what this privilege grants access to."
                >
                  <textarea
                    id="menu-priv-desc"
                    className="form-control"
                    rows={3}
                    placeholder="Allows navigation to the intelligence cases module and related views."
                    value={menuPrivForm.description}
                    onChange={(e) =>
                      setMenuPrivForm((s) => ({ ...s, description: e.target.value }))
                    }
                  />
                </AdminFormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <AdminFormField
                    id="menu-priv-module"
                    label="Module"
                    hint="Grouping label for reporting and filters."
                  >
                    <select
                      id="menu-priv-module"
                      className="form-control"
                      value={menuPrivForm.module}
                      onChange={(e) => setMenuPrivForm((s) => ({ ...s, module: e.target.value }))}
                    >
                      <option value="Menu">Menu</option>
                      <option value="System">System</option>
                      <option value="Administration">Administration</option>
                      <option value="Analytics">Analytics</option>
                    </select>
                  </AdminFormField>

                  <div className="lg:col-span-2 flex items-end">
                    <div className="w-full rounded-lg border border-dashed border-iip-border bg-iip-surface/50 px-4 py-3">
                      <p className="text-xs font-medium text-iip-text-muted uppercase tracking-wide">
                        Preview
                      </p>
                      <p className="mt-1 text-sm font-mono text-iip-primary truncate">
                        {menuPrivForm.privilege_code || 'menu:your-code'}
                      </p>
                      <p className="text-sm text-iip-text truncate">
                        {menuPrivForm.name || 'Display name'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-form-panel-footer">
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={resetMenuPrivForm}
                  disabled={menuFormPending}
                >
                  {isEditingMenuPriv ? <X size={15} aria-hidden /> : null}
                  {isEditingMenuPriv ? 'Cancel' : 'Clear'}
                </AdminButton>
                <span className="admin-form-actions-spacer flex-1" aria-hidden />
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    isEditingMenuPriv
                      ? updateMenuPrivilegeMutation.mutate()
                      : createMenuPrivilegeMutation.mutate()
                  }
                  disabled={
                    menuFormPending ||
                    (isEditingMenuPriv ? !canSaveMenuPriv : !canCreateMenuPriv)
                  }
                >
                  {isEditingMenuPriv ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                  {menuFormPending
                    ? 'Saving…'
                    : isEditingMenuPriv
                      ? 'Save changes'
                      : 'Create menu privilege'}
                </AdminButton>
              </div>
            </div>
          </div>

          <div className="dashboard-card overflow-hidden">
            <div className="px-5 py-4 border-b border-iip-border">
              <p className="text-sm font-semibold text-iip-text">MENU privileges</p>
              <p className="text-xs text-iip-text-muted mt-1">
                {menuPrivList.length} defined — search, sort, and filter below. Click Edit to load
                into the form above.
              </p>
            </div>
            <AdminInteractiveDataTable
              isLoading={menuPrivsLoading}
              data={filteredMenuPrivs}
              keyField={(p) => p.id}
              searchPlaceholder="Search by code, name, description, module…"
              defaultSort={{ key: 'code', direction: 'asc' }}
              getSearchText={(p) =>
                [p.privilege_code, p.name, p.description, p.module].join(' ')
              }
              filters={[
                {
                  id: 'module',
                  label: 'Module',
                  value: moduleFilter,
                  onChange: setModuleFilter,
                  options: moduleOptions,
                },
                {
                  id: 'active',
                  label: 'Status',
                  value: activeFilter,
                  onChange: setActiveFilter,
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ],
                },
              ]}
              emptyMessage={
                menuPrivList.length === 0
                  ? 'No MENU privileges yet.'
                  : 'No privileges match your search or filters.'
              }
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  sortable: true,
                  sortValue: (p) => p.privilege_code,
                  render: (p) => (
                    <code className="text-xs font-mono text-iip-primary">{p.privilege_code}</code>
                  ),
                },
                {
                  key: 'name',
                  header: 'Name',
                  sortable: true,
                  sortValue: (p) => p.name,
                  render: (p) => <span className="font-medium">{p.name}</span>,
                },
                {
                  key: 'module',
                  header: 'Module',
                  sortable: true,
                  sortValue: (p) => p.module,
                  render: (p) => p.module,
                },
                {
                  key: 'menus',
                  header: 'Menus',
                  className: 'text-center tabular-nums',
                  sortable: true,
                  sortValue: (p) => linkedMenuCountByPriv[p.id] ?? 0,
                  render: (p) => linkedMenuCountByPriv[p.id] ?? 0,
                },
                {
                  key: 'desc',
                  header: 'Description',
                  sortable: true,
                  sortValue: (p) => p.description,
                  render: (p) => (
                    <span className="text-iip-text-muted line-clamp-2">{p.description}</span>
                  ),
                },
                {
                  key: 'active',
                  header: 'Active',
                  className: 'text-center',
                  sortable: true,
                  sortValue: (p) => p.is_active,
                  render: (p) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={p.is_active}
                      disabled={toggleMenuPrivActiveMutation.isPending}
                      onChange={() =>
                        toggleMenuPrivActiveMutation.mutate({
                          id: p.id,
                          is_active: !p.is_active,
                        })
                      }
                    />
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  className: 'text-right w-[140px]',
                  render: (p) => (
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <AdminButton
                        variant={editingMenuPrivId === p.id ? 'active' : 'ghost'}
                        size="xs"
                        onClick={() => startEditMenuPriv(p)}
                      >
                        <Pencil size={14} aria-hidden />
                        Edit
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        size="xs"
                        onClick={() => handleDeletePrivilege(p)}
                        disabled={deletePrivilegeMutation.isPending}
                        title="Delete privilege"
                      >
                        <Trash2 size={14} aria-hidden />
                        Delete
                      </AdminButton>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div className="space-y-6 mt-6 pb-24">
          <AdminTipBanner>
            When you add a new module, create matching privileges: <strong>menu:…</strong> in the Menu
            tab (for navigation) and <strong>data:…</strong> here (for Read/Create/Update actions).
            Use the same slug for both (e.g. <code className="font-mono text-xs">menu:reports</code> and{' '}
            <code className="font-mono text-xs">data:reports</code>). Grant roles in the matrix below,
            then save with the floating button.
          </AdminTipBanner>

          <div className="dashboard-card mb-4 overflow-hidden">
            <div ref={dataPrivFormRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
              <div className="admin-form-panel-header">
                <p className="text-sm font-semibold text-iip-text">
                  {isEditingDataPriv ? 'Edit DATA privilege' : 'New DATA privilege'}
                </p>
                <p className="text-xs text-iip-text-muted mt-1 max-w-3xl leading-relaxed">
                  {isEditingDataPriv ? (
                    <>
                      Update the display name, description, or module. The privilege code cannot be
                      changed after creation. Add or remove actions in step 3 below.
                    </>
                  ) : (
                    <>
                      Create a data privilege for a new module, then add custom actions (step 3) and
                      assign them to roles in the matrix (step 4). Pair with a{' '}
                      <span className="font-medium text-iip-text">MENU</span> privilege for the same
                      feature.
                    </>
                  )}
                </p>
              </div>

              <div className="admin-form-panel-body space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <AdminFormField
                    id="data-priv-code"
                    label="Privilege code"
                    required={!isEditingDataPriv}
                    hint={
                      isEditingDataPriv
                        ? 'Immutable after creation.'
                        : 'Use the "data:" prefix, e.g. data:cases — match your menu slug.'
                    }
                  >
                    {isEditingDataPriv ? (
                      <input
                        id="data-priv-code"
                        className="form-control font-mono text-sm bg-iip-surface-hover cursor-not-allowed"
                        value={dataPrivForm.privilege_code}
                        readOnly
                        disabled
                      />
                    ) : (
                      <div className="flex rounded-lg border border-iip-border bg-iip-bg overflow-hidden focus-within:ring-2 focus-within:ring-iip-primary/25 focus-within:border-iip-primary">
                        <span className="inline-flex items-center px-3 text-xs font-mono text-iip-text-muted bg-iip-surface border-r border-iip-border shrink-0">
                          data:
                        </span>
                        <input
                          id="data-priv-code"
                          className="flex-1 min-h-[2.75rem] px-3 py-2.5 text-sm font-mono bg-transparent border-0 text-iip-text placeholder:text-iip-text-muted/70 focus:outline-none focus:ring-0"
                          placeholder="cases"
                          value={dataPrivForm.privilege_code.replace(/^data:/i, '')}
                          onChange={(e) => {
                            const slug = e.target.value
                              .trim()
                              .toLowerCase()
                              .replace(/\s+/g, '-')
                              .replace(/[^a-z0-9-_]/g, '');
                            setDataPrivForm((s) => ({
                              ...s,
                              privilege_code: slug ? `data:${slug}` : '',
                            }));
                          }}
                          autoComplete="off"
                        />
                      </div>
                    )}
                  </AdminFormField>

                  <AdminFormField
                    id="data-priv-name"
                    label="Display name"
                    required
                    hint="Shown in admin screens and the role matrix."
                  >
                    <input
                      id="data-priv-name"
                      className="form-control"
                      placeholder="Intelligence Cases"
                      value={dataPrivForm.name}
                      onChange={(e) => setDataPrivForm((s) => ({ ...s, name: e.target.value }))}
                    />
                  </AdminFormField>
                </div>

                <AdminFormField
                  id="data-priv-desc"
                  label="Description"
                  hint="What data this privilege protects (API / records / operations)."
                >
                  <textarea
                    id="data-priv-desc"
                    className="form-control"
                    rows={3}
                    placeholder="Permissions for intelligence case records."
                    value={dataPrivForm.description}
                    onChange={(e) =>
                      setDataPrivForm((s) => ({ ...s, description: e.target.value }))
                    }
                  />
                </AdminFormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  <AdminFormField id="data-priv-module" label="Module" hint="Grouping for filters and reporting.">
                    <select
                      id="data-priv-module"
                      className="form-control"
                      value={dataPrivForm.module}
                      onChange={(e) => setDataPrivForm((s) => ({ ...s, module: e.target.value }))}
                    >
                      {DATA_MODULE_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!DATA_MODULE_OPTIONS.includes(
                        dataPrivForm.module as (typeof DATA_MODULE_OPTIONS)[number]
                      ) && dataPrivForm.module ? (
                        <option value={dataPrivForm.module}>{dataPrivForm.module}</option>
                      ) : null}
                    </select>
                  </AdminFormField>

                  {!isEditingDataPriv && (
                    <label className="lg:col-span-2 flex items-start gap-3 rounded-lg border border-iip-border bg-iip-bg/50 px-4 py-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={dataPrivForm.seedDefaultActions}
                        onChange={(e) =>
                          setDataPrivForm((s) => ({
                            ...s,
                            seedDefaultActions: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-iip-text">
                        <span className="font-medium">Seed default actions</span>
                        <span className="block text-xs text-iip-text-muted mt-0.5">
                          Creates Read, Create, Update, Delete, and Export for the role matrix.
                        </span>
                      </span>
                    </label>
                  )}

                  <div className={isEditingDataPriv ? 'lg:col-span-2' : 'lg:col-span-3'}>
                    <div className="w-full rounded-lg border border-dashed border-iip-border bg-iip-surface/50 px-4 py-3">
                      <p className="text-xs font-medium text-iip-text-muted uppercase tracking-wide">
                        Preview
                      </p>
                      <p className="mt-1 text-sm font-mono text-iip-primary truncate">
                        {dataPrivForm.privilege_code || 'data:your-module'}
                      </p>
                      <p className="text-sm text-iip-text truncate">
                        {dataPrivForm.name || 'Display name'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="admin-form-panel-footer">
                <AdminButton
                  variant="ghost"
                  size="sm"
                  onClick={resetDataPrivForm}
                  disabled={dataFormPending}
                >
                  {isEditingDataPriv ? <X size={15} aria-hidden /> : null}
                  {isEditingDataPriv ? 'Cancel' : 'Clear'}
                </AdminButton>
                <span className="admin-form-actions-spacer flex-1" aria-hidden />
                <AdminButton
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    isEditingDataPriv
                      ? updateDataPrivilegeMutation.mutate()
                      : createDataPrivilegeMutation.mutate()
                  }
                  disabled={
                    dataFormPending || (isEditingDataPriv ? !canSaveDataPriv : !canCreateDataPriv)
                  }
                >
                  {isEditingDataPriv ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                  {dataFormPending
                    ? 'Saving…'
                    : isEditingDataPriv
                      ? 'Save changes'
                      : 'Create data privilege'}
                </AdminButton>
              </div>
            </div>
          </div>

          <AdminSectionCard
            step={1}
            title="Data privilege registry"
            description="All DATA privileges — search, edit, or remove. Click Edit to load into the form above."
          >
            <AdminInteractiveDataTable
              isLoading={dataPrivsLoading}
              data={filteredDataPrivs}
              keyField={(p) => p.id}
              searchPlaceholder="Search by code, name, description…"
              defaultSort={{ key: 'code', direction: 'asc' }}
              getSearchText={(p) =>
                [p.privilege_code, p.name, p.description, p.module].join(' ')
              }
              filters={[
                {
                  id: 'module',
                  label: 'Module',
                  value: dataModuleFilter,
                  onChange: setDataModuleFilter,
                  options: dataModuleOptions,
                },
                {
                  id: 'active',
                  label: 'Status',
                  value: dataActiveFilter,
                  onChange: setDataActiveFilter,
                  options: [
                    { value: 'all', label: 'All' },
                    { value: 'active', label: 'Active only' },
                    { value: 'inactive', label: 'Inactive only' },
                  ],
                },
              ]}
              emptyMessage="No DATA privileges defined. Create one above."
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  sortable: true,
                  sortValue: (p) => p.privilege_code,
                  render: (p) => (
                    <code className="text-xs font-mono text-iip-primary">{p.privilege_code}</code>
                  ),
                },
                {
                  key: 'name',
                  header: 'Name',
                  sortable: true,
                  sortValue: (p) => p.name,
                  render: (p) => <span className="font-medium">{p.name}</span>,
                },
                {
                  key: 'module',
                  header: 'Module',
                  sortable: true,
                  sortValue: (p) => p.module,
                  render: (p) => (
                    <span className="inline-flex px-2 py-0.5 rounded-md text-xs bg-iip-surface-hover">
                      {p.module}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  className: 'text-center tabular-nums',
                  sortable: true,
                  sortValue: (p) => p.actions.length,
                  render: (p) => (
                    <span
                      className={`inline-flex min-w-[1.75rem] justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.actions.length
                          ? 'bg-iip-primary/10 text-iip-primary'
                          : 'bg-iip-surface-hover text-iip-text-muted'
                      }`}
                    >
                      {p.actions.length}
                    </span>
                  ),
                },
                {
                  key: 'desc',
                  header: 'Description',
                  sortable: true,
                  sortValue: (p) => p.description,
                  render: (p) => (
                    <span className="text-iip-text-muted line-clamp-2 max-w-xs">{p.description}</span>
                  ),
                },
                {
                  key: 'active',
                  header: 'Active',
                  className: 'text-center',
                  sortable: true,
                  sortValue: (p) => p.is_active,
                  render: (p) => (
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={p.is_active}
                      disabled={toggleDataPrivActiveMutation.isPending}
                      onChange={() =>
                        toggleDataPrivActiveMutation.mutate({
                          id: p.id,
                          is_active: !p.is_active,
                        })
                      }
                    />
                  ),
                },
                {
                  key: 'row-actions',
                  header: '',
                  className: 'text-right w-[140px]',
                  render: (p) => (
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <AdminButton
                        variant={editingDataPrivId === p.id ? 'active' : 'ghost'}
                        size="xs"
                        onClick={() => startEditDataPriv(p)}
                      >
                        <Pencil size={14} aria-hidden />
                        Edit
                      </AdminButton>
                      <AdminButton
                        variant="danger"
                        size="xs"
                        onClick={() => handleDeletePrivilege(p)}
                        disabled={deletePrivilegeMutation.isPending}
                        title="Delete data privilege"
                      >
                        <Trash2 size={14} aria-hidden />
                        Delete
                      </AdminButton>
                    </div>
                  ),
                },
              ]}
            />
          </AdminSectionCard>

          <AdminSectionCard
            step={2}
            title="Add custom action"
            description="Define action codes (e.g. EXPORT, APPROVE) under a data privilege."
          >
            <div className="admin-form-panel-body">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <AdminFormField id="new-action-priv" label="Data privilege" required>
                  <select
                    id="new-action-priv"
                    value={newAction.privilegeId}
                    onChange={(e) => setNewAction((s) => ({ ...s, privilegeId: e.target.value }))}
                    className="form-control"
                  >
                    <option value="">Select privilege…</option>
                    {(dataPrivs ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.privilege_code}
                      </option>
                    ))}
                  </select>
                </AdminFormField>
                <AdminFormField id="new-action-code" label="Action code" required>
                  <input
                    id="new-action-code"
                    className="form-control font-mono text-sm uppercase"
                    value={newAction.code}
                    onChange={(e) =>
                      setNewAction((s) => ({
                        ...s,
                        code: e.target.value.toUpperCase().replace(/\s+/g, '_'),
                      }))
                    }
                    placeholder="EXPORT"
                  />
                </AdminFormField>
                <AdminFormField id="new-action-label" label="Display label" required>
                  <input
                    id="new-action-label"
                    className="form-control"
                    value={newAction.label}
                    onChange={(e) => setNewAction((s) => ({ ...s, label: e.target.value }))}
                    placeholder="Export records"
                  />
                </AdminFormField>
                <AdminButton
                  variant="primary"
                  size="sm"
                  className="h-[2.75rem] self-end"
                  onClick={() => addActionMutation.mutate()}
                  disabled={
                    addActionMutation.isPending ||
                    !newAction.privilegeId ||
                    !newAction.code ||
                    !newAction.label
                  }
                >
                  <Plus size={15} aria-hidden />
                  {addActionMutation.isPending ? 'Adding…' : 'Add action'}
                </AdminButton>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            step={4}
            title="Role access matrix"
            description="Grant or revoke each custom action per role. Remember to save when you change checkboxes."
          >
            {dataPrivsWithActions.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Users size={32} className="mx-auto text-iip-text-muted/50 mb-3" aria-hidden />
                <p className="text-sm font-medium text-iip-text">No matrices to show yet</p>
                <p className="text-xs text-iip-text-muted mt-1 max-w-md mx-auto">
                  Add at least one custom action above to configure role access.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-iip-border">
                {dataPrivsWithActions.map((priv) => {
                  const actionCols = priv.actions;
                  return (
                    <article key={priv.id} className="py-0">
                      <div className="admin-privilege-card-header flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 rounded-lg bg-iip-primary/10 text-iip-primary shrink-0">
                            <Zap size={18} aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-iip-text truncate">{priv.name}</h3>
                            <code className="text-xs font-mono text-iip-primary/90">
                              {priv.privilege_code}
                            </code>
                            <p className="text-xs text-iip-text-muted mt-1 line-clamp-1">
                              {priv.description}
                            </p>
                          </div>
                        </div>
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => handleDeletePrivilege(priv)}
                          disabled={deletePrivilegeMutation.isPending}
                        >
                          <Trash2 size={14} aria-hidden />
                          Delete privilege
                        </AdminButton>
                      </div>

                      <div className="px-5 py-4 border-b border-iip-border/80 bg-iip-bg/20">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted mb-3">
                          Custom actions
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {actionCols.map((a) => {
                            const grantCount = grantedRoleCountByAction[a.id] ?? 0;
                            return (
                              <div key={a.id} className="admin-action-chip group">
                                <div className="min-w-0">
                                  <code className="text-[11px] font-mono text-iip-primary block">
                                    {a.action_code}
                                  </code>
                                  <span className="text-iip-text text-xs">{a.action_label}</span>
                                </div>
                                {grantCount > 0 && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                    {grantCount} role{grantCount === 1 ? '' : 's'}
                                  </span>
                                )}
                                <AdminButton
                                  variant="danger"
                                  size="icon"
                                  onClick={() => handleDeleteAction(a, priv)}
                                  disabled={deleteActionMutation.isPending}
                                  title={`Delete ${a.action_code}`}
                                  aria-label={`Delete action ${a.action_code}`}
                                >
                                  <Trash2 size={14} aria-hidden />
                                </AdminButton>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="admin-matrix-panel">
                        <div className="px-4 py-2.5 border-b border-iip-border bg-iip-surface/50 flex items-center gap-2">
                          <Users size={14} className="text-iip-text-muted" aria-hidden />
                          <span className="text-xs font-medium text-iip-text-muted">
                            Grant actions to roles
                          </span>
                        </div>
                        <AdminDataTable
                          isLoading={dataLoading}
                          data={roles ?? []}
                          keyField={(r) => `${priv.id}-${r.role_id}`}
                          columns={[
                            {
                              key: 'role',
                              header: 'Role',
                              className: 'min-w-[140px] bg-iip-surface/30',
                              render: (r) => (
                                <span className="font-medium text-iip-text">{r.role_name}</span>
                              ),
                            },
                            ...actionCols.map((a) => ({
                              key: a.id,
                              header: (
                                <div className="flex flex-col items-center gap-0.5 py-0.5">
                                  <span className="text-xs font-medium">{a.action_label}</span>
                                  <code className="text-[10px] font-mono text-iip-text-muted">
                                    {a.action_code}
                                  </code>
                                </div>
                              ),
                              className: 'text-center',
                              render: (r: RoleRow) => (
                                <div className="flex justify-center py-1">
                                  <input
                                    type="checkbox"
                                    className="admin-matrix-checkbox"
                                    checked={(dataState[r.role_id] ?? new Set()).has(a.id)}
                                    onChange={() => toggleDataAction(r.role_id, a.id)}
                                    aria-label={`${a.action_label} for ${r.role_name}`}
                                  />
                                </div>
                              ),
                            })),
                          ]}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </AdminSectionCard>

          <button
            type="button"
            onClick={() => saveDataMutation.mutate()}
            disabled={saveDataMutation.isPending || !hasUnsavedDataChanges}
            className={`admin-fab-save ${hasUnsavedDataChanges ? 'admin-fab-save--dirty' : ''}`}
            aria-label="Save data privilege changes"
            title={
              hasUnsavedDataChanges
                ? 'Save unsaved matrix changes'
                : 'No changes to save'
            }
          >
            <Save size={18} aria-hidden />
            {saveDataMutation.isPending
              ? 'Saving…'
              : saved
                ? 'Saved'
                : 'Save changes'}
            {hasUnsavedDataChanges && !saveDataMutation.isPending && !saved && (
              <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" aria-hidden />
            )}
          </button>
        </div>
      )}
    </AdminPageLayout>
  );
}
