import { apiClient } from './client';

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  event_type: string | null;
  unread: boolean;
  created_at: string;
  metadata: Record<string, string | boolean>;
}

export async function fetchNotificationHistory(limit = 50, offset = 0) {
  const res = await apiClient.get<NotificationRecord[]>('/notifications', {
    params: { limit, offset },
    skipToast: true,
  });
  return res.data;
}

export async function fetchNotificationById(id: string) {
  const res = await apiClient.get<NotificationRecord>(`/notifications/${id}`, { skipToast: true });
  return res.data;
}

export async function markNotificationReadApi(id: string) {
  return apiClient.patch(`/notifications/${id}/read`, null, { skipToast: true });
}

export async function markAllNotificationsReadApi() {
  return apiClient.patch('/notifications/read-all', null, { skipToast: true });
}
