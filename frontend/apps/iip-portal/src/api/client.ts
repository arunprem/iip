import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { showToast } from '../stores/toastStore';
import {
  extractApiErrorMessage,
  extractApiSuccessMessage,
  statusToToastType,
} from '../utils/apiMessages';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/** Paths that should not surface global toasts (inline UI handles these). */
const SILENT_PATH_PREFIXES = ['/auth/login', '/auth/me', '/captcha'];

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
  }
}

apiClient.interceptors.request.use((config) => {
  const { accessToken, currentOfficeId } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (currentOfficeId) {
    config.headers['X-Office-Id'] = currentOfficeId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config;
    if (!shouldSkipToast(config.url, config) && !config.skipSuccessToast && isMutation(config.method)) {
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
  (error: AxiosError) => {
    const config = error.config;
    const status = error.response?.status;
    const requestUrl = String(config?.url ?? '');

    if (status === 401 && requestUrl.includes('/auth/me')) {
      useAuthStore.getState().logout();
    }

    if (config && !shouldSkipToast(requestUrl, config)) {
      const message = extractApiErrorMessage(error.response?.data, status);
      const type = status ? statusToToastType(status) : 'error';
      showToast(type, message);
    }

    return Promise.reject(error);
  }
);
