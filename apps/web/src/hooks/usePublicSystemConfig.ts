import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export type PublicSystemConfig = {
  customHeadCode: string | null;
  customBodyStart: string | null;
  customBodyEnd: string | null;
  googleOAuthClientId: string | null;
};

export const usePublicSystemConfig = () =>
  useQuery<PublicSystemConfig>({
    queryKey: ['publicSystemConfig'],
    queryFn: async () => {
      const { data } = await api.get('/public/system-config');
      return data as PublicSystemConfig;
    },
    staleTime: 5 * 60 * 1000,
  });
