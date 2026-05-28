import { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from './http';
import { useAuthStore } from '../stores/authStore';
import { showToast } from '../stores/toastStore';
import {
  extractApiErrorMessage,
  extractApiSuccessMessage,
  statusToToastType,
} from '../utils/apiMessages';

export { apiClient };

const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/** Paths that should not surface global toasts (inline UI handles these). */
const SILENT_PATH_PREFIXES = [
  '/auth/login',
  '/auth/unlock',
  '/auth/refresh',
  '/auth/me',
  '/auth/me/profile',
  '/auth/me/photo',
  '/captcha',
  '/ml/faces',
  '/ml/faces/ping',
  '/ml/faces/status',
];

const AUTH_MUTATION_PATHS = ['/auth/login', '/auth/unlock', '/auth/refresh', '/auth/mfa'];

let interceptorsAttached = false;

/** Single in-flight refresh so parallel 401s share one token rotation. */
let refreshInFlight: Promise<string | null> | null = null;

async function rotateAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = apiClient
      .post<{ access_token: string; refresh_token: string }>(
        '/auth/refresh',
        { refresh_token: refreshToken },
        { skipToast: true }
      )
      .then((res) => {
        const access = res.data.access_token;
        const refresh = res.data.refresh_token;
        setTokens(access, refresh);
        return access;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

function shouldSkipToast(url: string | undefined, config: InternalAxiosRequestConfig): boolean {
  if (config.skipToast) return true;
  const path = String(url ?? '');
  return SILENT_PATH_PREFIXES.some((prefix) => path.includes(prefix));
}

function isMutation(method: string | undefined): boolean {
  return MUTATION_METHODS.has(String(method ?? '').toLowerCase());
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Suppress success and error toasts for this request. */
    skipToast?: boolean;
    /** Suppress only the success toast (errors still shown unless skipToast). */
    skipSuccessToast?: boolean;
    /** Internal: set after a successful token refresh retry. */
    _retryAfterRefresh?: boolean;
  }
}

/** Attach auth + toast interceptors once (call from main.tsx after modules load). */
export function setupApiClient() {
  if (interceptorsAttached) return;
  interceptorsAttached = true;

  apiClient.interceptors.request.use((config) => {
    const requestUrl = String(config.url ?? '');
    const isCaptchaRequest = requestUrl.includes('/captcha');

    const { accessToken, currentOfficeId } = useAuthStore.getState();
    if (accessToken && !isCaptchaRequest) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    } else if (isCaptchaRequest && config.headers) {
      delete config.headers.Authorization;
    }
    if (currentOfficeId) {
      config.headers['X-Office-Id'] = currentOfficeId;
    }
    if (config.data instanceof FormData && config.headers) {
      delete config.headers['Content-Type'];
    }
    return config;
  });

  apiClient.interceptors.response.use(
    (response) => {
      const config = response.config;
      if (
        !shouldSkipToast(config.url, config) &&
        !config.skipSuccessToast &&
        isMutation(config.method)
      ) {
        const message = extractApiSuccessMessage(
          response.data,
          String(config.method ?? 'GET'),
          response.status
        );
        if (message) {
          showToast('success', message);
        }
      }
      return response;
    },
    async (error: AxiosError) => {
      const config = error.config;
      const status = error.response?.status;
      const requestUrl = String(config?.url ?? '');

      const authState = useAuthStore.getState();
      const isAuthMutation = AUTH_MUTATION_PATHS.some((p) => requestUrl.includes(p));
      const isCaptchaRequest = requestUrl.includes('/captcha');

      const canTryRefresh =
        status === 401 &&
        config &&
        !config._retryAfterRefresh &&
        !isAuthMutation &&
        !isCaptchaRequest &&
        !authState.sessionLocked &&
        Boolean(authState.refreshToken);

      if (canTryRefresh) {
        const newAccessToken = await rotateAccessToken();
        if (newAccessToken) {
          config._retryAfterRefresh = true;
          config.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient.request(config);
        }
      }

      if (status === 401 && !isAuthMutation && !isCaptchaRequest) {
        if (authState.user) {
          if (!authState.sessionLocked) {
            authState.lockSession('expired');
          }
        } else {
          authState.logout();
        }
      }

      const suppress401Toast =
        status === 401 &&
        !isAuthMutation &&
        Boolean(authState.user || authState.sessionLocked || authState.refreshToken);

      if (config && !shouldSkipToast(requestUrl, config) && !suppress401Toast) {
        const message = extractApiErrorMessage(error.response?.data, status);
        const type = status ? statusToToastType(status) : 'error';
        showToast(type, message);
      }

      return Promise.reject(error);
    }
  );
}
