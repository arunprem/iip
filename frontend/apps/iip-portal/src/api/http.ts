import axios from 'axios';

/** Shared axios instance (interceptors attached in `client.ts` after stores load). */
export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});
