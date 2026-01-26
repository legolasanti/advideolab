import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export interface Job {
  id: string;
  tenantId?: string;
  userId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  productName?: string;
  createdAt: string;
  completedAt?: string | null;
  videoUrl?: string | null;
  prompt?: string | null;
  language?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  platform?: string | null;
  voiceProfile?: string | null;
  cta?: string | null;
  imageUrl?: string | null;
  errorMessage?: string | null;
  options?: Record<string, unknown> | null;
  durationSeconds?: number | null;
  provider?: string | null;
}

interface ApiJobsResponse {
  data: Job[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface JobsResponse {
  jobs: Job[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export const fetchJobs = async (
  page = 1,
  status?: string,
  limit?: number,
  scope: 'tenant' | 'owner' = 'tenant',
): Promise<JobsResponse> => {
  try {
    const params: Record<string, unknown> = { page };
    if (status) params.status = status;
    if (limit) params.limit = limit;

    const endpoint = scope === 'owner' ? '/api/owner/ugc/jobs' : '/api/ugc/jobs';
    const response = await api.get<ApiJobsResponse>(endpoint, { params, baseURL: '' });
    const apiResponse = response.data;

    return {
      jobs: apiResponse?.data ?? [],
      pagination: apiResponse?.pagination,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to fetch jobs');
  }
};

export const useJobs = (
  page = 1,
  status?: string,
  limit?: number,
  enabled = true,
  scope: 'tenant' | 'owner' = 'tenant',
) => {
  const { data, error, isLoading } = useQuery<JobsResponse, Error>({
    queryKey: ['jobs', scope, page, status, limit],
    queryFn: () => fetchJobs(page, status, limit, scope),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.jobs.some((job: Job) => job.status === 'pending' || job.status === 'processing') ? 8000 : false,
  });

  return {
    jobs: data?.jobs ?? [],
    pagination: data?.pagination,
    error,
    isLoading,
  };
};
