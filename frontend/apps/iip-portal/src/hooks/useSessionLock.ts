import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { getAccessTokenExpiryMs } from '../utils/sessionToken';

/** Lock session after this period without user activity (ms). */
const IDLE_LOCK_MS = 15 * 60 * 1000;

/** Check token expiry this often while authenticated (ms). */
const EXPIRY_CHECK_MS = 30_000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Locks the session on idle timeout or when the access token expires.
 * Keeps user context so the lock screen can show password + captcha only.
 */
export function useSessionLock(enabled: boolean) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionLocked = useAuthStore((s) => s.sessionLocked);
  const lockSession = useAuthStore((s) => s.lockSession);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled || sessionLocked) return;

    const touch = () => {
      lastActivityRef.current = Date.now();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, touch, { passive: true });
    }

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_LOCK_MS) {
        lockSession('idle');
      }
    }, 60_000);

    const expiryTimer = window.setInterval(() => {
      const exp = getAccessTokenExpiryMs(accessToken);
      if (exp && Date.now() >= exp) {
        lockSession('expired');
      }
    }, EXPIRY_CHECK_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, touch);
      }
      window.clearInterval(idleTimer);
      window.clearInterval(expiryTimer);
    };
  }, [enabled, sessionLocked, accessToken, lockSession]);
}
