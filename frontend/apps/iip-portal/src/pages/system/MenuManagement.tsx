import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu as MenuIcon, Pencil, Plus, Save, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { MenuIconPicker } from '../../components/admin/MenuIconPicker';
import { useAuthStore } from '../../stores/authStore';
import { resolveIcon } from '../../utils/iconMap';

interface MenuRow {
  id: string;
  menu_key: string;
  label: string;
  path: string | null;
  icon: string;
  section: string;
  sort_order: number;
  parent_id: string | null;
  privilege_id: string | null;
  privilege_code: string | null;
  is_group: boolean;
  is_active: boolean;
}

interface MenuPrivilege {
  id: string;
  privilege_code: string;
  name: string;
}

const emptyForm = {
  menu_key: '',
  label: '',
  path: '',
  icon: 'Circle',
  section: 'Menu',
  sort_order: 0,
  parent_id: '',
  privilege_id: '',
  is_group: false,
};

function menuToForm(m: MenuRow) {
  return {
    menu_key: m.menu_key,
    label: m.label,
    path: m.path ?? '',
    icon: m.icon,
    section: m.section,
    sort_order: m.sort_order,
    parent_id: m.parent_id ?? '',
    privilege_id: m.privilege_id ?? '',
    is_group: m.is_group,
  };
}

