import axios, { AxiosHeaders } from 'axios';
import axiosRetry from 'axios-retry';

const apiBase =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_API_BASE ?? import.meta.env?.VITE_API_BASE_URL)) ??
  (typeof globalThis !== 'undefined' &&
    ((globalThis as any)?.process?.env?.VITE_API_BASE ??
      (globalThis as any)?.process?.env?.VITE_API_BASE_URL)) ??
  '/api';

const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    if (axiosRetry.isNetworkError(error)) return true;
    const status = error.response?.status ?? 0;
    return status >= 500 && status <= 599;
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    const headers = AxiosHeaders.from(config.headers ?? {});
    headers.set('Authorization', `Bearer ${token}`);
    config.headers = headers;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

const requestRefreshToken = async () => {
  if (!refreshPromise) {
    const config = { headers: { 'X-Requested-With': 'XMLHttpRequest' }, skipAuthRefresh: true } as any;
    refreshPromise = api
      .post('/auth/refresh', null, config)
      .then((response) => {
        const newToken = response.data?.token as string | undefined;
        if (newToken) {
          localStorage.setItem('token', newToken);
          return newToken;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const originalConfig = error.config as (typeof error.config & { _retry?: boolean; skipAuthRefresh?: boolean });
    if (originalConfig?.skipAuthRefresh) {
      return Promise.reject(error);
    }

    if (!originalConfig?._retry) {
      originalConfig._retry = true;
      const newToken = await requestRefreshToken();
      if (newToken) {
        const headers = AxiosHeaders.from(originalConfig.headers ?? {});
        headers.set('Authorization', `Bearer ${newToken}`);
        originalConfig.headers = headers;
        return api.request(originalConfig);
      }
    }

    localStorage.removeItem('token');
    const pathname = window.location.pathname;
    const onAuthRoute = pathname === '/login' || pathname === '/signup';
    if (!onAuthRoute) {
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

export default api;
