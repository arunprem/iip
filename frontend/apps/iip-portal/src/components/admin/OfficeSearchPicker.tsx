import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface OfficeSearchOption {
  office_id: string;
  office_code: string;
  office_name: string;
}

const MIN_SEARCH_LEN = 2;
const MAX_RESULTS = 40;

function officeLabel(o: OfficeSearchOption): string {
  return `${o.office_name} (${o.office_code})`;
}

interface OfficeSearchPickerProps {
  value: string;
  offices: OfficeSearchOption[];
  excludeOfficeIds?: Set<string>;
  onChange: (officeId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function OfficeSearchPicker({
  value,
  offices,
  excludeOfficeIds,
  onChange,
  disabled = false,
  placeholder = 'Search by unit name or code…',
}: OfficeSearchPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const officeById = useMemo(() => {
    const map = new Map<string, OfficeSearchOption>();
    for (const o of offices) map.set(o.office_id, o);
    return map;
  }, [offices]);

  const selected = value ? officeById.get(value) : undefined;

  const availableOffices = useMemo(() => {
    return offices.filter(
      (o) => o.office_id === value || !excludeOfficeIds?.has(o.office_id)
    );
  }, [offices, excludeOfficeIds, value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_SEARCH_LEN) {
      return [];
    }
    const matches: OfficeSearchOption[] = [];
    for (const o of availableOffices) {
      if (
        o.office_name.toLowerCase().includes(q) ||
        o.office_code.toLowerCase().includes(q)
      ) {
        matches.push(o);
        if (matches.length >= MAX_RESULTS) break;
      }
    }
    return matches.sort((a, b) => a.office_name.localeCompare(b.office_name));
  }, [availableOffices, query]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [results.length, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pickOffice = (office: OfficeSearchOption) => {
    onChange(office.office_id);
    setQuery('');
    setOpen(false);
  };

  const clearSelection = () => {
    onChange('');
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[highlightIndex];
      if (pick) pickOffice(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const showDropdown = open && !disabled;
  const qLen = query.trim().length;

  return (
    <div ref={rootRef} className="admin-office-search relative">
      {selected && !open ? (
        <div className="flex items-center gap-2 rounded-lg border border-iip-border bg-iip-surface px-3 py-2 min-h-[42px]">
          <span className="flex-1 text-sm text-iip-text truncate" title={officeLabel(selected)}>
            {officeLabel(selected)}
          </span>
          {!disabled && (
            <>
              <button
                type="button"
                className="text-xs font-medium text-iip-primary hover:underline shrink-0"
                onClick={() => {
                  setOpen(true);
                  setQuery('');
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                Change
              </button>
              <button
                type="button"
                className="p-1 rounded text-iip-text-muted hover:bg-iip-surface-hover hover:text-iip-text"
                onClick={clearSelection}
                aria-label="Clear office"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="search"
            className="form-control py-2 pl-9 pr-3 text-sm min-h-[42px] w-full"
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listId}
            aria-autocomplete="list"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
      )}

      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="admin-office-search__list absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-iip-border bg-iip-surface shadow-lg py-1"
        >
          {qLen < MIN_SEARCH_LEN ? (
            <li className="px-3 py-2 text-xs text-iip-text-muted">
              Type at least {MIN_SEARCH_LEN} characters to search {availableOffices.length.toLocaleString()}{' '}
              units…
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-iip-text-muted">No offices match &quot;{query}&quot;</li>
          ) : (
            results.map((o, idx) => (
              <li key={o.office_id} role="option" aria-selected={idx === highlightIndex}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    idx === highlightIndex
                      ? 'bg-iip-primary/10 text-iip-primary'
                      : 'text-iip-text hover:bg-iip-surface-hover'
                  }`}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickOffice(o)}
                >
                  <span className="font-medium block truncate">{o.office_name}</span>
                  <span className="text-xs text-iip-text-muted font-mono">{o.office_code}</span>
                </button>
              </li>
            ))
          )}
          {qLen >= MIN_SEARCH_LEN && results.length >= MAX_RESULTS && (
            <li className="px-3 py-1.5 text-[11px] text-iip-text-muted border-t border-iip-border">
              Showing first {MAX_RESULTS} matches — refine your search.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
