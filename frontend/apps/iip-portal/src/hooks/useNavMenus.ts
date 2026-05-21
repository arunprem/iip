import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { useAuthStore } from '../stores/authStore';

export interface NavMenuItem {
  id: string;
  menu_key: string;
  label: string;
  path: string | null;
  icon: string;
  section: string;
  sort_order: number;
  is_group: boolean;
  privilege_code: string | null;
  children: NavMenuItem[];
}

export function useNavMenus() {
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ['nav-menus', accessToken, currentOfficeId],
    enabled: Boolean(accessToken && currentOfficeId),
    queryFn: async () => {
      const res = await apiClient.get<NavMenuItem[]>('/iam/access/menus');
      return res.data;
    },
    staleTime: 60_000,
  });
}
