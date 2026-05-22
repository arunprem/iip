import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '../api/http';
import { type AuthResult, isMfaChallenge } from '../api/mfa';

export type LoginFlowResult =
  | { status: 'complete' }
  | { status: 'mfa_verify'; mfaToken: string }
  | { status: 'mfa_enroll'; mfaToken: string };

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
  email: string;
  full_name: string;
  badge_number: string;
  department: string;
  roles: string[];
  groups: string[];
  clearance_level: string;
  jit_elevated: boolean;
  offices: OfficeAssignment[];
  default_office_id: string | null;
  profile_photo_url: string | null;
}

export type SessionLockReason = 'idle' | 'expired';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  currentOfficeId: string | null;
  actionGrants: ActionGrant[];
  isLoading: boolean;
  sessionInitializing: boolean;
  sessionInitFailed: boolean;
  sessionLocked: boolean;
  lockReason: SessionLockReason | null;
  /** Bumps when profile photo changes so avatars refetch the image. */
  profilePhotoRevision: number;
  /** Cached data URL for lock screen (no token while locked). */
  profilePhotoDataUrl: string | null;

  setTokens: (accessToken: string, refreshToken: string) => void;
  bumpProfilePhoto: () => void;
  setProfilePhotoDataUrl: (url: string | null) => void;
  setUser: (user: User) => void;
  setCurrentOfficeId: (officeId: string) => void;
  login: (
    username: string,
    password: string,
    captchaId: string,
    captchaCode: string
  ) => Promise<LoginFlowResult>;
  logout: () => void;
  lockSession: (reason: SessionLockReason) => void;
  unlockSession: (
    password: string,
    captchaId: string,
    captchaCode: string
  ) => Promise<LoginFlowResult>;
  finishAuthTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  switchAccount: () => void;
  fetchMe: () => Promise<void>;
  fetchMeWithTimeout: (timeoutMs?: number) => Promise<void>;
  fetchPermissions: () => Promise<void>;
  /** Reload profile (offices/roles) and permissions — e.g. after admin edits your account. */
  refreshSessionProfile: () => Promise<void>;
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
      sessionInitializing: false,
      sessionInitFailed: false,
      sessionLocked: false,
      lockReason: null,
      profilePhotoRevision: 0,
      profilePhotoDataUrl: null,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      bumpProfilePhoto: () =>
        set({ profilePhotoRevision: Date.now(), profilePhotoDataUrl: null }),

      setProfilePhotoDataUrl: (url) => set({ profilePhotoDataUrl: url }),

      setUser: (user) => {
        const offices = Array.isArray(user.offices) ? user.offices : [];
        const prevOfficeId = get().currentOfficeId;
        let officeId: string | null = null;

        if (prevOfficeId && offices.some((o) => o.office_id === prevOfficeId)) {
          officeId = prevOfficeId;
        } else if (
          user.default_office_id &&
          offices.some((o) => o.office_id === user.default_office_id)
        ) {
          officeId = user.default_office_id;
        } else {
          officeId = offices[0]?.office_id ?? null;
        }

        set({ user: { ...user, offices }, currentOfficeId: officeId });
      },

      setCurrentOfficeId: (officeId) => {
        set({ currentOfficeId: officeId });
        void get().fetchPermissions();
      },

      finishAuthTokens: async (accessToken, refreshToken) => {
        set({ accessToken, refreshToken, sessionLocked: false, lockReason: null });
        await get().fetchMe();
        await get().fetchPermissions();
      },

      login: async (username, password, captchaId, captchaCode) => {
        set({ isLoading: true });
        try {
          const res = await apiClient.post<AuthResult>(
            '/auth/login',
            {
              username,
              password,
              captcha_id: captchaId,
              captcha_code: captchaCode,
            },
            { skipToast: true }
          );
          const data = res.data;
          if (isMfaChallenge(data)) {
            if (data.enrollment_required) {
              return { status: 'mfa_enroll', mfaToken: data.mfa_token! };
            }
            return { status: 'mfa_verify', mfaToken: data.mfa_token! };
          }
          if (!data.access_token || !data.refresh_token) {
            throw new Error('Invalid login response.');
          }
          await get().finishAuthTokens(data.access_token, data.refresh_token);
          return { status: 'complete' };
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
          profilePhotoDataUrl: null,
          sessionInitializing: false,
          sessionInitFailed: false,
          sessionLocked: false,
          lockReason: null,
        });
      },

      fetchMeWithTimeout: async (timeoutMs = 12_000) => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await apiClient.get<User>('/auth/me', {
            skipToast: true,
            signal: controller.signal,
          });
          const data = res.data;
          get().setUser({
            user_id: data.user_id,
            username: data.username,
            email: data.email ?? '',
            full_name: data.full_name ?? data.username,
            badge_number: data.badge_number ?? '',
            department: data.department ?? '',
            roles: data.roles ?? [],
            groups: data.groups ?? [],
            clearance_level: data.clearance_level ?? 'UNCLASSIFIED',
            jit_elevated: Boolean(data.jit_elevated),
            offices: Array.isArray(data.offices) ? data.offices : [],
            default_office_id: data.default_office_id ?? null,
            profile_photo_url: data.profile_photo_url ?? null,
          });
          set({ sessionInitFailed: false });
        } finally {
          window.clearTimeout(timer);
        }
      },

      lockSession: (reason) => {
        const { user, accessToken, sessionLocked } = get();
        if (sessionLocked || !accessToken) return;
        if (!user) {
          get().logout();
          return;
        }
        set({
          accessToken: null,
          sessionLocked: true,
          lockReason: reason,
        });
      },

      unlockSession: async (password, captchaId, captchaCode) => {
        const username = get().user?.username;
        if (!username) {
          throw new Error('No active user for unlock.');
        }
        set({ isLoading: true });
        try {
          const res = await apiClient.post<AuthResult>(
            '/auth/unlock',
            {
              username,
              password,
              captcha_id: captchaId,
              captcha_code: captchaCode,
            },
            { skipToast: true }
          );
          const data = res.data;
          if (isMfaChallenge(data)) {
            if (data.enrollment_required) {
              return { status: 'mfa_enroll', mfaToken: data.mfa_token! };
            }
            return { status: 'mfa_verify', mfaToken: data.mfa_token! };
          }
          if (!data.access_token || !data.refresh_token) {
            throw new Error('Invalid unlock response.');
          }
          await get().finishAuthTokens(data.access_token, data.refresh_token);
          return { status: 'complete' };
        } finally {
          set({ isLoading: false });
        }
      },

      switchAccount: () => {
        get().logout();
      },

      fetchMe: async () => {
        await get().fetchMeWithTimeout();
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

      refreshSessionProfile: async () => {
        await get().fetchMe();
        await get().fetchPermissions();
      },

      initializeSession: async () => {
        const { accessToken, user, sessionLocked, sessionInitializing } = get();

        if (sessionLocked) {
          if (!user) get().logout();
          return;
        }
        if (!accessToken) return;
        if (sessionInitializing) return;

        set({ sessionInitializing: true, sessionInitFailed: false });
        try {
          await get().fetchMeWithTimeout();
          await get().fetchPermissions();
        } catch {
          set({ sessionInitFailed: true });
          if (!get().user) {
            get().logout();
          }
        } finally {
          set({ sessionInitializing: false });
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
        accessToken: state.sessionLocked ? null : state.accessToken,
        refreshToken: state.refreshToken,
        currentOfficeId: state.currentOfficeId,
        sessionLocked: state.sessionLocked,
        lockReason: state.lockReason,
        user: state.user,
        profilePhotoDataUrl: state.profilePhotoDataUrl,
      }),
      onRehydrateStorage: () => (state, err) => {
        if (err) {
          console.error('[auth] failed to restore session from storage', err);
          try {
            localStorage.removeItem('iip-auth-storage');
          } catch {
            /* ignore */
          }
          return;
        }
        if (state?.accessToken && !state.sessionLocked) {
          queueMicrotask(() => {
            void useAuthStore.getState().initializeSession();
          });
        }
      },
    }
  )
);

export function selectIsAuthenticated(state: AuthState): boolean {
  return Boolean(state.accessToken && state.user);
}

/** User may continue in the shell behind the lock overlay (no access token). */
export function selectHasLockedSession(state: AuthState): boolean {
  return Boolean(state.sessionLocked && state.user);
}

export function selectCurrentOfficeRole(state: AuthState): string | null {
  if (!state.user || !state.currentOfficeId) return null;
  return (
    state.user.offices.find((o) => o.office_id === state.currentOfficeId)?.role_name ?? null
  );
}
