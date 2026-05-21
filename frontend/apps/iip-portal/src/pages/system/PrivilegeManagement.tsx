import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Pencil, Plus, Save, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { AdminFormField } from '../../components/admin/AdminFormField';
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

export default function PrivilegeManagement() {
  const [tab, setTab] = useState<Tab>('menu');
  const [saved, setSaved] = useState(false);
  const [menuPrivForm, setMenuPrivForm] = useState(emptyMenuPrivilegeForm);
  const [editingMenuPrivId, setEditingMenuPrivId] = useState<string | null>(null);
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

  const { data: dataPrivs } = useQuery({
    queryKey: ['privileges-data', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<Privilege[]>('/iam/privileges/');
      return res.data.filter((p) => p.privilege_type === 'DATA');
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

  const dataState = useMemo(() => {
    const draft: Record<string, Set<string>> = { ...dataDraft };
    for (const row of dataMatrix ?? []) {
      if (!draft[row.role_id]) draft[row.role_id] = new Set();
      for (const a of row.actions) {
        if (a.granted) draft[row.role_id].add(a.action_id);
      }
    }
    return draft;
  }, [dataMatrix, dataDraft]);

  const resetMenuPrivForm = () => {
    setMenuPrivForm(emptyMenuPrivilegeForm);
    setEditingMenuPrivId(null);
  };

  const startEditMenuPriv = (priv: Privilege) => {
    setEditingMenuPrivId(priv.id);
    setMenuPrivForm({
      privilege_code: priv.privilege_code,
      name: priv.name,
      description: priv.description,
      module: priv.module,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const set = new Set(next[roleId] ?? dataState[roleId] ?? []);
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

  const isEditingMenuPriv = Boolean(editingMenuPrivId);
  const canSaveMenuPriv = menuPrivForm.name.trim().length > 0;
  const canCreateMenuPriv =
    !isEditingMenuPriv &&
    menuPrivForm.privilege_code.trim().length > 0 &&
    menuPrivForm.name.trim().length > 0;
  const menuFormPending =
    createMenuPrivilegeMutation.isPending || updateMenuPrivilegeMutation.isPending;

  return (
    <AdminPageLayout
      title="Privilege Management"
      description="Define MENU privileges here, link them to menus in Menu Management, and configure data actions per role."
      icon={KeyRound}
      actions={
        tab === 'data' ? (
          <button
            type="button"
            onClick={() => saveDataMutation.mutate()}
            disabled={saveDataMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover disabled:opacity-50"
          >
            <Save size={16} />
            {saved ? 'Saved' : 'Save data privileges'}
          </button>
        ) : null
      }
    >
      <div className="flex gap-1 p-1 rounded-lg bg-iip-bg border border-iip-border w-fit mb-4">
        {(['menu', 'data'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-iip-primary text-white'
                : 'text-iip-text-muted hover:text-iip-text'
            }`}
          >
            {t === 'menu' ? 'Menu privileges' : 'Data privileges'}
          </button>
        ))}
      </div>

      {tab === 'menu' && (
        <>
          <div className="dashboard-card mb-4 overflow-hidden">
            <div className="admin-form-panel">
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
                {isEditingMenuPriv ? (
                  <button
                    type="button"
                    onClick={resetMenuPrivForm}
                    disabled={menuFormPending}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-iip-border text-sm font-medium text-iip-text hover:bg-iip-surface-hover transition-colors disabled:opacity-50"
                  >
                    <X size={16} />
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resetMenuPrivForm}
                    disabled={menuFormPending}
                    className="px-4 py-2.5 rounded-lg border border-iip-border text-sm font-medium text-iip-text hover:bg-iip-surface-hover transition-colors disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    isEditingMenuPriv
                      ? updateMenuPrivilegeMutation.mutate()
                      : createMenuPrivilegeMutation.mutate()
                  }
                  disabled={
                    menuFormPending ||
                    (isEditingMenuPriv ? !canSaveMenuPriv : !canCreateMenuPriv)
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover disabled:opacity-50 transition-colors"
                >
                  {isEditingMenuPriv ? <Save size={16} /> : <Plus size={16} />}
                  {menuFormPending
                    ? 'Saving…'
                    : isEditingMenuPriv
                      ? 'Save changes'
                      : 'Create menu privilege'}
                </button>
              </div>
            </div>
          </div>

          <div className="dashboard-card overflow-hidden">
            <div className="px-5 py-4 border-b border-iip-border">
              <p className="text-sm font-semibold text-iip-text">MENU privileges</p>
              <p className="text-xs text-iip-text-muted mt-1">
                {(menuPrivs ?? []).length} defined — select one when creating a menu item.
              </p>
            </div>
            <AdminDataTable
              isLoading={menuPrivsLoading}
              data={menuPrivs ?? []}
              keyField={(p) => p.id}
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  render: (p) => (
                    <code className="text-xs font-mono text-iip-primary">{p.privilege_code}</code>
                  ),
                },
                { key: 'name', header: 'Name', render: (p) => p.name },
                { key: 'module', header: 'Module', render: (p) => p.module },
                {
                  key: 'desc',
                  header: 'Description',
                  render: (p) => (
                    <span className="text-iip-text-muted line-clamp-2">{p.description}</span>
                  ),
                },
                {
                  key: 'active',
                  header: 'Active',
                  className: 'text-center',
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
                  header: '',
                  className: 'text-right w-[100px]',
                  render: (p) => (
                    <button
                      type="button"
                      onClick={() => startEditMenuPriv(p)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        editingMenuPrivId === p.id
                          ? 'bg-iip-primary/15 text-iip-primary'
                          : 'text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text'
                      }`}
                    >
                      <Pencil size={14} />
                      Edit
                    </button>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      {tab === 'data' && (
        <>
          <div className="dashboard-card p-4 mb-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-iip-text-muted block mb-1">Data privilege</label>
              <select
                value={newAction.privilegeId}
                onChange={(e) => setNewAction((s) => ({ ...s, privilegeId: e.target.value }))}
                className="form-control min-w-[200px]"
              >
                <option value="">Select...</option>
                {(dataPrivs ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.privilege_code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-iip-text-muted block mb-1">Action code</label>
              <input
                className="form-control"
                value={newAction.code}
                onChange={(e) => setNewAction((s) => ({ ...s, code: e.target.value }))}
                placeholder="e.g. EXPORT"
              />
            </div>
            <div>
              <label className="text-xs text-iip-text-muted block mb-1">Label</label>
              <input
                className="form-control"
                value={newAction.label}
                onChange={(e) => setNewAction((s) => ({ ...s, label: e.target.value }))}
                placeholder="e.g. Export data"
              />
            </div>
            <button
              type="button"
              onClick={() => addActionMutation.mutate()}
              disabled={!newAction.privilegeId || !newAction.code || !newAction.label}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-iip-border text-sm hover:bg-iip-surface-hover"
            >
              <Plus size={14} /> Add action
            </button>
          </div>

          <div className="space-y-4">
            {(dataPrivs ?? []).map((priv) => {
              const actionCols = priv.actions;
              if (!actionCols.length) return null;
              return (
                <div key={priv.id} className="dashboard-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-iip-border bg-iip-bg/40">
                    <p className="font-medium text-iip-text">{priv.name}</p>
                    <p className="text-xs font-mono text-iip-text-muted">{priv.privilege_code}</p>
                  </div>
                  <AdminDataTable
                    isLoading={dataLoading}
                    data={roles ?? []}
                    keyField={(r) => `${priv.id}-${r.role_id}`}
                    columns={[
                      {
                        key: 'role',
                        header: 'Role',
                        render: (r) => <span className="font-medium">{r.role_name}</span>,
                      },
                      ...actionCols.map((a) => ({
                        key: a.id,
                        header: a.action_label,
                        className: 'text-center',
                        render: (r: RoleRow) => (
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={(dataState[r.role_id] ?? new Set()).has(a.id)}
                            onChange={() => toggleDataAction(r.role_id, a.id)}
                          />
                        ),
                      })),
                    ]}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminPageLayout>
  );
}
