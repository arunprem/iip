import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  durationMs: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (type: ToastType, message: string, durationMs?: number) => void;
  remove: (id: string) => void;
}

export const DEFAULT_TOAST_DURATION_MS = 5000;
export const TOAST_EXIT_MS = 280;

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  show: (type, message, durationMs = DEFAULT_TOAST_DURATION_MS) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message: trimmed, durationMs }].slice(-5),
    }));
  },

  remove: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export function showToast(type: ToastType, message: string, durationMs?: number) {
  useToastStore.getState().show(type, message, durationMs);
}
