import { apiClient } from './client';

export interface MobileWidget {
  id: string;
  widget_key: string;
  label: string;
  description: string;
  icon: string;
  menu_key: string | null;
  privilege_code: string | null;
  mobile_route: string;
  sort_order: number;
  is_active: boolean;
}

export interface MobileWidgetCreatePayload {
  widget_key: string;
  label: string;
  description?: string;
  icon?: string;
  menu_key?: string | null;
  privilege_code?: string | null;
  mobile_route: string;
  sort_order?: number;
  is_active?: boolean;
}

export async function fetchMobileWidgets() {
  return apiClient.get<MobileWidget[]>('/mobile/widgets');
}

export async function createMobileWidget(payload: MobileWidgetCreatePayload) {
  return apiClient.post<MobileWidget>('/mobile/widgets', payload);
}

export async function updateMobileWidget(id: string, payload: Partial<MobileWidgetCreatePayload>) {
  return apiClient.patch<MobileWidget>(`/mobile/widgets/${id}`, payload);
}

export async function toggleMobileWidget(id: string, isActive: boolean) {
  return apiClient.patch<MobileWidget>(`/mobile/widgets/${id}/toggle`, { is_active: isActive });
}
