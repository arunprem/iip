import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

/**
 * Maintains a single WebSocket while the user is signed in and unlocked.
 * Loads persisted inbox history on sign-in; disconnects on logout or lock.
 */
export function NotificationSocketBridge() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionLocked = useAuthStore((s) => s.sessionLocked);
  const connect = useNotificationStore((s) => s.connect);
  const disconnect = useNotificationStore((s) => s.disconnect);
  const fetchHistory = useNotificationStore((s) => s.fetchHistory);

  useEffect(() => {
    if (accessToken && !sessionLocked) {
      connect(accessToken);
      void fetchHistory();
      return () => disconnect();
    }
    disconnect();
    return undefined;
  }, [accessToken, sessionLocked, connect, disconnect, fetchHistory]);

  return null;
}
