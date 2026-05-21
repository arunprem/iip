import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { useAuthStore } from '../../stores/authStore';

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

const ICON_OPTIONS = [
  'LayoutDashboard', 'Radio', 'FolderOpen', 'Bot', 'MapPin', 'Network',
  'UserCheck', 'Shield', 'BarChart3', 'Settings', 'KeyRound', 'Menu', 'Circle',
];

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

export default function MenuManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const [form, setForm] = useState(emptyForm);

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
  const groupMenus = flatMenus.filter((m) => m.is_group);

  const needsPrivilege = !form.is_group;
  const canCreate =
    form.menu_key.trim() &&
    form.label.trim() &&
    (!needsPrivilege || form.privilege_id);

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
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
    },
  });

  const updatePrivilegeMutation = useMutation({
    mutationFn: async ({ id, privilege_id }: { id: string; privilege_id: string | null }) => {
      await apiClient.patch(`/iam/menus/${id}`, { privilege_id });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await apiClient.patch(`/iam/menus/${id}`, { is_active });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-menus'] });
      await queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
    },
  });

  return (
    <AdminPageLayout
      title="Menu Management"
      description="Create navigation items and link each one to a MENU privilege defined under Privilege Management."
      icon={Menu}
      actions={
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-iip-primary text-white text-sm font-medium hover:bg-iip-primary-hover disabled:opacity-50"
        >
          <Plus size={16} />
          Add menu
        </button>
      }
    >
      <div className="dashboard-card p-5 mb-4">
        <p className="text-sm font-semibold text-iip-text mb-1">New menu item</p>
        <p className="text-xs text-iip-text-muted mb-4">
          Choose the MENU privilege that controls visibility for this item. Create new privileges
          under Privilege Management → Menu privileges.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <input
            className="form-control"
            placeholder="menu_key"
            value={form.menu_key}
            onChange={(e) => setForm((s) => ({ ...s, menu_key: e.target.value }))}
          />
          <input
            className="form-control"
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm((s) => ({ ...s, label: e.target.value }))}
          />
          <input
            className="form-control"
            placeholder="/path (optional for groups)"
            value={form.path}
            onChange={(e) => setForm((s) => ({ ...s, path: e.target.value }))}
          />
          <select
            className="form-control"
            value={form.privilege_id}
            disabled={form.is_group}
            onChange={(e) => setForm((s) => ({ ...s, privilege_id: e.target.value }))}
          >
            <option value="">
              {form.is_group ? 'No privilege (group)' : 'Select MENU privilege…'}
            </option>
            {(menuPrivileges ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.privilege_code} — {p.name}
              </option>
            ))}
          </select>
          <select
            className="form-control"
            value={form.icon}
            onChange={(e) => setForm((s) => ({ ...s, icon: e.target.value }))}
          >
            {ICON_OPTIONS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
          <input
            className="form-control"
            placeholder="Section"
            value={form.section}
            onChange={(e) => setForm((s) => ({ ...s, section: e.target.value }))}
          />
          <input
            type="number"
            className="form-control"
            placeholder="Sort order"
            value={form.sort_order}
            onChange={(e) => setForm((s) => ({ ...s, sort_order: Number(e.target.value) }))}
          />
          <select
            className="form-control"
            value={form.parent_id}
            onChange={(e) => setForm((s) => ({ ...s, parent_id: e.target.value }))}
          >
            <option value="">No parent (top level)</option>
            {groupMenus.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label} ({g.menu_key})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-iip-text">
            <input
              type="checkbox"
              checked={form.is_group}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  is_group: e.target.checked,
                  privilege_id: e.target.checked ? '' : s.privilege_id,
                }))
              }
            />
            Group header
          </label>
        </div>
        {needsPrivilege && !(menuPrivileges ?? []).length && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            No MENU privileges yet. Create one under Privilege Management first.
          </p>
        )}
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border">
          <p className="text-sm font-semibold text-iip-text">All menus</p>
        </div>
        <AdminDataTable
          isLoading={isLoading}
          data={flatMenus}
          keyField={(m) => m.id}
          columns={[
            { key: 'key', header: 'Key', render: (m) => <code className="text-xs">{m.menu_key}</code> },
            { key: 'label', header: 'Label', render: (m) => m.label },
            { key: 'path', header: 'Path', render: (m) => m.path ?? '—' },
            { key: 'section', header: 'Section', render: (m) => m.section },
            {
              key: 'priv',
              header: 'MENU privilege',
              render: (m) =>
                m.is_group ? (
                  <span className="text-xs text-iip-text-muted">—</span>
                ) : (
                  <select
                    className="form-control text-xs max-w-[220px]"
                    value={m.privilege_id ?? ''}
                    onChange={(e) =>
                      updatePrivilegeMutation.mutate({
                        id: m.id,
                        privilege_id: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {(menuPrivileges ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.privilege_code}
                      </option>
                    ))}
                  </select>
                ),
            },
            {
              key: 'active',
              header: 'Active',
              render: (m) => (
                <input
                  type="checkbox"
                  checked={m.is_active}
                  onChange={() =>
                    toggleActiveMutation.mutate({ id: m.id, is_active: !m.is_active })
                  }
                />
              ),
            },
          ]}
        />
      </div>
    </AdminPageLayout>
  );
}
