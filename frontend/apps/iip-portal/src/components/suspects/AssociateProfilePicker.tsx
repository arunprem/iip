import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Filter, Link2, Loader2, Search, X } from 'lucide-react';
import { searchSuspectProfiles, type SuspectProfileHit } from '../../api/knowledgeGraph';
import { groupProfileHitsByMaster } from '../../utils/groupProfileHits';
import { formatSuspectProfileMeta } from '../../utils/suspectProfileMeta';
import { GENDER_OPTIONS } from '../../pages/suspects/suspectFormDefaults';
import { AdminFormField } from '../admin/AdminFormField';
import { SuspectDossierPhotoThumb } from './SuspectDossierPhotoThumb';

export interface AssociateProfileFilters {
  alias: string;
  gender: string;
  fathersName: string;
  age: string;
  hasPhoto: boolean;
}

const EMPTY_FILTERS: AssociateProfileFilters = {
  alias: '',
  gender: '',
  fathersName: '',
  age: '',
  hasPhoto: false,
};

const PAGE_SIZE = 12;

interface AssociateProfilePickerProps {
  rowId: string;
  value: string;
  linkedMasterSuspectId: string | null;
  linkedHit: SuspectProfileHit | null;
  excludeMasterSuspectId?: string;
  onSelect: (name: string, hit: SuspectProfileHit | null) => void;
}

