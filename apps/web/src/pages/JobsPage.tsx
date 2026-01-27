import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import type { Job } from '../hooks/useJobs';
import { useAuth } from '../providers/AuthProvider';
import api from '../lib/api';
import Button from '../components/ui/Button';
import { JobCardSkeleton } from '../components/ui/Skeleton';

const statusFilters = ['all', 'pending', 'processing', 'completed', 'failed'];

const JobsPage = () => {
  const { isOwner, tenantStatus } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedJobId = searchParams.get('jobId');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const jobsScope = isOwner ? 'owner' : 'tenant';
  const isEnabled = isOwner ? true : tenantStatus === 'active';
  const { jobs, pagination, isLoading, error } = useJobs(
    page,
    status === 'all' ? undefined : status,
    undefined,
    isEnabled,
    jobsScope,
  );
  const jobsList: Job[] = jobs;

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  const sortedJobs = useMemo(() => {
    const getSortValue = (job: Job) => {
      const timestamp = Date.parse(job.createdAt ?? '');
      return Number.isFinite(timestamp) ? timestamp : 0;
    };
    return [...jobsList].sort((a, b) => getSortValue(b) - getSortValue(a));
  }, [jobsList]);

  const buildDownloadName = (job: Job) => {
    const base = (job.productName ?? job.id).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `${base || job.id}.mp4`;
  };

  const handleDownload = async (job: Job) => {
    if (!job.videoUrl) return;
    const endpoint = isOwner ? `/owner/ugc/jobs/${job.id}/download` : `/ugc/jobs/${job.id}/download`;
    try {
      setDownloadingJobId(job.id);
      const response = await api.get(endpoint, { responseType: 'blob' });
      const contentType = response.headers?.['content-type'] ?? 'video/mp4';
      const blob = new Blob([response.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = buildDownloadName(job);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      if (job.videoUrl) {
        window.open(job.videoUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloadingJobId((current) => (current === job.id ? null : current));
    }
  };

  const handleCopyUrl = async (job: Job) => {
    if (!job.videoUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(job.videoUrl);
        setCopiedJobId(job.id);
        window.setTimeout(() => {
          setCopiedJobId((current) => (current === job.id ? null : current));
        }, 2000);
        return;
      }
      window.prompt('Copy URL', job.videoUrl);
    } catch (err) {
      console.error(err);
      window.alert('Unable to copy the URL.');
    }
  };

  useEffect(() => {
    if (highlightedJobId && sortedJobs.some((job) => job.id === highlightedJobId)) {
      const el = document.getElementById(`job-${highlightedJobId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-sky-400');
        setTimeout(() => el.classList.remove('ring-2', 'ring-sky-400'), 2000);
      }
    }
  }, [highlightedJobId, sortedJobs]);

  if (!isOwner && tenantStatus && tenantStatus !== 'active') {
    return (
      <section className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-100">
        Job history is available once your account is active. Current status: {tenantStatus}.
      </section>
    );
  }

  return (
    <section className="space-y-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Jobs</h1>
          <p className="text-sm text-slate-400">Inspect every automation hop and download the finished reels.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((s) => (
            <Button
              key={s}
              variant={status === s ? 'primary' : 'ghost'}
              size="sm"
              className={clsx('rounded-full px-4', status !== s && 'bg-slate-900/60')}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 text-sm text-slate-200 backdrop-blur">
        <p className="font-semibold">Newest jobs first.</p>
        <p className="mt-1 text-slate-300">Check back every few seconds while pending or processing jobs complete.</p>
      </div>

      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 backdrop-blur">
        {error && (
          <p className="text-sm text-rose-300">
            {isOwner ? 'Unable to load sandbox jobs. Configure a sandbox tenant in Owner → Settings.' : 'Failed to load jobs.'}
          </p>
        )}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <JobCardSkeleton key={`job-skeleton-${index}`} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedJobs.map((job: Job, index) => {
              const pageOffset = pagination ? (page - 1) * pagination.pageSize : 0;
              const displayIndex = pageOffset + index + 1;
              const mediaSrc = job.videoUrl ?? job.imageUrl ?? null;
              const isProcessing = job.status === 'pending' || job.status === 'processing';
              const statusClass =
                job.status === 'completed'
                  ? 'bg-emerald-500/20 text-emerald-100'
                  : isProcessing
                  ? 'bg-amber-500/20 text-amber-100'
                  : job.status === 'failed'
                  ? 'bg-rose-500/20 text-rose-100'
                  : 'bg-sky-500/20 text-sky-100';
              return (
                <div
                  key={job.id}
                  id={`job-${job.id}`}
                  className="grid gap-4 rounded-2xl border border-white/10 p-4 md:grid-cols-[180px_1fr_auto]"
                >
                  <div className="h-48 overflow-hidden rounded-xl bg-slate-900/60">
                    {mediaSrc ? (
                      job.videoUrl ? (
                        <video src={mediaSrc} className="h-full w-full object-cover" playsInline muted loop controls />
                      ) : (
                        <img src={mediaSrc} alt={job.productName ?? 'UGC job'} className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No preview</div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      #{displayIndex} · {job.productName ?? 'UGC video'} • {new Date(job.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-400">
                      {job.language ?? 'multi-lang'} • {job.platform ?? 'multi-platform'} • {job.voiceProfile ?? 'voice'}
                    </p>
                    {job.prompt && <p className="mt-2 text-sm text-slate-300 line-clamp-2">{job.prompt}</p>}
                    {job.videoUrl && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          as="a"
                          href={job.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          variant="secondary"
                          size="sm"
                          className="rounded-full"
                        >
                          View video
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          disabled={downloadingJobId === job.id}
                          onClick={() => handleDownload(job)}
                        >
                          {downloadingJobId === job.id ? 'Downloading…' : 'Download'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleCopyUrl(job)}
                        >
                          Copy URL
                        </Button>
                        {copiedJobId === job.id && (
                          <span className="text-xs text-emerald-200" aria-live="polite">
                            Copied
                          </span>
                        )}
                      </div>
                    )}
                    {job.errorMessage && job.status === 'failed' && (
                      <p className="mt-2 text-xs text-rose-200" title={job.errorMessage ?? undefined}>
                        Error: {job.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end justify-between">
                    <span className={`rounded-full px-4 py-1 text-xs font-semibold ${statusClass}`}>
                      {job.status}
                    </span>
                    {job.completedAt && (
                      <p className="text-[11px] text-slate-400">Completed {new Date(job.completedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && pagination && sortedJobs.length === 0 && <p className="text-sm text-slate-400">No jobs found.</p>}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full"
          >
            Previous
          </Button>
          <span>
            Page {page} of {totalPages || 1}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full"
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
};

export default JobsPage;
