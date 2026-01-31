import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const useCmsSection = <T extends Record<string, unknown>>(section: string, fallback: T) => {
  const isPrerender = typeof window === 'undefined' && Boolean((globalThis as any).__UGC_PRERENDER__);
  if (isPrerender) {
    return { data: fallback, isLoading: false, isError: false } as const;
  }

  const query = useQuery<Record<string, unknown>>({
    queryKey: ['cms', section],
    queryFn: async () => {
      const { data } = await api.get(`/public/cms/${section}`);
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = (query.data as T | undefined) ?? fallback;
  return { data, isLoading: query.isLoading, isError: query.isError };
};
