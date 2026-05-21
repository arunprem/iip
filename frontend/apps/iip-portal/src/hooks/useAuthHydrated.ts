import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

/**
 * True once zustand persist has finished reading localStorage.
 * Includes a short fallback so the UI never blocks indefinitely.
 */
export function useAuthHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;

    const finish = () => setHydrated(true);

    const unsub = useAuthStore.persist.onFinishHydration(finish);

    if (useAuthStore.persist.hasHydrated()) {
      finish();
    }

    const fallback = window.setTimeout(finish, 500);

    return () => {
      unsub();
      window.clearTimeout(fallback);
    };
  }, [hydrated]);

  return hydrated;
}