export default function MenuManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const [form, setForm] = useState(emptyForm);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);

  const { data: menus, isLoading } = useQuery({
    queryKey: ['admin-menus', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<MenuRow[]>('/iam/menus/', {
        params: { include_inactive: true, flat: true },
      });
      return res.data;
    },
  });

  const { data: menuPrivileges } = useQuery({
    queryKey: ['privileges-menu', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<MenuPrivilege[]>('/iam/privileges/', {
        params: { privilege_type: 'MENU' },
      });
      return res.data;
    },
  });

  const flatMenus = menus ?? [];
  const isEditing = Boolean(editingMenuId);

  const parentOptions = useMemo(
    () =>
      flatMenus.filter(
        (m) => m.is_group && m.id !== editingMenuId
      ),
    [flatMenus, editingMenuId]
  );

  const needsPrivilege = !form.is_group;
  const canSave = form.label.trim() && (!needsPrivilege || form.privilege_id);
  const canCreate = !isEditing && form.menu_key.trim() && canSave;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingMenuId(null);
  };

  const startEdit = (menu: MenuRow) => {
    setEditingMenuId(menu.id);
    setForm(menuToForm(menu));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const invalidateMenus = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
    await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/menus/', {
        menu_key: form.menu_key.trim(),
        label: form.label.trim(),
        path: form.path.trim() || null,
        icon: form.icon,
        section: form.section.trim() || 'Menu',
        sort_order: form.sort_order,
        parent_id: form.parent_id || null,
        privilege_id: form.is_group ? null : form.privilege_id,
        is_group: form.is_group,
      });
    },
    onSuccess: async () => {
      resetForm();
      await invalidateMenus();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingMenuId) return;
      await apiClient.patch(`/iam/menus/${editingMenuId}`, {
        label: form.label.trim(),
        path: form.path.trim() || null,
        icon: form.icon,
        section: form.section.trim() || 'Menu',
        sort_order: form.sort_order,
        parent_id: form.parent_id || null,
        privilege_id: form.is_group ? null : form.privilege_id || null,
        is_group: form.is_group,
      });
    },
    onSuccess: async () => {
      resetForm();
      await invalidateMenus();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await apiClient.patch(`/iam/menus/${id}`, { is_active });
    },
    onSuccess: invalidateMenus,
  });

  const formPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminPageLayout
      title="Menu Management"
      description="Create and edit navigation items. Link each item to a MENU privilege from Privilege Management."
      icon={MenuIcon}
    >
      <div className="dashboard-card mb-4 overflow-hidden">
        <div className="admin-form-panel">
          <div className="admin-form-panel-header">
            <p className="text-sm font-semibold text-iip-text">
              {isEditing ? 'Edit menu item' : 'New menu item'}
            </p>
            <p className="text-xs text-iip-text-muted mt-1 max-w-3xl leading-relaxed">
              {isEditing ? (
                <>
                  Update label, path, icon, section, parent group, or linked MENU privilege. The
                  menu key cannot be changed after creation.
                </>
              ) : (
                <>
                  Choose the MENU privilege that controls visibility. Create privileges under{' '}
                  <span className="font-medium text-iip-text">Privilege Management</span>.
                </>
              )}
            </p>
          </div>

          <div className="admin-form-panel-body space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <AdminFormField
                id="menu-key"
                label="Menu key"
                required={!isEditing}
                hint={isEditing ? 'Immutable after creation.' : 'Unique identifier, e.g. cases or analyst-workbench.'}
              >
                <input
                  id="menu-key"
                  className={`form-control font-mono text-sm ${isEditing ? 'bg-iip-surface-hover cursor-not-allowed' : ''}`}
                  placeholder="cases"
                  value={form.menu_key}
                  onChange={(e) => setForm((s) => ({ ...s, menu_key: e.target.value }))}
                  readOnly={isEditing}
                  disabled={isEditing}
                />
              </AdminFormField>

              <AdminFormField id="menu-label" label="Label" required hint="Shown in the sidebar.">
                <input
                  id="menu-label"
                  className="form-control"
                  placeholder="Intelligence Cases"
                  value={form.label}
                  onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
                />
              </AdminFormField>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <AdminFormField
                id="menu-path"
                label="Route path"
                hint="Leave empty for group headers. e.g. /cases"
              >
                <input
                  id="menu-path"
                  className="form-control font-mono text-sm"
                  placeholder="/cases"
                  value={form.path}
                  disabled={form.is_group}
                  onChange={(e) => setForm((s) => ({ ...s, path: e.target.value }))}
                />
              </AdminFormField>

              <AdminFormField
                id="menu-privilege"
                label="MENU privilege"
                required={needsPrivilege}
                hint="Controls which roles can see this item (via Role Management)."
              >
                <select
                  id="menu-privilege"
                  className="form-control"
                  value={form.privilege_id}
                  disabled={form.is_group}
                  onChange={(e) => setForm((s) => ({ ...s, privilege_id: e.target.value }))}
                >
                  <option value="">
                    {form.is_group ? 'Not required for groups' : 'Select MENU privilege…'}
                  </option>
                  {(menuPrivileges ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.privilege_code} — {p.name}
                    </option>
                  ))}
                </select>
              </AdminFormField>
            </div>

            <AdminFormField
              id="menu-icon"
              label="Icon"
              hint="Pick a Lucide icon — preview matches what appears in the sidebar."
              className="lg:col-span-2"
            >
              <MenuIconPicker
                id="menu-icon"
                value={form.icon}
                onChange={(icon) => setForm((s) => ({ ...s, icon }))}
              />
            </AdminFormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <AdminFormField id="menu-section" label="Section">
                <input
                  id="menu-section"
                  className="form-control"
                  placeholder="Menu"
                  value={form.section}
                  onChange={(e) => setForm((s) => ({ ...s, section: e.target.value }))}
                />
              </AdminFormField>

              <AdminFormField id="menu-sort" label="Sort order">
                <input
                  id="menu-sort"
                  type="number"
                  className="form-control"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, sort_order: Number(e.target.value) || 0 }))
                  }
                />
              </AdminFormField>

              <AdminFormField id="menu-parent" label="Parent group">
                <select
                  id="menu-parent"
                  className="form-control"
                  value={form.parent_id}
                  onChange={(e) => setForm((s) => ({ ...s, parent_id: e.target.value }))}
                >
                  <option value="">Top level</option>
                  {parentOptions.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} ({g.menu_key})
                    </option>
                  ))}
                </select>
              </AdminFormField>
            </div>

            <label className="inline-flex items-center gap-2.5 text-sm text-iip-text cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-iip-border"
                checked={form.is_group}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    is_group: e.target.checked,
                    path: e.target.checked ? '' : s.path,
                    privilege_id: e.target.checked ? '' : s.privilege_id,
                  }))
                }
              />
              <span>
                <span className="font-medium">Group header</span>
                <span className="text-iip-text-muted ml-1">— expands to show child items</span>
              </span>
            </label>

            {needsPrivilege && !(menuPrivileges ?? []).length && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No MENU privileges yet. Create one under Privilege Management first.
              </p>
            )}
          </div>

          <div className="admin-form-panel-footer">
            {isEditing ? (
              <button
                type="button"
                onClick={resetForm}
                disabled={formPending}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-iip-border text-sm font-medium text-iip-text hover:bg-iip-surface-hover transition-colors disabled:opacity-50"
              >
                <X size={16} />
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={resetForm}
                disabled={formPending}
                className="px-4 py-2.5 rounded-lg border border-iip-border text-sm font-medium text-iip-text hover:bg-iip-surface-hover transition-colors disabled:opacity-50"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
              disabled={formPending || (isEditing ? !canSave : !canCreate)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover disabled:opacity-50 transition-colors"
            >
              {isEditing ? <Save size={16} /> : <Plus size={16} />}
              {formPending
                ? 'Saving…'
                : isEditing
                  ? 'Save changes'
                  : 'Create menu item'}
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border">
          <p className="text-sm font-semibold text-iip-text">All menus</p>
          <p className="text-xs text-iip-text-muted mt-1">
            Click Edit to load an item into the form above.
          </p>
        </div>
        <AdminDataTable
          isLoading={isLoading}
          data={flatMenus}
          keyField={(m) => m.id}
          columns={[
            {
              key: 'key',
              header: 'Key',
              render: (m) => <code className="text-xs font-mono">{m.menu_key}</code>,
            },
            {
              key: 'icon',
              header: 'Icon',
              className: 'w-14',
              render: (m) => {
                const Icon = resolveIcon(m.icon);
                return (
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-iip-primary/10 text-iip-primary"
                    title={m.icon}
                  >
                    <Icon size={16} aria-hidden />
                  </span>
                );
              },
            },
            { key: 'label', header: 'Label', render: (m) => m.label },
            { key: 'path', header: 'Path', render: (m) => m.path ?? '—' },
            { key: 'section', header: 'Section', render: (m) => m.section },
            {
              key: 'priv',
              header: 'Privilege',
              render: (m) =>
                m.is_group ? (
                  <span className="text-xs text-iip-text-muted">—</span>
                ) : (
                  <code className="text-xs text-iip-primary">{m.privilege_code ?? '—'}</code>
                ),
            },
            {
              key: 'active',
              header: 'Active',
              className: 'text-center',
              render: (m) => (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={m.is_active}
                  disabled={toggleActiveMutation.isPending}
                  onChange={() =>
                    toggleActiveMutation.mutate({ id: m.id, is_active: !m.is_active })
                  }
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              className: 'text-right w-[100px]',
              render: (m) => (
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    editingMenuId === m.id
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
    </AdminPageLayout>
  );
}
