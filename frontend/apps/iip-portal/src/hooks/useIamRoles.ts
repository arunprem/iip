import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export interface IAMRole {
  role_id: string;
  role_name: string;
  description: string;
  privileges: string[];
  requires_jit: boolean;
}

function getApiErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return 'Unable to reach the server. Check that IAM service is running.';
  }
  const response = (err as { response?: { status?: number; data?: unknown } }).response;
  const data = response?.data;
  if (data && typeof data === 'object') {
    const payload = data as {
      error?: { detail?: string };
      detail?: string;
    };
    if (payload.error?.detail) return payload.error.detail;
    if (typeof payload.detail === 'string') return payload.detail;
  }
  if (response?.status === 403) {
    return 'Access denied. Your account needs the SYSTEM_ADMIN or IT_ADMIN role.';
  }
  if (response?.status === 401) {
    return 'Session expired. Please sign in again.';
  }
  return 'Unable to load roles.';
}

export function useIamRoles() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);

  return useQuery({
    queryKey: ['iam-roles', accessToken, user?.user_id],
    enabled: Boolean(accessToken && user),
    queryFn: async () => {
      const res = await apiClient.get<IAMRole[]>('/iam/roles/');
      return res.data;
    },
    retry: 1,
    staleTime: 30_000,
  });
}

export { getApiErrorMessage };
