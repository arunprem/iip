import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import {
  TOAST_EXIT_MS,
  useToastStore,
  type ToastItem,
  type ToastType,
} from '../stores/toastStore';

const toastStyles: Record<
  ToastType,
  { container: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    container:
      'border-emerald-500/50 bg-emerald-50 text-emerald-900 shadow-emerald-500/10 dark:bg-emerald-950/80 dark:text-emerald-100 dark:border-emerald-500/40',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  error: {
    container:
      'border-red-500/50 bg-red-50 text-red-900 shadow-red-500/10 dark:bg-red-950/80 dark:text-red-100 dark:border-red-500/40',
    icon: 'text-red-600 dark:text-red-400',
    Icon: AlertCircle,
  },
  warning: {
    container:
      'border-amber-500/50 bg-amber-50 text-amber-950 shadow-amber-500/10 dark:bg-amber-950/80 dark:text-amber-100 dark:border-amber-500/40',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    container:
      'border-sky-500/50 bg-sky-50 text-sky-950 shadow-sky-500/10 dark:bg-sky-950/80 dark:text-sky-100 dark:border-sky-500/40',
    icon: 'text-sky-600 dark:text-sky-400',
    Icon: Info,
  },
};

type ToastPhase = 'entering' | 'visible' | 'exiting';

function ToastCard({
  toast,
  onRemove,
}: {
  toast: ToastItem;
  onRemove: (id: string) => void;
}) {
  const style = toastStyles[toast.type];
  const Icon = style.Icon;
  const [phase, setPhase] = useState<ToastPhase>('entering');

  const startExit = useCallback(() => {
    setPhase((current) => (current === 'exiting' ? current : 'exiting'));
  }, []);

  useEffect(() => {
    const enterTimer = window.setTimeout(() => setPhase('visible'), 16);

    const autoDismissTimer = window.setTimeout(() => {
      startExit();
    }, toast.durationMs);

    return () => {
      window.clearTimeout(enterTimer);
      window.clearTimeout(autoDismissTimer);
    };
  }, [toast.durationMs, startExit]);

  useEffect(() => {
    if (phase !== 'exiting') return;

    const removeTimer = window.setTimeout(() => {
      onRemove(toast.id);
    }, TOAST_EXIT_MS);

    return () => window.clearTimeout(removeTimer);
  }, [phase, onRemove, toast.id]);

  const motionClass =
    phase === 'entering'
      ? 'toast-motion-enter-from'
      : phase === 'exiting'
        ? 'toast-motion-exit-to'
        : 'toast-motion-visible';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`toast-motion pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${motionClass} ${style.container}`}
    >
      <Icon size={20} className={`mt-0.5 shrink-0 ${style.icon}`} aria-hidden />
      <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={startExit}
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity duration-200"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-[200] flex w-[min(100vw-2rem,24rem)] flex-col gap-2"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onRemove={remove} />
      ))}
    </div>
  );
}
