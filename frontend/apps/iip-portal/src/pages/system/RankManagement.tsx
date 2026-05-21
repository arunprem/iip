import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
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

interface RankRow {
  id: number;
  rank_desc: string | null;
  rank_short_tag: string | null;
  unit_head: boolean;
  rank_priority: number;
  is_active: boolean;
}

const emptyForm = {
  rank_desc: '',
  rank_short_tag: '',
  unit_head: false,
  rank_priority: '0',
  is_active: true,
};

function rowToForm(row: RankRow) {
  return {
    rank_desc: row.rank_desc ?? '',
    rank_short_tag: row.rank_short_tag ?? '',
    unit_head: row.unit_head,
    rank_priority: String(row.rank_priority),
    is_active: row.is_active,
  };
}

function rankLabel(row: RankRow): string {
  const tag = row.rank_short_tag?.trim();
  const desc = row.rank_desc?.trim();
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || `Rank ${row.id}`;
}

export default function RankManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [headFilter, setHeadFilter] = useState('all');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-ranks', currentOfficeId],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiClient.get<RankRow[]>('/iam/ranks/', {
        params: { include_inactive: true },
      });
      return res.data;
    },
  });

  const isEditing = editingId != null;
  const canSave =
    form.rank_desc.trim().length > 0 || form.rank_short_tag.trim().length > 0;

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (activeFilter === 'active' && !r.is_active) return false;
      if (activeFilter === 'inactive' && r.is_active) return false;
      if (headFilter === 'head' && !r.unit_head) return false;
      if (headFilter === 'non-head' && r.unit_head) return false;
      return true;
    });
  }, [rows, activeFilter, headFilter]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (row: RankRow) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-ranks'] });
    void queryClient.invalidateQueries({ queryKey: ['office-ranks'] });
  };

  const buildPayload = () => ({
    rank_desc: form.rank_desc.trim() || null,
    rank_short_tag: form.rank_short_tag.trim() || null,
    unit_head: form.unit_head,
    rank_priority: Number(form.rank_priority) || 0,
    is_active: form.is_active,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/ranks/', buildPayload());
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (editingId == null) return;
      await apiClient.patch(`/iam/ranks/${editingId}`, buildPayload());
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await apiClient.patch(`/iam/ranks/${id}`, { is_active });
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/iam/ranks/${id}`);
    },
    onSuccess: (_data, deletedId) => {
      if (editingId === deletedId) resetForm();
      invalidate();
    },
  });

  const handleDelete = async (row: RankRow) => {
    const check = await apiClient.get<{
      can_delete: boolean;
      blockers: string[];
      usage_count: number;
    }>(`/iam/ranks/${row.id}/deletion-check`);
    if (!check.data.can_delete) {
      await showReferenceDeleteBlocked('Cannot delete rank', check.data.blockers);
      return;
    }
    const ok = await confirmDeleteReference({
      title: 'Delete rank?',
      label: rankLabel(row),
      detail:
        check.data.usage_count > 0
          ? `${check.data.usage_count} offices use this as head rank.`
          : undefined,
    });
    if (ok) deleteMutation.mutate(row.id);
  };

  const formPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminPageLayout
      title="Rank Management"
      description="Master list of police ranks for unit head assignment on offices."
      icon={Award}
    >
      <AdminTipBanner>
        Lower <strong>priority</strong> numbers sort first in dropdowns. Mark{' '}
        <strong>Unit head eligible</strong> for ranks that may be selected as an office head rank in
        Office Management.
      </AdminTipBanner>

      <div className="dashboard-card mb-4 overflow-hidden">
        <div ref={formPanelRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
          <div className="admin-form-panel-header">
            <p className="text-sm font-semibold text-iip-text">
              {isEditing ? `Edit rank #${editingId}` : 'New rank'}
            </p>
            <p className="text-xs text-iip-text-muted mt-1">
              Provide at least a description or short tag. New ranks receive the next ID automatically.
            </p>
          </div>

          <div className="admin-form-panel-body">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AdminFormField id="rank-short-tag" label="Short tag">
                <input
                  id="rank-short-tag"
                  className="form-control"
                  value={form.rank_short_tag}
                  onChange={(e) => setForm((s) => ({ ...s, rank_short_tag: e.target.value }))}
                  placeholder="e.g. DySP"
                />
              </AdminFormField>
              <AdminFormField id="rank-desc" label="Description">
                <input
                  id="rank-desc"
                  className="form-control"
                  value={form.rank_desc}
                  onChange={(e) => setForm((s) => ({ ...s, rank_desc: e.target.value }))}
                  placeholder="Full rank name"
                />
              </AdminFormField>
              <AdminFormField id="rank-priority" label="Priority" hint="Lower sorts first">
                <input
                  id="rank-priority"
                  type="number"
                  min={0}
                  className="form-control"
                  value={form.rank_priority}
                  onChange={(e) => setForm((s) => ({ ...s, rank_priority: e.target.value }))}
                />
              </AdminFormField>
              <div className="flex flex-wrap items-center gap-4 md:col-span-2">
                <label className="admin-office-flag">
                  <input
                    type="checkbox"
                    checked={form.unit_head}
                    onChange={(e) => setForm((s) => ({ ...s, unit_head: e.target.checked }))}
                  />
                  <span className="admin-office-flag__label">Unit head eligible</span>
                </label>
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
              disabled={formPending || !canSave}
              onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
            >
              {isEditing ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
              {formPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create rank'}
            </AdminButton>
          </div>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border">
          <p className="text-sm font-semibold text-iip-text">All ranks</p>
          <p className="text-xs text-iip-text-muted mt-1">
            {rows.length} defined — search, sort, and filter below.
          </p>
        </div>

        <AdminInteractiveDataTable
          isLoading={isLoading}
          data={filteredRows}
          keyField={(r) => String(r.id)}
          searchPlaceholder="Search by ID, tag, or description…"
          defaultSort={{ key: 'priority', direction: 'asc' }}
          getSearchText={(r) =>
            [r.id, r.rank_short_tag, r.rank_desc, r.rank_priority, r.unit_head].join(' ')
          }
          emptyMessage="No ranks defined."
          filters={[
            {
              key: 'active',
              label: 'Status',
              value: activeFilter,
              onChange: setActiveFilter,
              options: [
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
            {
              key: 'head',
              label: 'Unit head',
              value: headFilter,
              onChange: setHeadFilter,
              options: [
                { value: 'all', label: 'All ranks' },
                { value: 'head', label: 'Head eligible' },
                { value: 'non-head', label: 'Not head eligible' },
              ],
            },
          ]}
          columns={[
            {
              key: 'id',
              header: 'ID',
              sortable: true,
              sortValue: (r) => r.id,
              className: 'w-16 tabular-nums font-mono text-sm',
              render: (r) => r.id,
            },
            {
              key: 'tag',
              header: 'Tag',
              sortable: true,
              sortValue: (r) => r.rank_short_tag ?? '',
              render: (r) => (
                <span className="font-mono text-sm">{r.rank_short_tag ?? '—'}</span>
              ),
            },
            {
              key: 'desc',
              header: 'Description',
              sortable: true,
              sortValue: (r) => r.rank_desc ?? '',
              render: (r) => (
                <span className="text-iip-text line-clamp-2 max-w-md">{r.rank_desc ?? '—'}</span>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              sortable: true,
              sortValue: (r) => r.rank_priority,
              className: 'text-center w-24 tabular-nums',
              render: (r) => r.rank_priority,
            },
            {
              key: 'head',
              header: 'Head',
              className: 'text-center w-20',
              sortable: true,
              sortValue: (r) => r.unit_head,
              render: (r) =>
                r.unit_head ? (
                  <span className="admin-office-badge admin-office-badge--parent">Yes</span>
                ) : (
                  <span className="text-iip-text-muted">—</span>
                ),
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
