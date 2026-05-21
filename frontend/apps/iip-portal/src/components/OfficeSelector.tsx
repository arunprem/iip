import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, type OfficeAssignment } from '../stores/authStore';

const OFFICE_SCOPED_QUERY_ROOTS = [
  'nav-menus',
  'privileges-menu',
  'privileges-data',
  'iam-roles',
  'matrix-menu',
  'matrix-data',
  'admin-menus',
] as const;

function formatOfficeLabel(office: OfficeAssignment): string {
  return `${office.office_name} · ${office.role_name}`;
}

function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active: boolean
) {
  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ref, onClose, active]);
}

export function OfficeSelector() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const setCurrentOfficeId = useAuthStore((s) => s.setCurrentOfficeId);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  if (!user?.offices?.length) return null;

  const activeOffice =
    user.offices.find((o) => o.office_id === currentOfficeId) ?? user.offices[0];

  const handleSelect = async (officeId: string) => {
    setOpen(false);
    if (officeId === currentOfficeId) return;
    setCurrentOfficeId(officeId);
    await Promise.all(
      OFFICE_SCOPED_QUERY_ROOTS.map((root) =>
        queryClient.invalidateQueries({ queryKey: [root] })
      )
    );
  };

  if (user.offices.length === 1) {
    return (
      <span
        className="hidden md:inline-flex items-center gap-1.5 text-xs text-iip-text-muted max-w-[280px] truncate"
        title={formatOfficeLabel(activeOffice)}
      >
        <Building2 size={14} className="shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{formatOfficeLabel(activeOffice)}</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 max-w-[min(100vw-12rem,20rem)] rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          open
            ? 'border-iip-primary/40 bg-iip-primary/5 text-iip-text'
            : 'border-iip-border bg-iip-bg text-iip-text hover:bg-iip-surface-hover'
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Select active office and role"
        title={formatOfficeLabel(activeOffice)}
      >
        <Building2 size={14} className="shrink-0 text-iip-text-muted" aria-hidden />
        <span className="truncate text-left font-medium">{formatOfficeLabel(activeOffice)}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-iip-text-muted transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`absolute right-0 top-[calc(100%+6px)] z-50 min-w-[16rem] max-w-[22rem] origin-top-right rounded-xl border border-iip-border bg-iip-surface shadow-lg transition-all duration-200 ease-out ${
          open
            ? 'pointer-events-auto scale-100 opacity-100 translate-y-0'
            : 'pointer-events-none scale-95 opacity-0 -translate-y-1'
        }`}
        role="listbox"
        aria-label="Offices"
      >
        <div className="border-b border-iip-border px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-iip-text-muted">
            Active unit
          </p>
        </div>
        <ul className="py-1 max-h-64 overflow-y-auto">
          {user.offices.map((office) => {
            const selected = office.office_id === activeOffice.office_id;
            return (
              <li key={office.office_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => void handleSelect(office.office_id)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors ${
                    selected
                      ? 'bg-iip-primary/10 text-iip-primary'
                      : 'text-iip-text hover:bg-iip-surface-hover'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {selected ? (
                      <Check size={14} className="text-iip-primary" aria-hidden />
                    ) : (
                      <span className="inline-block w-3.5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{office.office_name}</span>
                    <span
                      className={`block mt-0.5 ${
                        selected ? 'text-iip-primary/80' : 'text-iip-text-muted'
                      }`}
                    >
                      {office.role_name}
                      {office.office_code ? ` · ${office.office_code}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
