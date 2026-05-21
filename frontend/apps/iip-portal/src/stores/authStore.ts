import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../api/client';

export interface OfficeAssignment {
  office_id: string;
  office_code: string;
  office_name: string;
  role_id: string;
  role_name: string;
}

export interface ActionGrant {
  privilege_code: string;
  action_code: string;
  action_label: string;
}

export interface User {
  user_id: string;
  username: string;
  roles: string[];
  groups: string[];
  clearance_level: string;
  jit_elevated: boolean;
  offices: OfficeAssignment[];
  default_office_id: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  currentOfficeId: string | null;
  actionGrants: ActionGrant[];
  isLoading: boolean;

  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  setCurrentOfficeId: (officeId: string) => void;
  login: (username: string, password: string, captchaId: string, captchaCode: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  fetchPermissions: () => Promise<void>;
  initializeSession: () => Promise<void>;
  hasAction: (privilegeCode: string, actionCode: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      currentOfficeId: null,
      actionGrants: [],
      isLoading: false,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setUser: (user) => {
        const offices = Array.isArray(user.offices) ? user.offices : [];
        const officeId =
          get().currentOfficeId ??
          user.default_office_id ??
          offices[0]?.office_id ??
          null;
        set({ user: { ...user, offices }, currentOfficeId: officeId });
      },

      setCurrentOfficeId: (officeId) => {
        set({ currentOfficeId: officeId });
        void get().fetchPermissions();
      },

      login: async (username, password, captchaId, captchaCode) => {
        set({ isLoading: true });
        try {
          const res = await apiClient.post(
            '/auth/login',
            {
              username,
              password,
              captcha_id: captchaId,
              captcha_code: captchaCode,
            },
            { skipToast: true }
          );
          set({
            accessToken: res.data.access_token,
            refreshToken: res.data.refresh_token,
          });
          await get().fetchMe();
          await get().fetchPermissions();
        } catch (error) {
          get().logout();
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: () => {
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          currentOfficeId: null,
          actionGrants: [],
        });
      },

      fetchMe: async () => {
        const res = await apiClient.get<User>('/auth/me', { skipToast: true });
        get().setUser(res.data);
      },

      fetchPermissions: async () => {
        const officeId = get().currentOfficeId;
        if (!officeId) return;
        try {
          const res = await apiClient.get<{ actions?: ActionGrant[] }>('/iam/access/permissions', {
            skipToast: true,
          });
          set({ actionGrants: res.data.actions ?? [] });
        } catch {
          set({ actionGrants: [] });
        }
      },

      initializeSession: async () => {
        const { accessToken, user } = get();
        if (!accessToken) return;
        if (user) {
          await get().fetchPermissions();
          return;
        }
        try {
          await get().fetchMe();
          await get().fetchPermissions();
        } catch {
          get().logout();
        }
      },

      hasAction: (privilegeCode, actionCode) => {
        const officeRole = selectCurrentOfficeRole(get());
        if (officeRole === 'SYSTEM_ADMIN') return true;
        return get().actionGrants.some(
          (g) => g.privilege_code === privilegeCode && g.action_code === actionCode
        );
      },
    }),
    {
      name: 'iip-auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentOfficeId: state.currentOfficeId,
      }),
      onRehydrateStorage: () => (_state, err) => {
        if (err) {
          console.error('[auth] failed to restore session from storage', err);
          try {
            localStorage.removeItem('iip-auth-storage');
          } catch {
            /* ignore */
          }
        }
      },
    }
  )
);

export function selectIsAuthenticated(state: AuthState): boolean {
  return Boolean(state.accessToken && state.user);
}

export function selectCurrentOfficeRole(state: AuthState): string | null {
  if (!state.user || !state.currentOfficeId) return null;
  return (
    state.user.offices.find((o) => o.office_id === state.currentOfficeId)?.role_name ?? null
  );
}
