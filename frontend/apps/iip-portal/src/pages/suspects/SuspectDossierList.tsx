import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch, Pencil, Plus, Search, UserRound } from 'lucide-react';
import { listSuspectDossiers, type SuspectDossierSummary } from '../../api/suspectDossiers';
import { AdminDataTable } from '../../components/admin/AdminDataTable';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { SuspectDossierPhotoThumb } from '../../components/suspects/SuspectDossierPhotoThumb';
import { DOSSIER_DRAFT_STORAGE_KEY } from './suspectFormDefaults';

export default function SuspectDossierList() {
  const [dossiers, setDossiers] = useState<SuspectDossierSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const hasLocalDraft = (() => {
    try {
      return Boolean(localStorage.getItem(DOSSIER_DRAFT_STORAGE_KEY));
    } catch {
      return false;
    }
  })();

  const load = useCallback((q?: string) => {
    setLoading(true);
    void listSuspectDossiers({ q: q || undefined })
      .then((res) => {
        setDossiers(res.dossiers);
        setTotal(res.total);
      })
      .catch(() => {
        setDossiers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    load(query);
  }, [query, load]);

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
        <div className="px-5 py-4 border-b border-iip-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-iip-surface/80">
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
          {hasLocalDraft && (
            <Link to="/suspects/new" className="text-sm text-iip-primary font-medium hover:underline">
              Resume local draft →
            </Link>
          )}
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
          <AdminDataTable
            columns={[
              {
                key: 'photo',
                header: 'Photo',
                className: 'w-[72px]',
                render: (d) => (
                  <SuspectDossierPhotoThumb
                    dossierDraftId={d.dossier_draft_id}
                    photoId={d.front_photo_id}
                    storageKey={d.front_photo_storage_key}
                    alt={d.criminal_name}
                    size="list"
                  />
                ),
              },
              {
                key: 'criminal_name',
                header: 'Criminal name',
                render: (d) => (
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
                ),
              },
              {
                key: 'office',
                header: 'Unit',
                className: 'text-iip-text-muted',
                render: (d) => d.office_name ?? '—',
              },
              {
                key: 'link_status',
                header: 'Link',
                render: (d) => (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-iip-primary/10 text-iip-primary">
                    {d.link_status}
                  </span>
                ),
              },
              {
                key: 'master',
                header: 'Master profile',
                render: (d) =>
                  d.child_dossier_count > 1 || d.link_status === 'LINKED' ? (
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
                  ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (d) => d.status,
              },
              {
                key: 'submitted',
                header: 'Submitted',
                className: 'text-iip-text-muted whitespace-nowrap',
                render: (d) => new Date(d.submitted_at).toLocaleString(),
              },
              {
                key: 'actions',
                header: '',
                className: 'w-[100px] text-right',
                render: (d) => (
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
                ),
              },
            ]}
            data={dossiers}
            keyField={(d) => d.dossier_id}
          />
        )}
      </div>
    </AdminPageLayout>
  );
}
