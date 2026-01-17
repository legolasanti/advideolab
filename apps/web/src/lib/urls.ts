const fallbackBase =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SITE_URL) ??
  (typeof globalThis !== 'undefined' && (globalThis as any)?.process?.env?.VITE_SITE_URL) ??
  'https://example.com';

export const getSiteUrl = (pathname = '/') => {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = typeof window !== 'undefined' ? window.location.origin : fallbackBase;
  return `${base.replace(/\/$/, '')}${normalizedPath}`;
};
