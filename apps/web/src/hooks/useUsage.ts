import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export type UsageResponse = {
  plan: {
    name: string | null;
    code: string | null;
    monthly_limit: number | null;
  } | null;
  used: number;
  credits_left: number | null;
  reset_day: number;
  billing_cycle_start?: string | null;
  next_billing_date?: string | null;
  usage_cycle_start?: string | null;
  usage_cycle_end?: string | null;
  subscription_period_end?: string | null;
  bonus_credits?: number | null;
};

export const useUsage = (enabled = true) =>
  useQuery<UsageResponse>({
    queryKey: ['usage'],
    queryFn: async () => {
      const { data } = await api.get('/usage');
      return data;
    },
    enabled,
  });
