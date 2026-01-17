import axios, { AxiosHeaders } from 'axios';

const apiBase =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_API_BASE ?? import.meta.env?.VITE_API_BASE_URL)) ??
  (typeof globalThis !== 'undefined' &&
    ((globalThis as any)?.process?.env?.VITE_API_BASE ??
      (globalThis as any)?.process?.env?.VITE_API_BASE_URL)) ??
  '/api';

const api = axios.create({
  baseURL: apiBase,
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

export default api;
