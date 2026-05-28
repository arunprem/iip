import { Link } from 'react-router-dom';
import { FileSearch, Plus, Search, UserRound } from 'lucide-react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { DOSSIER_DRAFT_STORAGE_KEY } from './suspectFormDefaults';

export default function SuspectDossierList() {
  const hasLocalDraft = (() => {
    try {
      return Boolean(localStorage.getItem(DOSSIER_DRAFT_STORAGE_KEY));
    } catch {
      return false;
    }
  })();

  return (
    <AdminPageLayout
      title="Suspect & dossier management"
      description="Register and maintain criminal dossiers with photographs, identity, contacts, and associate details. List and search will connect to the API in the next phase."
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
          <p className="text-3xl font-bold text-iip-text mt-2">—</p>
          <p className="text-xs text-iip-text-muted mt-1">Awaiting backend</p>
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
          <p className="text-3xl font-bold text-iip-text mt-2">—</p>
          <p className="text-xs text-iip-text-muted mt-1">Awaiting backend</p>
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
              disabled
              aria-label="Search dossiers"
            />
          </div>
          {hasLocalDraft && (
            <Link to="/suspects/new" className="text-sm text-iip-primary font-medium hover:underline">
              Resume local draft →
            </Link>
          )}
        </div>

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
      </div>
    </AdminPageLayout>
  );
}
