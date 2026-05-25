import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Smartphone } from 'lucide-react';
import { useState } from 'react';
import {
  createMobileWidget,
  fetchMobileWidgets,
  toggleMobileWidget,
  updateMobileWidget,
  type MobileWidget,
} from '../../api/mobile';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminInteractiveDataTable } from '../../components/admin/AdminInteractiveDataTable';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';

const emptyForm = {
  widget_key: '',
  label: '',
  description: '',
  icon: 'LayoutGrid',
  menu_key: '',
  privilege_code: '',
  mobile_route: '',
  sort_order: 0,
};

export default function MobileWidgetManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: widgets = [], isLoading, isError, error } = useQuery({
    queryKey: ['mobile-widgets', currentOfficeId],
    queryFn: async () => (await fetchMobileWidgets()).data,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        widget_key: form.widget_key.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        icon: form.icon.trim() || 'LayoutGrid',
        menu_key: form.menu_key.trim() || null,
        privilege_code: form.privilege_code.trim() || null,
        mobile_route: form.mobile_route.trim(),
        sort_order: Number(form.sort_order) || 0,
      };
      if (editingId) {
        return updateMobileWidget(editingId, payload);
      }
      return createMobileWidget(payload);
    },
    onSuccess: () => {
      showToast('success', editingId ? 'Mobile widget updated.' : 'Mobile widget created.');
      setForm(emptyForm);
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['mobile-widgets'] });
    },
    onError: () => showToast('error', 'Could not save mobile widget.'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleMobileWidget(id, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mobile-widgets'] });
    },
    onError: () => showToast('error', 'Could not update widget status.'),
  });

  const startEdit = (row: MobileWidget) => {
    setEditingId(row.id);
    setForm({
      widget_key: row.widget_key,
      label: row.label,
      description: row.description,
      icon: row.icon,
      menu_key: row.menu_key ?? '',
      privilege_code: row.privilege_code ?? '',
      mobile_route: row.mobile_route,
      sort_order: row.sort_order,
    });
  };

  return (
    <AdminPageLayout
      title="Mobile app widgets"
      description="Enable or disable modules on the IIP mobile app. Users only see widgets they have privileges for; disabling here hides a module for everyone."
      icon={Smartphone}
    >
      {isError && (
        <div className="dashboard-card max-w-3xl p-4 mb-4 text-sm text-red-600 dark:text-red-400">
          Could not load mobile widgets. Ensure iam-svc is running and migration 016 is applied.
          {error instanceof Error && (
            <p className="mt-2 text-xs text-iip-text-muted">{error.message}</p>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="dashboard-card overflow-hidden">
          <AdminInteractiveDataTable
            data={widgets}
            isLoading={isLoading}
            keyField={(r) => r.id}
            emptyMessage="No mobile widgets configured."
            searchPlaceholder="Search modules…"
            getSearchText={(r) =>
              `${r.label} ${r.widget_key} ${r.privilege_code ?? ''} ${r.mobile_route}`
            }
            defaultSort={{ key: 'sort_order', direction: 'asc' }}
            pageSize={25}
            columns={[
              {
                key: 'sort_order',
                header: '#',
                sortable: true,
                sortValue: (r) => r.sort_order,
                render: (r) => r.sort_order,
              },
              {
                key: 'label',
                header: 'Module',
                sortable: true,
                sortValue: (r) => r.label,
                render: (r) => <span className="font-medium text-iip-text">{r.label}</span>,
              },
              {
                key: 'widget_key',
                header: 'Key',
                sortable: true,
                sortValue: (r) => r.widget_key,
                render: (r) => <code className="text-xs font-mono">{r.widget_key}</code>,
              },
              {
                key: 'privilege_code',
                header: 'Privilege',
                sortable: true,
                sortValue: (r) => r.privilege_code ?? '',
                render: (r) => r.privilege_code ?? '—',
              },
              {
                key: 'is_active',
                header: 'Mobile',
                sortable: true,
                sortValue: (r) => r.is_active,
                render: (r) => (
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-iip-border"
                      checked={r.is_active}
                      disabled={toggleMutation.isPending}
                      onChange={(e) =>
                        toggleMutation.mutate({ id: r.id, isActive: e.target.checked })
                      }
                    />
                    <span className={r.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-iip-text-muted'}>
                      {r.is_active ? 'Enabled' : 'Disabled'}
                    </span>
                  </label>
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <AdminButton variant="ghost" size="sm" onClick={() => startEdit(r)}>
                    Edit
                  </AdminButton>
                ),
              },
            ]}
          />
        </section>

        <section className="dashboard-card p-5 space-y-4 h-fit">
          <h2 className="text-sm font-semibold text-iip-text">
            {editingId ? 'Edit widget' : 'Add widget'}
          </h2>
          <AdminFormField id="mw-key" label="Widget key" required>
            <input
              id="mw-key"
              className="form-control"
              value={form.widget_key}
              disabled={Boolean(editingId)}
              onChange={(e) => setForm((f) => ({ ...f, widget_key: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-label" label="Label" required>
            <input
              id="mw-label"
              className="form-control"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-desc" label="Description">
            <textarea
              id="mw-desc"
              className="form-control"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-icon" label="Icon (Lucide name)" hint="e.g. LayoutDashboard, Bell, FolderOpen">
            <input
              id="mw-icon"
              className="form-control"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-menu-key" label="Menu key (optional)" hint="Links to a web sidebar menu_key">
            <input
              id="mw-menu-key"
              className="form-control"
              value={form.menu_key}
              onChange={(e) => setForm((f) => ({ ...f, menu_key: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-priv" label="Privilege code (optional)" hint="Leave empty for all users (e.g. dashboard)">
            <input
              id="mw-priv"
              className="form-control"
              value={form.privilege_code}
              onChange={(e) => setForm((f) => ({ ...f, privilege_code: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-route" label="Mobile route" required hint="Flutter route path, e.g. /notifications">
            <input
              id="mw-route"
              className="form-control"
              value={form.mobile_route}
              onChange={(e) => setForm((f) => ({ ...f, mobile_route: e.target.value }))}
            />
          </AdminFormField>
          <AdminFormField id="mw-sort" label="Sort order">
            <input
              id="mw-sort"
              type="number"
              className="form-control"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            />
          </AdminFormField>
          <div className="flex gap-2 pt-1">
            <AdminButton
              variant="primary"
              size="sm"
              disabled={saveMutation.isPending || !form.widget_key || !form.label || !form.mobile_route}
              onClick={() => saveMutation.mutate()}
            >
              {editingId ? 'Save changes' : 'Create widget'}
            </AdminButton>
            {editingId && (
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </AdminButton>
            )}
          </div>
        </section>
      </div>
    </AdminPageLayout>
  );
}
