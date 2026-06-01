import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSearch,
  Pencil,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { listSuspectDossiers, type SuspectDossierSummary } from '../../api/suspectDossiers';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { SuspectDossierPhotoThumb } from '../../components/suspects/SuspectDossierPhotoThumb';
import { DOSSIER_DRAFT_STORAGE_KEY } from './suspectFormDefaults';

type SortKey =
  | 'submitted_at'
  | 'criminal_name'
  | 'office_name'
  | 'status'
  | 'link_status';

function compareSortValue(
  a: string | number | null,
  b: string | number | null,
  direction: 'asc' | 'desc'
) {
  const mul = direction === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mul;
  if (b == null) return -1 * mul;
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul;
  }
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  }) * mul;
}

export default function SuspectDossierList() {
  const [dossiers, setDossiers] = useState<SuspectDossierSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>('submitted_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [linkFilter, setLinkFilter] = useState('all');

  const hasLocalDraft = (() => {
    try {
      return Boolean(localStorage.getItem(DOSSIER_DRAFT_STORAGE_KEY));
    } catch {
      return false;
    }
  })();

  const load = useCallback(
    (q?: string, pageNumber: number = 1, pageItems: number = 20) => {
      setLoading(true);
      void listSuspectDossiers({ q: q || undefined, page: pageNumber, pageSize: pageItems })
        .then((res) => {
          setDossiers(res.dossiers);
          setTotal(res.total);
        })
        .catch(() => {
          setDossiers([]);
          setTotal(0);
        })
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(query, page, pageSize);
  }, [query, page, pageSize, load]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All statuses' },
      ...Array.from(new Set(dossiers.map((d) => d.status).filter(Boolean))).sort().map((status) => ({
        value: status,
        label: status,
      })),
    ],
    [dossiers]
  );

  const linkStatusOptions = useMemo(
    () => [
      { value: 'all', label: 'All link statuses' },
      ...Array.from(new Set(dossiers.map((d) => d.link_status).filter(Boolean))).sort().map((linkStatus) => ({
        value: linkStatus,
        label: linkStatus,
      })),
    ],
    [dossiers]
  );

  const filteredDossiers = useMemo(() => {
    const rows = dossiers.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (linkFilter !== 'all' && d.link_status !== linkFilter) return false;
      return true;
    });

    const sorted = [...rows];
    sorted.sort((a, b) => {
      const left =
        sortKey === 'submitted_at'
          ? new Date(a.submitted_at).getTime()
          : sortKey === 'criminal_name'
          ? a.criminal_name
          : sortKey === 'office_name'
          ? a.office_name ?? ''
          : sortKey === 'status'
          ? a.status
          : a.link_status;
      const right =
        sortKey === 'submitted_at'
          ? new Date(b.submitted_at).getTime()
          : sortKey === 'criminal_name'
          ? b.criminal_name
          : sortKey === 'office_name'
          ? b.office_name ?? ''
          : sortKey === 'status'
          ? b.status
          : b.link_status;
      return compareSortValue(left, right, sortDirection);
    });
    return sorted;
  }, [dossiers, sortDirection, sortKey, statusFilter, linkFilter]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'submitted_at' ? 'desc' : 'asc');
    }
  };

  const todayCount = dossiers.filter((d) => {
    const submitted = new Date(d.submitted_at);
    const now = new Date();
    return (
      submitted.getFullYear() === now.getFullYear() &&
      submitted.getMonth() === now.getMonth() &&
      submitted.getDate() === now.getDate()
    );
  }).length;

  return (
    <AdminPageLayout
      title="Suspect & dossier management"
      description="Register and maintain criminal dossiers with photographs, identity, contacts, and associate details."
      icon={FileSearch}
      actions={
        <Link to="/suspects/new" className="btn-primary btn inline-flex items-center gap-1.5">
          <Plus size={18} />
          New dossier
        </Link>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="dashboard-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-iip-text-muted">
            Total dossiers
          </p>
          <p className="text-3xl font-bold text-iip-text mt-2">{loading ? '…' : total}</p>
        </div>
        <div className="dashboard-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-iip-text-muted">
            Draft in browser
          </p>
          <p className="text-3xl font-bold text-iip-text mt-2">{hasLocalDraft ? '1' : '0'}</p>
          <p className="text-xs text-iip-text-muted mt-1">Local autosave only</p>
        </div>
        <div className="dashboard-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-iip-text-muted">
            Updated today
          </p>
          <p className="text-3xl font-bold text-iip-text mt-2">{loading ? '…' : todayCount}</p>
        </div>
      </div>

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border flex flex-col gap-4 sm:gap-6 sm:flex-row sm:items-center sm:justify-between bg-iip-surface/80">
          <div className="relative flex-1 max-w-md">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
            />
            <input
              type="search"
              className="form-control pl-10"
              placeholder="Search by name, alias, or dossier ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search dossiers"
            />
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="inline-flex flex-col text-xs text-iip-text-muted">
              <span>Status</span>
              <select
                className="form-control py-2 px-3 text-sm min-w-[10rem]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex flex-col text-xs text-iip-text-muted">
              <span>Link</span>
              <select
                className="form-control py-2 px-3 text-sm min-w-[10rem]"
                value={linkFilter}
                onChange={(e) => setLinkFilter(e.target.value)}
              >
                {linkStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {hasLocalDraft && (
              <Link to="/suspects/new" className="text-sm text-iip-primary font-medium hover:underline">
                Resume local draft →
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="dossier-list-empty">
            <p className="text-sm text-iip-text-muted">Loading dossiers…</p>
          </div>
        ) : dossiers.length === 0 ? (
          <div className="dossier-list-empty">
            <div className="rounded-full bg-iip-primary/10 p-4 text-iip-primary">
              <UserRound size={32} />
            </div>
            <h2 className="text-lg font-semibold text-iip-text mt-4">No dossiers to show yet</h2>
            <p className="text-sm text-iip-text-muted mt-2 max-w-md text-center">
              Start by creating a new dossier. The guided form begins with a suspect photograph, then
              walks through identity, address, contacts, and associates.
            </p>
            <Link to="/suspects/new" className="btn-primary btn mt-6 inline-flex items-center gap-1.5">
              <Plus size={18} />
              Create first dossier
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-iip-border bg-iip-bg/50 text-left">
                  <th className="px-4 py-3 font-medium text-iip-text-muted w-[72px]">Photo</th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted">
                    <button
                      type="button"
                      onClick={() => toggleSort('criminal_name')}
                      className="inline-flex items-center gap-2 hover:text-iip-text transition-colors"
                    >
                      Criminal name
                      <span className="inline-flex items-center">
                        {sortKey === 'criminal_name' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="opacity-40" />
                        )}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted">
                    <button
                      type="button"
                      onClick={() => toggleSort('office_name')}
                      className="inline-flex items-center gap-2 hover:text-iip-text transition-colors"
                    >
                      Unit
                      <span className="inline-flex items-center">
                        {sortKey === 'office_name' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="opacity-40" />
                        )}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted">Link</th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted">Master profile</th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted">
                    <button
                      type="button"
                      onClick={() => toggleSort('status')}
                      className="inline-flex items-center gap-2 hover:text-iip-text transition-colors"
                    >
                      Status
                      <span className="inline-flex items-center">
                        {sortKey === 'status' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="opacity-40" />
                        )}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleSort('submitted_at')}
                      className="inline-flex items-center gap-2 hover:text-iip-text transition-colors"
                    >
                      Submitted
                      <span className="inline-flex items-center">
                        {sortKey === 'submitted_at' ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )
                        ) : (
                          <ArrowUpDown size={14} className="opacity-40" />
                        )}
                      </span>
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium text-iip-text-muted w-[100px] text-right"> </th>
                </tr>
              </thead>
              <tbody>
                {filteredDossiers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-iip-text-muted">
                      No dossiers match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredDossiers.map((d) => (
                    <tr key={d.dossier_id} className="border-b border-iip-border/80 last:border-0 hover:bg-iip-surface-hover/50">
                      <td className="px-4 py-3">
                        <SuspectDossierPhotoThumb
                          dossierDraftId={d.dossier_draft_id}
                          photoId={d.front_photo_id}
                          storageKey={d.front_photo_storage_key}
                          alt={d.criminal_name}
                          size="list"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <Link
                            to={`/suspects/${d.dossier_id}`}
                            className="font-medium text-iip-primary hover:underline"
                          >
                            {d.criminal_name}
                          </Link>
                          {d.alias_name && (
                            <p className="text-xs text-iip-text-muted mt-0.5">aka {d.alias_name}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-iip-text-muted">{d.office_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-iip-primary/10 text-iip-primary">
                          {d.link_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {d.child_dossier_count > 1 || d.link_status === 'LINKED' ? (
                          <Link
                            to={`/suspects/masters/${d.master_suspect_id}`}
                            className="text-xs text-iip-primary hover:underline"
                          >
                            View ({d.child_dossier_count})
                          </Link>
                        ) : (
                          <Link
                            to={`/suspects/masters/${d.master_suspect_id}`}
                            className="text-xs text-iip-text-muted hover:underline"
                          >
                            View master
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">{d.status}</td>
                      <td className="px-4 py-3 text-iip-text-muted whitespace-nowrap">
                        {new Date(d.submitted_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/suspects/${d.dossier_id}/edit`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-iip-primary hover:underline px-2 py-1"
                            title="Edit dossier"
                          >
                            <Pencil size={14} />
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="px-4 py-4 border-t border-iip-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-iip-text-muted bg-iip-surface/80">
              <div>
                {dossiers.length === 0 ? (
                  'No suspects to show.'
                ) : (
                  <>Showing {dossiers.length} of {total} suspects</>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary btn-xs btn"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  type="button"
                  className="btn-secondary btn-xs btn"
                  disabled={loading || page >= Math.max(1, Math.ceil(total / pageSize))}
                  onClick={() =>
                    setPage((current) => Math.min(Math.max(1, Math.ceil(total / pageSize)), current + 1))
                  }
                >
                  Next
                </button>
                <label className="inline-flex items-center gap-2 text-xs">
                  Rows
                  <select
                    className="form-control py-1 px-2 text-xs"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}
