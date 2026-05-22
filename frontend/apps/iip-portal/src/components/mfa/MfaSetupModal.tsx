import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import type { MfaSetupPayload } from '../../api/mfa';
import { AdminButton } from '../admin/AdminButton';
import { MfaEnrollmentStep } from './MfaEnrollmentStep';

interface MfaSetupModalProps {
  setup: MfaSetupPayload;
  open: boolean;
  error?: string | null;
  isLoading?: boolean;
  onComplete: (code: string) => void | Promise<void>;
  onClose: () => void;
}

export function MfaSetupModal({
  setup,
  open,
  error,
  isLoading = false,
  onComplete,
  onClose,
}: MfaSetupModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, isLoading, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-setup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        className="w-full max-w-lg max-h-[min(92dvh,720px)] flex flex-col rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-iip-border shrink-0">
          <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-iip-primary/10 text-iip-primary">
            <ShieldCheck size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id="mfa-setup-title" className="text-sm font-semibold text-iip-text">
              Set up authenticator
            </h2>
            <p className="text-xs text-iip-text-muted mt-0.5 leading-relaxed">
              Scan the QR code with your authenticator app, then enter the verification code.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="shrink-0 p-2 rounded-lg text-iip-text-muted hover:text-iip-text hover:bg-iip-surface-hover disabled:opacity-50"
            aria-label="Close setup"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          <MfaEnrollmentStep
            setup={setup}
            variant="modal"
            error={error}
            isLoading={isLoading}
            onComplete={onComplete}
          />
        </div>

        <div className="shrink-0 px-5 py-3.5 border-t border-iip-border bg-iip-bg/40 flex justify-end">
          <AdminButton variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel setup
          </AdminButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
