import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save, Tags, Trash2, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminInteractiveDataTable } from '../../components/admin/AdminInteractiveDataTable';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import { useAuthStore } from '../../stores/authStore';
import {
  confirmDeleteReference,
  showReferenceDeleteBlocked,
} from '../../utils/confirmDialog';

interface UnitTypeRow {
  id: number;
  description: string;
  is_active: boolean;
}

const emptyForm = {
  description: '',
  is_active: true,
};

function rowToForm(row: UnitTypeRow) {
  return {
    description: row.description,
    is_active: row.is_active,
  };
}

export default function UnitTypeManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-unit-types', currentOfficeId],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiClient.get<UnitTypeRow[]>('/iam/unit-types/', {
        params: { include_inactive: true },
      });
      return res.data;
    },
  });

  const isEditing = editingId != null;
  const canSave = form.description.trim().length > 0;
  const canCreate = !isEditing && canSave;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rows, activeFilter]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (row: UnitTypeRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-unit-types'] });
    void queryClient.invalidateQueries({ queryKey: ['office-unit-types'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/unit-types/', {
        description: form.description.trim(),
        is_active: form.is_active,
      });
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (editingId == null) return;
      await apiClient.patch(`/iam/unit-types/${editingId}`, {
        description: form.description.trim(),
        is_active: form.is_active,
      });
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await apiClient.patch(`/iam/unit-types/${id}`, { is_active });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/iam/unit-types/${id}`);
    },
    onSuccess: (_data, deletedId) => {
      if (editingId === deletedId) resetForm();
      invalidate();
    },
  });

  const handleDelete = async (row: UnitTypeRow) => {
    const check = await apiClient.get<{
      can_delete: boolean;
      blockers: string[];
      usage_count: number;
    }>(`/iam/unit-types/${row.id}/deletion-check`);
    if (!check.data.can_delete) {
      await showReferenceDeleteBlocked('Cannot delete unit type', check.data.blockers);
      return;
    }
    const ok = await confirmDeleteReference({
      title: 'Delete unit type?',
      label: `${row.description} (ID ${row.id})`,
      detail:
        check.data.usage_count > 0
          ? `${check.data.usage_count} offices reference this type.`
          : undefined,
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const formPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminPageLayout
      title="Unit Type Management"
      description="Master list of office unit types (legacy idunittype). Used when creating and editing offices."
      icon={Tags}
    >
      <AdminTipBanner>
        New unit types receive the next available <strong>ID</strong> automatically. Seeded legacy IDs
        (e.g. <strong>21</strong> = PS) remain unchanged in the table.
      </AdminTipBanner>

      <div className="dashboard-card mb-4 overflow-hidden">
        <div ref={formPanelRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
          <div className="admin-form-panel-header">
            <p className="text-sm font-semibold text-iip-text">
              {isEditing ? `Edit unit type #${editingId}` : 'New unit type'}
            </p>
            <p className="text-xs text-iip-text-muted mt-1">
              {isEditing
                ? 'Update description or active status.'
                : 'Add a new unit type for the organization hierarchy.'}
            </p>
          </div>

          <div className="admin-form-panel-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <AdminFormField id="unit-type-description" label="Description" required>
                <input
                  id="unit-type-description"
                  className="form-control"
                  value={form.description}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder="e.g. PS"
                  autoFocus
                />
              </AdminFormField>
              <div className="flex items-center md:col-span-2">
                <label className="admin-office-flag">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((s) => ({ ...s, is_active: e.target.checked }))}
                  />
                  <span className="admin-office-flag__label">Active</span>
                </label>
              </div>
            </div>
          </div>

          <div className="admin-form-panel-footer">
            <AdminButton variant="ghost" size="sm" onClick={resetForm} disabled={formPending}>
              {isEditing ? <X size={15} aria-hidden /> : null}
              {isEditing ? 'Cancel' : 'Clear'}
            </AdminButton>
            <span className="admin-form-actions-spacer flex-1" aria-hidden />
            <AdminButton
              variant="primary"
              size="sm"
              disabled={formPending || (isEditing ? !canSave : !canCreate)}
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {isEditing ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
              {formPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create unit type'}
            </AdminButton>
          </div>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border">
          <p className="text-sm font-semibold text-iip-text">All unit types</p>
          <p className="text-xs text-iip-text-muted mt-1">
            {rows.length} defined — search, sort, and filter below.
          </p>
        </div>

        <AdminInteractiveDataTable
          isLoading={isLoading}
          data={filteredRows}
          keyField={(r) => String(r.id)}
          searchPlaceholder="Search by ID or description…"
          defaultSort={{ key: 'id', direction: 'asc' }}
          getSearchText={(r) => `${r.id} ${r.description}`}
          emptyMessage="No unit types defined."
          filters={[
            {
              id: 'active',
              label: 'Status',
              value: activeFilter,
              onChange: setActiveFilter,
              options: [
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          columns={[
            {
              key: 'id',
              header: 'ID',
              sortable: true,
              sortValue: (r) => r.id,
              className: 'w-20 tabular-nums font-mono text-sm',
              render: (r) => r.id,
            },
            {
              key: 'description',
              header: 'Description',
              sortable: true,
              sortValue: (r) => r.description,
              render: (r) => <span className="font-medium text-iip-text">{r.description}</span>,
            },
            {
              key: 'active',
              header: 'Active',
              className: 'text-center w-24',
              sortable: true,
              sortValue: (r) => r.is_active,
              render: (r) => (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={r.is_active}
                  disabled={toggleActiveMutation.isPending}
                  onChange={() =>
                    toggleActiveMutation.mutate({ id: r.id, is_active: !r.is_active })
                  }
                />
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right w-[140px]',
              render: (r) => (
                <div className="inline-flex items-center justify-end gap-1.5">
                  <AdminButton
                    variant={editingId === r.id ? 'active' : 'ghost'}
                    size="xs"
                    onClick={() => startEdit(r)}
                  >
                    <Pencil size={14} aria-hidden />
                    Edit
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    size="xs"
                    onClick={() => void handleDelete(r)}
                    disabled={deleteMutation.isPending}
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
    </AdminPageLayout>
  );
}
