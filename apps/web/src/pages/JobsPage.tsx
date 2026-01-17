import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useJobs } from '../hooks/useJobs';
import type { Job } from '../hooks/useJobs';
import { useAuth } from '../providers/AuthProvider';

const statusFilters = ['all', 'pending', 'processing', 'completed', 'failed'];

const JobsPage = () => {
  const { isOwner, tenantStatus } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedJobId = searchParams.get('jobId');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('all');
  const isEnabled = !isOwner && tenantStatus === 'active';
  const { jobs, pagination, isLoading } = useJobs(page, status === 'all' ? undefined : status, undefined, isEnabled);
  const jobsList: Job[] = jobs;

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  useEffect(() => {
    if (highlightedJobId && jobsList.some((job) => job.id === highlightedJobId)) {
      const el = document.getElementById(`job-${highlightedJobId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-sky-400');
        setTimeout(() => el.classList.remove('ring-2', 'ring-sky-400'), 2000);
      }
    }
  }, [highlightedJobId, jobsList]);

  if (isOwner) {
    return (
      <section className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 text-slate-200">
        Owners cannot view tenant jobs directly. Impersonate a tenant from the Tenants tab.
      </section>
    );
  }

  if (tenantStatus && tenantStatus !== 'active') {
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
            <button
              key={s}
              className={`rounded-full px-4 py-1 text-xs font-semibold ${
                status === s ? 'bg-indigo-500 text-white' : 'bg-slate-900/60 text-slate-300'
              }`}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 text-sm text-slate-200 backdrop-blur">
        <p className="font-semibold">Newest jobs first.</p>
        <p className="mt-1 text-slate-300">Check back every few seconds while pending or processing jobs complete.</p>
      </div>

      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 backdrop-blur">
        {isLoading && <p className="text-sm text-slate-400">Loading jobs...</p>}
        <div className="space-y-4">
          {jobsList.map((job: Job) => {
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
                    {job.productName ?? 'UGC video'} • {new Date(job.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">
                    {job.language ?? 'multi-lang'} • {job.platform ?? 'multi-platform'} • {job.voiceProfile ?? 'voice'}
                  </p>
                  {job.prompt && <p className="mt-2 text-sm text-slate-300 line-clamp-2">{job.prompt}</p>}
                  {job.videoUrl && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a
                        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 hover:border-indigo-400"
                        href={job.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View video
                      </a>
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
        {pagination && jobsList.length === 0 && <p className="text-sm text-slate-400">No jobs found.</p>}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages || 1}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};

export default JobsPage;