export function AssociateProfilePicker({
  rowId,
  value,
  linkedMasterSuspectId,
  linkedHit,
  excludeMasterSuspectId,
  onSelect,
}: AssociateProfilePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [hits, setHits] = useState<SuspectProfileHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<AssociateProfileFilters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<AssociateProfileFilters>(EMPTY_FILTERS);
  const [resolvedLinked, setResolvedLinked] = useState<SuspectProfileHit | null>(linkedHit);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    setResolvedLinked(linkedHit);
  }, [linkedHit]);

  useEffect(() => {
    if (!linkedMasterSuspectId || linkedHit) return;
    if (query.trim().length < 2) return;
    let cancelled = false;
    void searchSuspectProfiles(query.trim(), {
      limit: 20,
      excludeMasterSuspectId,
    }).then((res) => {
      if (cancelled) return;
      const match = res.results.find((h) => h.master_suspect_id === linkedMasterSuspectId);
      if (match) setResolvedLinked(match);
    });
    return () => {
      cancelled = true;
    };
  }, [linkedMasterSuspectId, linkedHit, query, excludeMasterSuspectId]);

  const displayHit = linkedHit ?? resolvedLinked;

  const runSearch = useCallback(
    async (text: string, nextOffset: number, applied: AssociateProfileFilters, append: boolean) => {
      if (text.trim().length < 2) {
        setHits([]);
        setHasMore(false);
        return;
      }
      setLoading(true);
      try {
        const ageNum = applied.age.trim() ? Number(applied.age) : undefined;
        const response = await searchSuspectProfiles(text.trim(), {
          limit: PAGE_SIZE,
          offset: nextOffset,
          alias: applied.alias || undefined,
          gender: applied.gender || undefined,
          fathersName: applied.fathersName || undefined,
          age: ageNum && !Number.isNaN(ageNum) ? ageNum : undefined,
          hasPhoto: applied.hasPhoto || undefined,
          excludeMasterSuspectId,
        });
        setHits((prev) =>
          groupProfileHitsByMaster(
            append ? [...prev, ...response.results] : response.results
          )
        );
        setHasMore(response.has_more);
        setOffset(nextOffset);
        setOpen(true);
      } catch {
        if (!append) setHits([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [excludeMasterSuspectId]
  );

  useEffect(() => {
    if (linkedMasterSuspectId) return;
    const timer = window.setTimeout(() => {
      if (query.trim().length >= 2) {
        void runSearch(query, 0, activeFilters, false);
      } else {
        setHits([]);
        setHasMore(false);
        setOpen(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, linkedMasterSuspectId, activeFilters, runSearch]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const activeFilterCount = [
    activeFilters.alias,
    activeFilters.gender,
    activeFilters.fathersName,
    activeFilters.age,
    activeFilters.hasPhoto,
  ].filter(Boolean).length;

  const applyFilters = () => {
    setActiveFilters(filters);
    if (query.trim().length >= 2) {
      void runSearch(query, 0, filters, false);
    }
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setActiveFilters(EMPTY_FILTERS);
    if (query.trim().length >= 2) {
      void runSearch(query, 0, EMPTY_FILTERS, false);
    }
  };

  const clearLink = () => {
    setResolvedLinked(null);
    onSelect(query, null);
  };

  return (
    <div ref={rootRef} className="associate-profile-picker">
      <AdminFormField id={`${rowId}-name`} label="Associate name">
        <div className="associate-profile-picker__input-wrap">
          <Search size={16} className="associate-profile-picker__search-icon" aria-hidden />
          <input
            id={`${rowId}-name`}
            className="form-control associate-profile-picker__input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSelect(e.target.value, null);
            }}
            onFocus={() => hits.length > 0 && setOpen(true)}
            placeholder="Search by name — or type a new associate"
            autoComplete="off"
            aria-expanded={open}
            aria-controls={listId}
          />
          <button
            type="button"
            className={`associate-profile-picker__filter-btn${filtersOpen ? ' associate-profile-picker__filter-btn--active' : ''}`}
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            title="Refine search"
          >
            <Filter size={15} />
            {activeFilterCount > 0 && (
              <span className="associate-profile-picker__filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </AdminFormField>

      {filtersOpen && (
        <div className="associate-profile-picker__filters">
          <p className="associate-profile-picker__filters-title">Narrow results</p>
          <div className="associate-profile-picker__filters-grid">
            <AdminFormField id={`${rowId}-alias-filter`} label="Alias contains">
              <input
                id={`${rowId}-alias-filter`}
                className="form-control"
                value={filters.alias}
                onChange={(e) => setFilters((f) => ({ ...f, alias: e.target.value }))}
                placeholder="e.g. kuttu"
              />
            </AdminFormField>
            <AdminFormField id={`${rowId}-gender-filter`} label="Gender">
              <select
                id={`${rowId}-gender-filter`}
                className="form-control"
                value={filters.gender}
                onChange={(e) => setFilters((f) => ({ ...f, gender: e.target.value }))}
              >
                <option value="">Any</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField id={`${rowId}-father-filter`} label="Father's name contains">
              <input
                id={`${rowId}-father-filter`}
                className="form-control"
                value={filters.fathersName}
                onChange={(e) => setFilters((f) => ({ ...f, fathersName: e.target.value }))}
              />
            </AdminFormField>
            <AdminFormField id={`${rowId}-age-filter`} label="Age (exact)">
              <input
                id={`${rowId}-age-filter`}
                className="form-control"
                type="number"
                min={1}
                max={120}
                value={filters.age}
                onChange={(e) => setFilters((f) => ({ ...f, age: e.target.value }))}
              />
            </AdminFormField>
          </div>
          <label className="associate-profile-picker__photo-check">
            <input
              type="checkbox"
              checked={filters.hasPhoto}
              onChange={(e) => setFilters((f) => ({ ...f, hasPhoto: e.target.checked }))}
            />
            Only profiles with photo
          </label>
          <div className="associate-profile-picker__filter-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>
              Apply filters
            </button>
          </div>
        </div>
      )}

      {linkedMasterSuspectId && (
        <div className="associate-profile-picker__linked">
          <SuspectDossierPhotoThumb
            dossierDraftId={displayHit?.dossier_draft_id}
            photoId={displayHit?.photo_id}
            storageKey={displayHit?.storage_key}
            alt={value}
            size="list"
          />
          <div className="associate-profile-picker__linked-text">
            <span className="associate-profile-picker__linked-label">
              <Link2 size={14} aria-hidden />
              Linked dossier profile
            </span>
            <span className="associate-profile-picker__linked-name">{value}</span>
            {displayHit && formatSuspectProfileMeta(displayHit) && (
              <span className="associate-profile-picker__linked-meta">
                {formatSuspectProfileMeta(displayHit)}
              </span>
            )}
          </div>
          <button
            type="button"
            className="associate-profile-picker__unlink"
            onClick={clearLink}
            title="Unlink profile"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading && !open && (
        <p className="associate-profile-picker__status">
          <Loader2 size={14} className="animate-spin" />
          Searching profiles…
        </p>
      )}

      {open && (hits.length > 0 || loading) && (
        <div id={listId} className="associate-profile-picker__dropdown" role="listbox">
          {hits.map((hit) => (
            <button
              key={hit.dossier_id ?? hit.master_suspect_id}
              type="button"
              role="option"
              className="associate-profile-picker__option"
              onClick={() => {
                onSelect(hit.display_name || hit.criminal_name, hit);
                setQuery(hit.display_name || hit.criminal_name);
                setOpen(false);
              }}
            >
              <SuspectDossierPhotoThumb
                dossierDraftId={hit.dossier_draft_id}
                photoId={hit.photo_id}
                storageKey={hit.storage_key}
                alt={hit.display_name || hit.criminal_name}
                size="list"
              />
              <span className="associate-profile-picker__option-body">
                <span className="associate-profile-picker__option-name">
                  {hit.display_name || hit.criminal_name}
                </span>
                {hit.match_tags && hit.match_tags.length > 0 ? (
                  <span className="associate-profile-picker__option-tags">
                    {hit.match_tags.map((tag) => (
                      <span key={tag} className="kg-results-tag">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : null}
                {formatSuspectProfileMeta(hit) && (
                  <span className="associate-profile-picker__option-meta">
                    {formatSuspectProfileMeta(hit)}
                  </span>
                )}
              </span>
              <ChevronDown size={14} className="associate-profile-picker__option-chevron rotate-[-90deg]" />
            </button>
          ))}
          {loading && (
            <p className="associate-profile-picker__dropdown-status">
              <Loader2 size={14} className="animate-spin" />
              Loading…
            </p>
          )}
          {!loading && hits.length === 0 && (
            <p className="associate-profile-picker__dropdown-empty">No matching profiles</p>
          )}
          {hasMore && !loading && (
            <button
              type="button"
              className="associate-profile-picker__load-more"
              onClick={() => void runSearch(query, offset + PAGE_SIZE, activeFilters, true)}
            >
              Load more results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
