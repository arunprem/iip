import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { MENU_ICON_NAMES, resolveIcon } from '../../utils/iconMap';

interface MenuIconPickerProps {
  id?: string;
  value: string;
  onChange: (iconName: string) => void;
}

export function MenuIconPicker({ id = 'menu-icon', value, onChange }: MenuIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const SelectedIcon = resolveIcon(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MENU_ICON_NAMES;
    return MENU_ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`form-control flex items-center gap-3 text-left w-full min-h-[2.75rem] ${
          open ? 'ring-2 ring-iip-primary/25 border-iip-primary' : ''
        }`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-iip-primary/10 text-iip-primary">
          <SelectedIcon size={20} aria-hidden />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-iip-text truncate">{value}</span>
          <span className="block text-xs text-iip-text-muted">Click to choose icon</span>
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-iip-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 rounded-xl border border-iip-border bg-iip-surface shadow-xl overflow-hidden"
          role="listbox"
          aria-label="Menu icons"
        >
          <div className="p-3 border-b border-iip-border bg-iip-bg/50">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted pointer-events-none"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons…"
                className="w-full rounded-lg border border-iip-border bg-iip-bg pl-9 pr-3 py-2 text-sm text-iip-text placeholder:text-iip-text-muted focus:outline-none focus:ring-2 focus:ring-iip-primary/25 focus:border-iip-primary"
                autoFocus
              />
            </div>
            <p className="mt-2 text-xs text-iip-text-muted">
              {filtered.length} of {MENU_ICON_NAMES.length} icons
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-iip-text-muted">No icons match your search.</p>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {filtered.map((name) => {
                  const Icon = resolveIcon(name);
                  if (!Icon) return null;
                  const selected = name === value;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      title={name}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${
                        selected
                          ? 'border-iip-primary bg-iip-primary/10 text-iip-primary'
                          : 'border-iip-border bg-iip-bg hover:border-iip-primary/40 hover:bg-iip-surface-hover text-iip-text-muted hover:text-iip-text'
                      }`}
                    >
                      <Icon size={20} aria-hidden />
                      <span className="text-[9px] leading-tight text-center line-clamp-2 w-full break-all">
                        {name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
