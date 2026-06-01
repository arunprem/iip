import { useCallback, useMemo, useRef, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  GripVertical,
  Plus,
  Database,
  RefreshCw,
  RefreshCcw,
  GitBranch,
  Save,
  Search,
  Trash2,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import { useAuthStore } from '../../stores/authStore';
import {
  confirmDeleteOffice,
  confirmImportLegacyOffices,
  showOfficeDeleteBlocked,
} from '../../utils/confirmDialog';
import Swal from 'sweetalert2';

type InsertPosition = 'root' | 'last_child' | 'first_child' | 'before' | 'after';
type DropZone = 'before' | 'after' | 'child';

export interface OfficeNode {
  office_id: string;
  office_code: string;
  office_name: string;
  office_short_code: string | null;
  ncrb_id: string | null;
  office_type_id: number | null;
  head_rank: number;
  is_parent_unit: boolean;
  district_id: number | null;
  list_order: number | null;
  is_active: boolean;
  parent_id: string | null;
  lft: number;
  rgt: number;
  hlevel: number;
  root_id: string | null;
  child_count: number;
  descendant_count: number;
  children: OfficeNode[];
}

type FormMode = 'idle' | 'create-root' | 'create-child' | 'edit' | 'move';

interface UnitTypeOption {
  id: number;
  description: string;
  is_active: boolean;
}

interface RankOption {
  id: number;
  rank_desc: string | null;
  rank_short_tag: string | null;
  unit_head: boolean;
  rank_priority: number;
  is_active: boolean;
}

const emptyForm = {
  office_name: '',
  office_short_code: '',
  ncrb_id: '',
  office_type_id: '',
  head_rank: '',
  is_parent_unit: false,
  is_active: true,
};

function rankLabel(rank: RankOption): string {
  const tag = rank.rank_short_tag?.trim();
  const desc = rank.rank_desc?.trim();
  if (tag && desc) return `${tag} — ${desc}`;
  return tag || desc || `Rank ${rank.id}`;
}

function officeNodeToForm(node: OfficeNode) {
  return {
    office_name: node.office_name,
    office_short_code: node.office_short_code ?? '',
    ncrb_id: node.ncrb_id ?? '',
    office_type_id: node.office_type_id != null ? String(node.office_type_id) : '',
    head_rank: node.head_rank ? String(node.head_rank) : '',
    is_parent_unit: node.is_parent_unit,
    is_active: node.is_active,
  };
}

function flattenTree(
  nodes: OfficeNode[],
  depth = 0,
  parentPath: string[] = []
): Array<OfficeNode & { depth: number; path: string[] }> {
  const out: Array<OfficeNode & { depth: number; path: string[] }> = [];
  for (const n of nodes) {
    const path = [...parentPath, n.office_name];
    out.push({ ...n, depth, path });
    out.push(...flattenTree(n.children, depth + 1, path));
  }
  return out;
}

function findNode(nodes: OfficeNode[], id: string): OfficeNode | null {
  for (const n of nodes) {
    if (n.office_id === id) return n;
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

function subtreeMatches(node: OfficeNode, q: string): boolean {
  if (!q) return true;
  if (
    node.office_name.toLowerCase().includes(q) ||
    node.office_code.toLowerCase().includes(q)
  ) {
    return true;
  }
  return node.children.some((c) => subtreeMatches(c, q));
}

function isDescendantOf(ancestor: OfficeNode, node: OfficeNode): boolean {
  return (
    node.root_id === ancestor.root_id &&
    node.lft > ancestor.lft &&
    node.rgt < ancestor.rgt
  );
}

function resolveDropZone(e: DragEvent<HTMLElement>): DropZone {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const ratio = y / rect.height;
  if (ratio < 0.28) return 'before';
  if (ratio > 0.72) return 'after';
  return 'child';
}

function OfficeTreeRow({
  node,
  depth,
  selectedId,
  expanded,
  dragOfficeId,
  dropHint,
  onToggle,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  search,
}: {
  node: OfficeNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  dragOfficeId: string | null;
  dropHint: { targetId: string; zone: DropZone } | null;
  onToggle: (id: string) => void;
  onSelect: (node: OfficeNode) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (target: OfficeNode, zone: DropZone) => void;
  onDragLeave: () => void;
  onDrop: (target: OfficeNode, zone: DropZone) => void;
  search: string;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.office_id);
  const isSelected = selectedId === node.office_id;
  const isDragging = dragOfficeId === node.office_id;
  const shortLabel = node.office_short_code ?? node.office_code;
  const showMeta = Boolean(
    node.ncrb_id || shortLabel || node.is_parent_unit || !node.is_active
  );
  const q = search.trim().toLowerCase();
  const matches =
    !q ||
    node.office_name.toLowerCase().includes(q) ||
    node.office_code.toLowerCase().includes(q) ||
    (node.office_short_code?.toLowerCase().includes(q) ?? false);

  if (!matches && !node.children.some((c) => subtreeMatches(c, q))) {
    return null;
  }

  const hint = dropHint?.targetId === node.office_id ? dropHint.zone : null;

  return (
    <div>
      <div
        className={`admin-office-tree-row-wrap ${isDragging ? 'admin-office-tree-row-wrap--dragging' : ''}`}
        onDragOver={(e) => {
          if (!dragOfficeId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onDragOver(node, resolveDropZone(e));
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            onDragLeave();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(node, resolveDropZone(e));
        }}
      >
        {hint === 'before' && <div className="admin-office-drop-line admin-office-drop-line--before" />}
        <div
          className={`admin-office-tree-row ${isSelected ? 'admin-office-tree-row--selected' : ''} ${
            !node.is_active ? 'admin-office-tree-row--inactive' : ''
          } ${hint === 'child' ? 'admin-office-tree-row--drop-target' : ''}`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          <span
            className="admin-office-drag-handle shrink-0"
            draggable={!isDragging}
            title="Drag to reorder or reparent"
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData('text/plain', node.office_id);
              e.dataTransfer.effectAllowed = 'move';
              onDragStart(node.office_id);
            }}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={14} aria-hidden />
          </span>
          {hasChildren ? (
            <button
              type="button"
              className="px-0.5 py-0 rounded hover:bg-iip-surface-active shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.office_id);
              }}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-[22px] shrink-0" />
          )}
          <button
            type="button"
            className="admin-office-tree-label"
            onClick={() => onSelect(node)}
          >
            <Building2 size={14} className="admin-office-tree-icon shrink-0" aria-hidden />
            <span className="admin-office-tree-name" title={node.office_name}>
              {node.office_name}
            </span>
            {showMeta && (
            <span className="admin-office-tree-meta">
              {node.ncrb_id && (
                <span className="admin-office-tree-ncrb" title={`NCRB ${node.ncrb_id}`}>
                  {node.ncrb_id}
                </span>
              )}
              {shortLabel && (
                <span className="admin-office-tree-short" title={shortLabel}>
                  {shortLabel}
                </span>
              )}
              {node.is_parent_unit && (
                <span className="admin-office-badge admin-office-badge--parent">Parent</span>
              )}
              {!node.is_active && (
                <span className="admin-office-badge admin-office-badge--inactive">Inactive</span>
              )}
            </span>
            )}
          </button>
        </div>
        {hint === 'after' && <div className="admin-office-drop-line admin-office-drop-line--after" />}
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <OfficeTreeRow
              key={child.office_id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              dragOfficeId={dragOfficeId}
              dropHint={dropHint}
              onToggle={onToggle}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OfficeManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('idle');
  const [form, setForm] = useState(emptyForm);
  const [moveParentId, setMoveParentId] = useState('');
  const [movePosition, setMovePosition] = useState<InsertPosition>('last_child');
  const [moveReferenceId, setMoveReferenceId] = useState('');
  const [dragOfficeId, setDragOfficeId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ targetId: string; zone: DropZone } | null>(null);

  const { data: unitTypes = [], isError: unitTypesError } = useQuery({
    queryKey: ['office-unit-types'],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiClient.get<UnitTypeOption[]>('/iam/office-lookups/unit-types');
      return res.data;
    },
  });

  const { data: ranks = [], isError: ranksError } = useQuery({
    queryKey: ['office-ranks'],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiClient.get<RankOption[]>('/iam/office-lookups/ranks');
      return res.data;
    },
  });

  const rankById = useMemo(() => new Map(ranks.map((r) => [r.id, r])), [ranks]);

  const { data: tree = [], isLoading, refetch, isError: treeError } = useQuery({
    queryKey: ['office-tree', currentOfficeId],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiClient.get<OfficeNode[]>('/iam/offices/tree', {
        params: { include_inactive: true },
      });
      return res.data;
    },
  });

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const selected = selectedId ? findNode(tree, selectedId) : null;
  const byId = useMemo(() => new Map(flat.map((n) => [n.office_id, n])), [flat]);

  const ancestorPath = useMemo(() => {
    if (!selected) return [];
    const path: OfficeNode[] = [];
    let pid = selected.parent_id;
    while (pid) {
      const p = byId.get(pid);
      if (!p) break;
      path.unshift(p);
      pid = p.parent_id;
    }
    return path;
  }, [selected, byId]);

  const moveParentOptions = useMemo(() => {
    if (!selected) return flat;
    return flat.filter(
      (n) =>
        n.office_id !== selected.office_id &&
        !(n.lft > selected.lft && n.rgt < selected.rgt && n.root_id === selected.root_id)
    );
  }, [flat, selected]);

  const siblingOptions = useMemo(() => {
    const parentId = moveParentId || null;
    return flat.filter((n) => n.parent_id === parentId && n.office_id !== selected?.office_id);
  }, [flat, moveParentId, selected]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['office-tree'] });
    void queryClient.invalidateQueries({ queryKey: ['iam-roles'] });
  };

  const scrollToForm = () => {
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const startCreateRoot = () => {
    setFormMode('create-root');
    setSelectedId(null);
    setForm(emptyForm);
    scrollToForm();
  };

  const startCreateChild = (parent: OfficeNode) => {
    setFormMode('create-child');
    setSelectedId(parent.office_id);
    setForm(emptyForm);
    setExpanded((prev) => new Set(prev).add(parent.office_id));
    scrollToForm();
  };

  const startEdit = (node: OfficeNode) => {
    setFormMode('edit');
    setSelectedId(node.office_id);
    setForm(officeNodeToForm(node));
    scrollToForm();
  };

  const startMove = (node: OfficeNode) => {
    setFormMode('move');
    setSelectedId(node.office_id);
    setMoveParentId(node.parent_id ?? '');
    setMovePosition('last_child');
    setMoveReferenceId('');
    scrollToForm();
  };

  const handleCancel = () => {
    if (formMode === 'create-root' || formMode === 'create-child') {
      setFormMode('idle');
      setSelectedId(null);
      setForm(emptyForm);
      return;
    }
    if (formMode === 'move') {
      setFormMode('edit');
      return;
    }
    if (selected) {
      startEdit(selected);
    } else {
      setFormMode('idle');
      setForm(emptyForm);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiClient.post<OfficeNode>('/iam/offices/', payload);
      return res.data;
    },
    onSuccess: (created) => {
      invalidate();
      setSelectedId(created.office_id);
      setFormMode('edit');
      setForm(officeNodeToForm({ ...created, children: created.children ?? [] }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await apiClient.patch<OfficeNode>(`/iam/offices/${id}`, payload);
      return res.data;
    },
    onSuccess: (updated) => {
      invalidate();
      setForm(officeNodeToForm({ ...updated, children: [] }));
      setFormMode('edit');
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({
      id,
      new_parent_id,
      position,
      reference_id,
    }: {
      id: string;
      new_parent_id: string | null;
      position: InsertPosition;
      reference_id?: string;
    }) => {
      const res = await apiClient.post<OfficeNode>(`/iam/offices/${id}/move`, {
        new_parent_id,
        position,
        reference_id: reference_id || null,
      });
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      setFormMode('edit');
      setDropHint(null);
      setDragOfficeId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/iam/offices/${id}`, { params: { subtree: true } });
    },
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      setFormMode('idle');
      setForm(emptyForm);
    },
  });

  const rebuildMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/iam/offices/rebuild');
    },
    onSuccess: () => invalidate(),
  });

  const syncLegacyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ message: string; synced: number; parsed: number }>(
        '/iam/offices/sync-legacy-metadata'
      );
      return res.data;
    },
    onSuccess: async (data) => {
      invalidate();
      await Swal.fire({
        title: data.synced ? 'Metadata synced' : 'Nothing to sync',
        text: data.message,
        icon: data.synced ? 'success' : 'info',
        confirmButtonColor: '#465FFF',
      });
    },
  });

  const importLegacyMutation = useMutation({
    mutationFn: async (replace: boolean) => {
      const res = await apiClient.post<{
        message: string;
        imported: number;
        parsed: number;
        synced?: number;
      }>('/iam/offices/import-legacy', null, { params: { replace } });
      return res.data;
    },
    onSuccess: async (data) => {
      invalidate();
      const title = data.imported
        ? 'Import complete'
        : data.synced
          ? 'Legacy metadata synced'
          : 'Already imported';
      await Swal.fire({
        title,
        text: data.message,
        icon: data.imported || data.synced ? 'success' : 'info',
        confirmButtonColor: '#465FFF',
      });
    },
  });

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    setExpanded(new Set(flat.map((n) => n.office_id)));
  };

  const buildCreatePayload = (parent: OfficeNode | null) => ({
    office_name: form.office_name.trim(),
    office_short_code: form.office_short_code.trim() || null,
    ncrb_id: form.ncrb_id.trim() || null,
    office_type_id: form.office_type_id ? Number(form.office_type_id) : null,
    head_rank: form.head_rank ? Number(form.head_rank) : 0,
    is_parent_unit: form.is_parent_unit,
    is_active: form.is_active,
    parent_id: parent?.office_id ?? null,
    position: 'last_child' as const,
    district_id: parent?.district_id ?? null,
  });

  const buildUpdatePayload = () => ({
    office_name: form.office_name.trim(),
    office_short_code: form.office_short_code.trim() || null,
    ncrb_id: form.ncrb_id.trim() || null,
    office_type_id: form.office_type_id ? Number(form.office_type_id) : null,
    head_rank: form.head_rank ? Number(form.head_rank) : 0,
    is_parent_unit: form.is_parent_unit,
    is_active: form.is_active,
  });

  const handleSave = async () => {
    if (!form.office_name.trim()) return;

    if (formMode === 'create-root') {
      await createMutation.mutateAsync(buildCreatePayload(null));
      return;
    }

    if (formMode === 'create-child' && selected) {
      await createMutation.mutateAsync(buildCreatePayload(selected));
      return;
    }

    if (formMode === 'edit' && selected) {
      await updateMutation.mutateAsync({
        id: selected.office_id,
        payload: buildUpdatePayload(),
      });
    }
  };

  const handleMove = async () => {
    if (!selected) return;
    if (
      (movePosition === 'before' || movePosition === 'after') &&
      !moveReferenceId
    ) {
      return;
    }
    await moveMutation.mutateAsync({
      id: selected.office_id,
      new_parent_id: moveParentId || null,
      position: movePosition,
      reference_id:
        movePosition === 'before' || movePosition === 'after' ? moveReferenceId : undefined,
    });
  };

  const handleDelete = async () => {
    if (!selected) return;
    const check = await apiClient.get<{
      can_delete: boolean;
      blockers: string[];
      descendant_count: number;
    }>(`/iam/offices/${selected.office_id}/deletion-check`);
    if (!check.data.can_delete) {
      await showOfficeDeleteBlocked(check.data.blockers);
      return;
    }
    const ok = await confirmDeleteOffice({
      office_name: selected.office_name,
      office_code: selected.office_code,
      descendant_count: check.data.descendant_count,
    });
    if (ok) await deleteMutation.mutateAsync(selected.office_id);
  };

  const applyDragMove = async (target: OfficeNode, zone: DropZone) => {
    if (!dragOfficeId) return;
    const drag = byId.get(dragOfficeId);
    if (!drag || drag.office_id === target.office_id) return;
    if (isDescendantOf(drag, target)) return;

    if (zone === 'child') {
      await moveMutation.mutateAsync({
        id: drag.office_id,
        new_parent_id: target.office_id,
        position: 'last_child',
      });
      return;
    }

    await moveMutation.mutateAsync({
      id: drag.office_id,
      new_parent_id: target.parent_id,
      position: zone,
      reference_id: target.office_id,
    });
  };

  const isSaving =
    createMutation.isPending || updateMutation.isPending || moveMutation.isPending;
  const showFormPanel =
    formMode !== 'idle' || selected != null;
  const isCreating = formMode === 'create-root' || formMode === 'create-child';
  const createParent =
    formMode === 'create-child' && selected ? selected : null;

  return (
    <div className="admin-office-page">
    <AdminPageLayout
      fillHeight
      title="Office Management"
      description="Organizational unit hierarchy with nested-set ordering. Drag units to reorder or reparent; edit details in the panel on the right."
      icon={Building2}
      actions={
        <div className="admin-toolbar">
          <div className="admin-toolbar-group">
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              disabled={isLoading}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} aria-hidden />
              Refresh
            </AdminButton>
          </div>
          <span className="admin-toolbar-divider" aria-hidden />
          <div className="admin-toolbar-group">
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={async () => {
                const replace = flat.length > 5;
                const ok = await confirmImportLegacyOffices(replace);
                if (ok) void importLegacyMutation.mutate(replace);
              }}
              disabled={importLegacyMutation.isPending}
              title="Load full Kerala unit hierarchy from legacy export"
            >
              <Database size={15} className={importLegacyMutation.isPending ? 'animate-pulse' : ''} aria-hidden />
              Import Kerala units
            </AdminButton>
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => syncLegacyMutation.mutate()}
              disabled={syncLegacyMutation.isPending}
              title="Load NCRB ID, unit type, and ranks from legacy export"
            >
              <RefreshCcw size={15} className={syncLegacyMutation.isPending ? 'animate-spin' : ''} aria-hidden />
              Sync legacy fields
            </AdminButton>
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => rebuildMutation.mutate()}
              disabled={rebuildMutation.isPending}
              title="Rebuild lft/rgt from parent links"
            >
              <GitBranch size={15} aria-hidden />
              Rebuild tree
            </AdminButton>
          </div>
          <span className="admin-toolbar-divider" aria-hidden />
          <AdminButton variant="primary" size="sm" onClick={startCreateRoot}>
            <Plus size={15} aria-hidden />
            New root
          </AdminButton>
        </div>
      }
    >
      <AdminTipBanner>
        {flat.length <= 5 ? (
          <>
            Only seed offices are loaded. Click <strong>Import Kerala units</strong> to load the
            full hierarchy (~1,200 legacy units).
          </>
        ) : (
          <>
            <strong>Drag</strong> the grip handle to reorder siblings or drop onto a unit to make it
            a child. Missing NCRB ID on PS units? Click <strong>Sync legacy fields</strong> to load
            values from the legacy export.
          </>
        )}
      </AdminTipBanner>

      {treeError && (
        <div className="alert-danger" role="alert">
          Could not load the office tree. Confirm you have system admin access and iam-svc is
          running.
        </div>
      )}

      <div className="admin-office-layout">
        <div className="admin-office-tree-panel">
          <div className="admin-office-tree-toolbar">
            <div className="relative flex-1 min-w-0">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or code…"
                className="form-control pl-9 py-2 text-sm"
              />
            </div>
            <span className="admin-office-count-badge" title="Total units in tree">
              {flat.length}
            </span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 border-b border-iip-border text-xs">
            <button
              type="button"
              className="text-iip-primary hover:underline font-medium"
              onClick={expandAll}
            >
              Expand all
            </button>
            <button
              type="button"
              className="text-iip-text-muted hover:underline"
              onClick={() => setExpanded(new Set())}
            >
              Collapse all
            </button>
            {moveMutation.isPending && (
              <span className="text-iip-text-muted ml-auto animate-pulse">Moving…</span>
            )}
          </div>
          <div
            className={`admin-office-tree-scroll ${dragOfficeId ? 'admin-office-tree-scroll--dragging' : ''}`}
          >
            {isLoading ? (
              <p className="text-sm text-iip-text-muted p-4">Loading hierarchy…</p>
            ) : tree.length === 0 ? (
              <div className="p-8 text-center text-iip-text-muted">
                <FolderTree size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No offices yet. Create a root unit or import legacy data.</p>
              </div>
            ) : (
              tree.map((root) => (
                <OfficeTreeRow
                  key={root.office_id}
                  node={root}
                  depth={0}
                  selectedId={selectedId}
                  expanded={expanded}
                  dragOfficeId={dragOfficeId}
                  dropHint={dropHint}
                  onToggle={toggleExpand}
                  onSelect={(n) => {
                    setSelectedId(n.office_id);
                    if (formMode !== 'create-child') startEdit(n);
                  }}
                  onDragStart={setDragOfficeId}
                  onDragEnd={() => {
                    setDragOfficeId(null);
                    setDropHint(null);
                  }}
                  onDragOver={(target, zone) => {
                    if (!dragOfficeId || dragOfficeId === target.office_id) return;
                    const drag = byId.get(dragOfficeId);
                    if (drag && isDescendantOf(drag, target)) return;
                    setDropHint({ targetId: target.office_id, zone });
                  }}
                  onDragLeave={() => setDropHint(null)}
                  onDrop={(target, zone) => {
                    void applyDragMove(target, zone);
                  }}
                  search={search}
                />
              ))
            )}
          </div>
          {selected && formMode !== 'create-child' && (
            <div className="admin-office-tree-meta">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong>Level</strong> {selected.hlevel}
                </span>
                <span>
                  <strong>Order</strong> {selected.list_order ?? '—'}
                </span>
                <span>
                  <strong>Children</strong> {selected.child_count}
                </span>
                <span>
                  <strong>Subtree</strong> {selected.descendant_count}
                </span>
                {selected.head_rank > 0 && (
                  <span>
                    <strong>Head</strong>{' '}
                    {rankById.get(selected.head_rank)
                      ? rankLabel(rankById.get(selected.head_rank)!)
                      : selected.head_rank}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={formPanelRef} className="admin-office-form-panel min-w-0 scroll-mt-4">
          {!showFormPanel && (
            <div className="admin-office-empty-state">
              <FolderTree size={32} className="mx-auto mb-2 opacity-40" aria-hidden />
              <p className="text-sm font-medium text-iip-text">Select a unit</p>
              <p className="text-xs mt-0.5 text-iip-text-muted">
                Pick a unit from the tree or create a new root.
              </p>
            </div>
          )}

          {showFormPanel && formMode !== 'move' && (
            <div className="admin-form-panel admin-office-form-inner">
              <div className="admin-form-panel-header admin-office-form-header">
                {selected && formMode === 'edit' && ancestorPath.length > 0 && (
                  <nav className="text-xs text-iip-text-muted flex flex-wrap items-center gap-1 mb-1.5">
                    {ancestorPath.map((a) => (
                      <span key={a.office_id} className="flex items-center gap-1">
                        <button
                          type="button"
                          className="hover:text-iip-primary hover:underline"
                          onClick={() => startEdit(a)}
                        >
                          {a.office_name}
                        </button>
                        <ChevronRight size={12} />
                      </span>
                    ))}
                  </nav>
                )}
                <p className="text-sm font-semibold text-iip-text">
                  {formMode === 'create-root'
                    ? 'New root office'
                    : formMode === 'create-child'
                      ? `New child of ${createParent?.office_name ?? 'parent'}`
                      : selected?.office_name ?? 'Office details'}
                </p>
                {selected && formMode === 'edit' && (
                  <p className="text-[11px] font-mono text-iip-text-muted mt-1">
                    {selected.office_code}
                  </p>
                )}
              </div>

              <div className="admin-form-panel-body admin-office-form-body">
                <div className="admin-office-form-grid">
                  <AdminFormField id="office-name" label="Unit name" required>
                    <input
                      id="office-name"
                      className="form-control"
                      value={form.office_name}
                      onChange={(e) => setForm((s) => ({ ...s, office_name: e.target.value }))}
                      autoFocus={isCreating}
                    />
                  </AdminFormField>
                  <AdminFormField id="office-short-code" label="Short code">
                    <input
                      id="office-short-code"
                      className="form-control"
                      value={form.office_short_code}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, office_short_code: e.target.value }))
                      }
                    />
                  </AdminFormField>
                  <AdminFormField id="office-ncrb-id" label="NCRB ID">
                    <input
                      id="office-ncrb-id"
                      className="form-control"
                      value={form.ncrb_id}
                      onChange={(e) => setForm((s) => ({ ...s, ncrb_id: e.target.value }))}
                    />
                  </AdminFormField>
                  <AdminFormField
                    id="office-type-id"
                    label="Unit type"
                    hint={
                      unitTypesError
                        ? 'Could not load unit types. Restart iam-svc and run migration 007.'
                        : undefined
                    }
                  >
                    <select
                      id="office-type-id"
                      className="form-control"
                      value={form.office_type_id}
                      onChange={(e) => setForm((s) => ({ ...s, office_type_id: e.target.value }))}
                      disabled={unitTypes.length === 0 && !unitTypesError}
                    >
                      <option value="">
                        {unitTypes.length === 0 ? 'Loading unit types…' : '— Select unit type —'}
                      </option>
                      {unitTypes.map((t) => (
                        <option key={t.id} value={String(t.id)}>
                          {t.description}
                        </option>
                      ))}
                    </select>
                  </AdminFormField>
                  <AdminFormField
                    id="office-head-rank"
                    label="Head rank"
                    hint={
                      ranksError
                        ? 'Could not load ranks. Restart iam-svc and run migration 007.'
                        : 'Rank of the unit head (legacy rank table)'
                    }
                  >
                    <select
                      id="office-head-rank"
                      className="form-control"
                      value={form.head_rank}
                      onChange={(e) => setForm((s) => ({ ...s, head_rank: e.target.value }))}
                      disabled={ranks.length === 0 && !ranksError}
                    >
                      <option value="">
                        {ranks.length === 0 ? 'Loading ranks…' : '— Select rank —'}
                      </option>
                      {ranks.map((r) => (
                        <option key={r.id} value={String(r.id)}>
                          {rankLabel(r)}
                        </option>
                      ))}
                    </select>
                  </AdminFormField>
                </div>

                <div className="admin-office-flags">
                  <label className="admin-office-flag">
                    <input
                      type="checkbox"
                      checked={form.is_parent_unit}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, is_parent_unit: e.target.checked }))
                      }
                    />
                    <span className="admin-office-flag__label">Parent / district unit</span>
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

              <div className="admin-form-panel-footer admin-office-form-footer">
                <div className="admin-form-actions">
                  {isCreating ? (
                    <AdminButton
                      variant="primary"
                      size="sm"
                      disabled={isSaving || !form.office_name.trim()}
                      onClick={() => void handleSave()}
                    >
                      <Save size={15} aria-hidden />
                      {isSaving ? 'Creating…' : 'Create office'}
                    </AdminButton>
                  ) : (
                    formMode === 'edit' &&
                    selected && (
                      <>
                        <AdminButton
                          variant="primary"
                          size="sm"
                          disabled={isSaving || !form.office_name.trim()}
                          onClick={() => void handleSave()}
                        >
                          <Save size={15} aria-hidden />
                          {isSaving ? 'Saving…' : 'Save changes'}
                        </AdminButton>
                        <AdminButton
                          variant="secondary"
                          size="sm"
                          onClick={() => startCreateChild(selected)}
                        >
                          <Plus size={15} aria-hidden />
                          Add child
                        </AdminButton>
                        <AdminButton
                          variant="secondary"
                          size="sm"
                          onClick={() => startMove(selected)}
                        >
                          <ArrowRightLeft size={15} aria-hidden />
                          Move
                        </AdminButton>
                        <AdminButton
                          variant="danger"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => void handleDelete()}
                        >
                          <Trash2 size={15} aria-hidden />
                          Delete
                        </AdminButton>
                      </>
                    )
                  )}
                </div>
                <span className="admin-form-actions-spacer hidden sm:block" aria-hidden />
                <AdminButton variant="ghost" size="sm" onClick={handleCancel}>
                  <X size={15} aria-hidden />
                  Cancel
                </AdminButton>
              </div>
            </div>
          )}

          {formMode === 'move' && selected && (
            <div className="admin-form-panel admin-office-form-inner">
              <div className="admin-form-panel-header admin-office-form-header">
                <p className="text-sm font-semibold text-iip-text">Move: {selected.office_name}</p>
                <p className="text-xs text-iip-text-muted mt-1">
                  Choose a new parent and position. You cannot move a unit under its own descendant.
                  Tip: drag the grip handle in the tree for quicker reordering.
                </p>
              </div>
              <div className="admin-form-panel-body admin-office-form-body max-w-lg">
                <AdminFormField id="office-move-parent" label="New parent">
                  <select
                    id="office-move-parent"
                    className="form-control"
                    value={moveParentId}
                    onChange={(e) => {
                      setMoveParentId(e.target.value);
                      setMoveReferenceId('');
                    }}
                  >
                    <option value="">— Root of forest —</option>
                    {moveParentOptions.map((n) => (
                      <option key={n.office_id} value={n.office_id}>
                        {'—'.repeat(n.depth)} {n.office_name}
                      </option>
                    ))}
                  </select>
                </AdminFormField>
                <AdminFormField id="office-move-position" label="Position">
                  <select
                    id="office-move-position"
                    className="form-control"
                    value={movePosition}
                    onChange={(e) => setMovePosition(e.target.value as InsertPosition)}
                  >
                    <option value="first_child">First child</option>
                    <option value="last_child">Last child</option>
                    <option value="before">Before sibling</option>
                    <option value="after">After sibling</option>
                  </select>
                </AdminFormField>
                {(movePosition === 'before' || movePosition === 'after') && (
                  <AdminFormField id="office-move-reference" label="Reference sibling" required>
                    <select
                      id="office-move-reference"
                      className="form-control"
                      value={moveReferenceId}
                      onChange={(e) => setMoveReferenceId(e.target.value)}
                    >
                      <option value="">Select sibling…</option>
                      {siblingOptions.map((n) => (
                        <option key={n.office_id} value={n.office_id}>
                          {n.office_name}
                        </option>
                      ))}
                    </select>
                  </AdminFormField>
                )}
              </div>
              <div className="admin-form-panel-footer admin-office-form-footer">
                <div className="admin-form-actions">
                  <AdminButton
                    variant="primary"
                    size="sm"
                    disabled={
                      moveMutation.isPending ||
                      ((movePosition === 'before' || movePosition === 'after') &&
                        !moveReferenceId)
                    }
                    onClick={() => void handleMove()}
                  >
                    <ArrowRightLeft size={15} aria-hidden />
                    {moveMutation.isPending ? 'Moving…' : 'Apply move'}
                  </AdminButton>
                </div>
                <span className="admin-form-actions-spacer hidden sm:block" aria-hidden />
                <AdminButton variant="ghost" size="sm" onClick={handleCancel}>
                  <X size={15} aria-hidden />
                  Cancel
                </AdminButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminPageLayout>
    </div>
  );
}
