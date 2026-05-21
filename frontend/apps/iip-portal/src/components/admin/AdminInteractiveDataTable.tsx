import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { Column } from './AdminDataTable';
import { AdminButton } from './AdminButton';

export interface InteractiveColumn<T> extends Column<T> {
  sortable?: boolean;
  sortValue?: (row: T) => string | number | boolean | null | undefined;
}

export interface DataTableFilter {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface AdminInteractiveDataTableProps<T> {
  columns: InteractiveColumn<T>[];
  data: T[];
  keyField: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** Text used for global search when column-level search is not set */
  getSearchText?: (row: T) => string;
  filters?: DataTableFilter[];
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  pageSize?: number;
  pageSizeOptions?: number[];
  toolbarExtra?: ReactNode;
}

type SortDirection = 'asc' | 'desc';

function compareValues(
  a: string | number | boolean | null | undefined,
  b: string | number | boolean | null | undefined,
  direction: SortDirection
): number {
  const mul = direction === 'asc' ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return 1 * mul;
  if (b == null) return -1 * mul;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (Number(a) - Number(b)) * mul;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * mul;
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * mul;
}

export function AdminInteractiveDataTable<T>({
  columns,
  data,
  keyField,
  isLoading,
  emptyMessage = 'No records found.',
  searchPlaceholder = 'Search…',
  getSearchText,
  filters = [],
  defaultSort,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  toolbarExtra,
}: AdminInteractiveDataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? '');
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction ?? 'asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const processed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...data];

    if (q) {
      rows = rows.filter((row) => {
        const text = getSearchText?.(row) ?? '';
        return text.toLowerCase().includes(q);
      });
    }

    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        rows.sort((a, b) => compareValues(col.sortValue!(a), col.sortValue!(b), sortDirection));
      }
    }

    return rows;
  }, [columns, data, getSearchText, search, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages - 1);
  const pageRows = processed.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(0);
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown size={14} className="opacity-40" aria-hidden />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={14} className="text-iip-primary" aria-hidden />
    ) : (
      <ArrowDown size={14} className="text-iip-primary" aria-hidden />
    );
  };

  const rangeStart = processed.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * pageSize, processed.length);

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-iip-border bg-iip-bg/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              className="form-control pl-9 w-full"
              aria-label="Search table"
            />
          </div>
          {toolbarExtra}
        </div>

        {filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-iip-text-muted mr-1">
              <SlidersHorizontal size={14} aria-hidden />
              Filters
            </span>
            {filters.map((f) => (
              <label key={f.id} className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-iip-text-muted">{f.label}</span>
                <select
                  className="form-control py-1.5 px-2 text-xs min-w-[7rem]"
                  value={f.value}
                  onChange={(e) => {
                    f.onChange(e.target.value);
                    setPage(0);
                  }}
                  aria-label={`Filter by ${f.label}`}
                >
                  {f.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {(search || filters.some((f) => f.value !== 'all')) && (
              <button
                type="button"
                className="text-xs font-medium text-iip-primary hover:underline ml-1"
                onClick={() => {
                  setSearch('');
                  filters.forEach((f) => f.onChange('all'));
                  setPage(0);
                }}
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-iip-border bg-iip-bg/50 text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium text-iip-text-muted ${col.className ?? ''}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1.5 hover:text-iip-text transition-colors"
                    >
                      <span>{col.header}</span>
                      <SortIcon columnKey={col.key} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-iip-text-muted">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-iip-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!isLoading &&
              pageRows.map((row) => (
                <tr
                  key={keyField(row)}
                  className="border-b border-iip-border/80 last:border-0 hover:bg-iip-surface-hover/50"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-iip-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-iip-text-muted">
        <p>
          {processed.length === 0
            ? 'No results'
            : `Showing ${rangeStart}–${rangeEnd} of ${processed.length}`}
          {data.length !== processed.length && ` (filtered from ${data.length})`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2">
            <span>Rows per page</span>
            <select
              className="form-control py-1 px-2 text-xs w-16"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex items-center gap-1">
            <AdminButton
              variant="secondary"
              size="icon"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} aria-hidden />
            </AdminButton>
            <span className="px-2 tabular-nums">
              Page {safePage + 1} of {totalPages}
            </span>
            <AdminButton
              variant="secondary"
              size="icon"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight size={16} aria-hidden />
            </AdminButton>
          </div>
        </div>
      </div>
    </div>
  );
}
