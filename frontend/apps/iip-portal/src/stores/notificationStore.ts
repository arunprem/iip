import { create } from 'zustand';
import {
  fetchNotificationById,
  fetchNotificationHistory,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  type NotificationRecord,
} from '../api/notifications';

export type NotificationKind = 'alert' | 'info' | 'success';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: NotificationKind;
  createdAt: string;
  eventType?: string;
  metadata?: Record<string, string | boolean>;
}

export function formatNotificationTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

type WsStatus = 'idle' | 'connecting' | 'open' | 'closed';

const MAX_NOTIFICATIONS = 50;
const PING_INTERVAL_MS = 45_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

let socket: WebSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;
let currentToken: string | null = null;
let historyFetchPromise: Promise<void> | null = null;

function clearPingTimer() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Just now';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
  return `${Math.floor(diffSec / 86400)} day ago`;
}

function notificationKind(raw: string): NotificationKind {
  if (raw === 'alert' || raw === 'success') return raw;
  return 'info';
}

export function mapRecordToNotification(record: NotificationRecord): AppNotification {
  const createdAt = record.created_at;
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    time: formatRelativeTime(createdAt),
    unread: record.unread,
    type: notificationKind(record.notification_type),
    createdAt,
    eventType: record.event_type ?? undefined,
    metadata:
      record.metadata && Object.keys(record.metadata).length > 0 ? record.metadata : undefined,
  };
}

function wsBaseUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

function teardownSocket() {
  clearPingTimer();
  intentionalClose = true;
  if (socket) {
    const s = socket;
    socket = null;
    s.onopen = null;
    s.onmessage = null;
    s.onerror = null;
    s.onclose = null;
    // Avoid closing CONNECTING sockets: browsers log
    // "WebSocket is closed before the connection is established."
    // when close() is called during handshake.
    if (s.readyState === WebSocket.OPEN) {
      s.close(1000, 'client_disconnect');
    }
  }
  intentionalClose = false;
}

function scheduleReconnect(get: () => NotificationState) {
  if (intentionalClose || !currentToken) return;
  clearReconnectTimer();
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    if (currentToken) get().connect(currentToken);
  }, delay);
}

function mergeHistoryItems(
  existing: AppNotification[],
  incoming: AppNotification[],
): AppNotification[] {
  const byId = new Map(existing.map((n) => [n.id, n]));
  for (const item of incoming) {
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...item, time: formatRelativeTime(item.createdAt) } : item);
  }
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_NOTIFICATIONS);
}

interface NotificationState {
  items: AppNotification[];
  wsStatus: WsStatus;
  historyLoaded: boolean;
  connect: (accessToken: string) => void;
  disconnect: () => void;
  fetchHistory: () => Promise<void>;
  loadNotification: (id: string) => Promise<AppNotification | null>;
  push: (payload: Record<string, unknown>) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  wsStatus: 'idle',
  historyLoaded: false,

  connect: (accessToken: string) => {
    if (!accessToken) return;
    if (socket && currentToken === accessToken && socket.readyState === WebSocket.OPEN) {
      return;
    }

    get().disconnect();
    currentToken = accessToken;
    intentionalClose = false;
    reconnectAttempt = 0;
    set({ wsStatus: 'connecting' });

    const url = `${wsBaseUrl()}/api/v1/notifications/ws?access_token=${encodeURIComponent(accessToken)}`;
    const ws = new WebSocket(url);
    socket = ws;

    ws.onopen = () => {
      reconnectAttempt = 0;
      set({ wsStatus: 'open' });
      void get().fetchHistory();
      clearPingTimer();
      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send('ping');
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      const raw = String(event.data ?? '').trim();
      if (raw === 'pong') return;
      try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        get().push(data);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onerror = () => {
      set({ wsStatus: 'closed' });
    };

    ws.onclose = () => {
      clearPingTimer();
      set({ wsStatus: 'closed' });
      if (socket === ws) socket = null;
      if (!intentionalClose && currentToken) {
        scheduleReconnect(get);
      }
    };
  },

  disconnect: () => {
    currentToken = null;
    historyFetchPromise = null;
    clearReconnectTimer();
    reconnectAttempt = 0;
    teardownSocket();
    set({ wsStatus: 'idle', historyLoaded: false });
  },

  fetchHistory: async () => {
    if (!currentToken) return;
    if (historyFetchPromise) {
      await historyFetchPromise;
      return;
    }
    historyFetchPromise = (async () => {
      try {
        const records = await fetchNotificationHistory();
        const incoming = records.map(mapRecordToNotification);
        set((state) => ({
          items: mergeHistoryItems(state.items, incoming),
          historyLoaded: true,
        }));
      } catch {
        /* history unavailable — live WS items still work */
      } finally {
        historyFetchPromise = null;
      }
    })();
    await historyFetchPromise;
  },

  loadNotification: async (id: string) => {
    const existing = get().items.find((n) => n.id === id);
    if (existing) return existing;
    try {
      const record = await fetchNotificationById(id);
      const item = mapRecordToNotification(record);
      set((state) => ({
        items: mergeHistoryItems(state.items, [item]),
      }));
      return item;
    } catch {
      return null;
    }
  },

  push: (payload) => {
    const id = String(payload.id ?? crypto.randomUUID());
    const createdAt = String(payload.created_at ?? new Date().toISOString());
    const kind = notificationKind(String(payload.notification_type ?? 'info'));
    const metadata: Record<string, string | boolean> = {};
    if (payload.force_mfa !== undefined) metadata.force_mfa = Boolean(payload.force_mfa);
    if (typeof payload.changed_by === 'string') metadata.changed_by = payload.changed_by;

    const item: AppNotification = {
      id,
      title: String(payload.title ?? 'Notification'),
      message: String(payload.message ?? ''),
      time: formatRelativeTime(createdAt),
      unread: true,
      type: kind,
      createdAt,
      eventType: typeof payload.type === 'string' ? payload.type : undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    };

    set((state) => {
      if (state.items.some((n) => n.id === id)) return state;
      return { items: [item, ...state.items].slice(0, MAX_NOTIFICATIONS) };
    });
  },

  markRead: async (id) => {
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    }));
    try {
      await markNotificationReadApi(id);
    } catch {
      /* optimistic UI; server may already be read */
    }
  },

  markAllRead: async () => {
    set((state) => ({
      items: state.items.map((n) => ({ ...n, unread: false })),
    }));
    try {
      await markAllNotificationsReadApi();
    } catch {
      /* ignore */
    }
  },

  clear: () => set({ items: [], historyLoaded: false }),
}));
