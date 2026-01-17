import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import clsx from 'clsx';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useUsage } from '../hooks/useUsage';
import { useAuth } from '../providers/AuthProvider';
import { useJobs } from '../hooks/useJobs';
import type { Job } from '../hooks/useJobs';
import { formatPlanSummary } from '../lib/plans';
import { LANGUAGES } from '../lib/languages';

const vibes = [
  { label: 'Trusted guide', value: 'trusted_guide' },
  { label: 'Creator next door', value: 'creator_next_door' },
  { label: 'High-energy hype', value: 'high_energy' },
  { label: 'Clinical explainer', value: 'clinical_explainer' },
];

const voiceProfiles = [
  { label: 'Warm storyteller', value: 'warm_storyteller' },
  { label: 'Energetic host', value: 'energetic_host' },
  { label: 'Calm reviewer', value: 'calm_reviewer' },
  { label: 'Bold hype duo', value: 'bold_duo' },
];

const platforms = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Instagram', value: 'instagram' },
];

const creatorGenders = [
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
] as const;

const creatorAgeRanges = [
  { label: '18–25', value: '18-25' },
  { label: '25–35', value: '25-35' },
  { label: '35–45', value: '35-45' },
  { label: '45–55', value: '45-55' },
  { label: '55–65', value: '55-65' },
  { label: '65+', value: '65+' },
] as const;

const callsToAction = [
  { label: 'None', value: 'none' },
  { label: 'Shop now', value: 'shop_now' },
  { label: 'Add to cart', value: 'add_to_cart' },
  { label: 'Learn more', value: 'learn_more' },
] as const;

type CallToActionValue = (typeof callsToAction)[number]['value'];
type CreatorGenderValue = (typeof creatorGenders)[number]['value'];
type CreatorAgeRangeValue = (typeof creatorAgeRanges)[number]['value'];

type FormValues = {
  productName: string;
  scriptLanguage: string;
  platformFocus: string;
  vibe: string;
  voiceProfile: string;
  callToAction: CallToActionValue;
  creatorGender: CreatorGenderValue;
  creatorAgeRange: CreatorAgeRangeValue;
  videoCount: number;
  creativeBrief?: string;
};

type OutputItem = {
  url: string;
  type?: string;
  size?: string;
};

type RecentClip = {
  id: string;
  url: string;
  createdAt: string;
  platform?: string;
  language?: string;
  vibe?: string;
};

const NewVideoPage = () => {
  const { isOwner, tenant, tenantStatus, token } = useAuth();
  const navigate = useNavigate();
  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
    refetch: refetchUsage,
  } = useUsage(Boolean(token) && !isOwner);
  const { jobs: recentJobs } = useJobs(1, 'completed', 20, !isOwner);

  const [outputs, setOutputs] = useState<OutputItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
  } = useForm<FormValues>({
    defaultValues: {
      productName: '',
      scriptLanguage: 'en-US',
      platformFocus: 'tiktok',
      vibe: 'trusted_guide',
      voiceProfile: 'warm_storyteller',
      callToAction: 'none',
      creatorGender: 'female',
      creatorAgeRange: '25-35',
      videoCount: 1,
      creativeBrief: '',
    },
  });

  const basePlanLimit = usage?.plan?.monthly_limit ?? null;
  const planCode = usage?.plan?.code ?? null;
  const isUnlimited = Boolean(planCode) && basePlanLimit === null;
  const bonusCredits = usage?.bonus_credits ?? 0;
  const planLimit = !isUnlimited && basePlanLimit !== null ? basePlanLimit + bonusCredits : null;
  const quotaRemaining =
    isUnlimited ? null : planLimit !== null ? Math.max(planLimit - (usage?.used ?? 0), 0) : null;
  const quotaDepleted = !isUnlimited && planLimit !== null && quotaRemaining !== null && quotaRemaining <= 0;
  const tenantState = tenantStatus ?? 'active';
  const renewalDateIso = usage?.next_billing_date ?? tenant?.nextBillingDate ?? null;
  const renewalDate = renewalDateIso ? new Date(renewalDateIso) : null;
  const renewalLabel = renewalDate ? renewalDate.toLocaleDateString() : null;
  const billingExpired = renewalDate ? renewalDate.getTime() < Date.now() : false;
  const creationBlockedReason =
    tenantState === 'pending'
      ? 'Your account is pending activation. We will notify you once you can launch jobs.'
      : tenantState === 'suspended'
      ? 'This tenant is suspended. Contact support to resolve billing or policy issues.'
      : billingExpired
      ? `Your billing period ended${renewalLabel ? ` on ${renewalLabel}` : ''}. Renew or upgrade to continue.`
      : !isUnlimited && planLimit === null
      ? 'No plan is attached to this workspace yet. Contact support to activate your plan.'
      : quotaDepleted
      ? 'You have used all videos for this month. Request an upgrade to continue.'
      : null;
  const creationBlocked = Boolean(creationBlockedReason);

  useEffect(
    () => () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    },
    [filePreview],
  );

  const recentClips: RecentClip[] = useMemo(() => {
    const clips: RecentClip[] = [];
    recentJobs.forEach((job: Job) => {
      if (job.videoUrl) {
        clips.push({
          id: job.id,
          url: job.videoUrl,
          createdAt: job.createdAt,
          platform: job.platform ?? (job.options?.platformFocus as string | undefined),
          language: job.language ?? (job.options?.scriptLanguage as string | undefined),
          vibe: job.options?.vibe as string | undefined,
        });
      }
    });
    return clips.slice(0, 20);
  }, [recentJobs]);

  const handleFileSelection = (file: File | null) => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setIsDragging(false);
    if (!file) {
      setSelectedFile(null);
      setSelectedFileName('');
      setFilePreview(null);
      return;
    }
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setFilePreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleFileSelection(file);
    event.target.value = '';
  };

  if (isOwner) {
    return (
      <section className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 text-slate-200">
        Owners cannot launch video jobs. Impersonate a tenant first.
      </section>
    );
  }

  const onSubmit = async (values: FormValues) => {
    if (!selectedFile) {
      setError('Please upload a reference image first');
      return;
    }
    if (!values.productName.trim()) {
      setError('Please add the product name so we can script around it.');
      return;
    }
    if (creationBlocked) {
      setError(creationBlockedReason ?? 'Video creation is currently disabled.');
      return;
    }
    setOutputs([]);
    setError(null);
    setStatus('running');

    try {
      const uploadForm = new FormData();
      uploadForm.append('image', selectedFile);
      const uploadResponse = await api.post('/ugc/uploads/hero', uploadForm, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const imageUrl = uploadResponse.data?.imageUrl as string | undefined;
      if (!imageUrl) {
        throw new Error('Image upload failed');
      }

      const payload = {
        imageUrl,
        productName: values.productName,
        prompt: values.creativeBrief,
        language: values.scriptLanguage,
        gender: values.creatorGender,
        ageRange: values.creatorAgeRange,
        platform: values.platformFocus,
        voiceProfile: values.voiceProfile,
        cta: values.callToAction === 'none' ? undefined : values.callToAction,
      };

      const { data } = await api.post('/ugc/jobs', payload);
      reset();
      handleFileSelection(null);
      setStatus('done');
      navigate(`/jobs${data?.jobId ? `?jobId=${data.jobId}` : ''}`);
    } catch (err: unknown) {
      const fallback = 'Failed to create job';
      const responseData = axios.isAxiosError(err) ? err.response?.data ?? null : null;
      const code = responseData?.code ?? responseData?.error;
      const codeMap: Record<string, string> = {
        tenant_pending: 'Your account is pending activation. Please wait for our team to unlock it.',
        tenant_suspended: 'Your account is suspended. Contact support to resolve billing or policy issues.',
        plan_missing: 'Your plan is not active yet. Reach out to support to activate billing.',
        quota_exceeded: 'You have reached your monthly limit. Request an upgrade to continue.',
        billing_period_ended: 'Your billing period has ended. Renew or update your plan to keep generating videos.',
      };
      if (code && codeMap[code]) {
        setError(codeMap[code]);
      } else if (axios.isAxiosError(err) && err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        const message =
          (responseData?.message as string | undefined) ??
          (responseData?.error as string | undefined) ??
          (err instanceof Error ? err.message : fallback);
        setError(message);
      }
      if (code === 'quota_exceeded') {
        await refetchUsage();
      }
      setStatus('idle');
    }
  };

  const remainingVideos = usage && !isUnlimited && planLimit !== null ? Math.max(planLimit - usage.used, 0) : null;
  const planPending = !!usage && !isUnlimited && planLimit === null;
  const waitingForUsage = !usage && usageLoading;
  const quotaUnavailable = !usage && usageError;
  const outOfCredits = !isUnlimited && !!usage && remainingVideos !== null && remainingVideos <= 0;
  const disabled =
    creationBlocked || planPending || outOfCredits || quotaUnavailable || waitingForUsage || billingExpired || status === 'running';
  const selectedCount = watch('videoCount');
  const selectedCallToAction = watch('callToAction');
  const pipelineStatusLabel = status === 'running' ? 'Rendering' : status === 'done' ? 'Completed' : 'Ready';

  return (
    <section className="space-y-8 text-slate-100">
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-800 p-6 shadow-xl md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">UGC Video Generator</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Generate UGC videos from a single product image</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200">
              Upload one photo, choose language and platform, then generate multiple variations—ready for TikTok, Reels, and Shorts.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-300">Pipeline</p>
            <p className="text-2xl font-semibold text-white">
              {status === 'running' ? 'Rendering...' : status === 'done' ? 'Completed' : 'Idle'}
            </p>
            <p className="text-xs text-slate-300">{outputs.length} clips ready</p>
            {selectedFileName && <p className="mt-1 text-xs text-slate-400">Input: {selectedFileName}</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Plan</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {usage
              ? isUnlimited
                ? `${usage.plan?.name ?? tenant?.planName ?? usage.plan?.code ?? 'Plan'} · Unlimited videos/month`
                : formatPlanSummary(
                    usage.plan?.code,
                    usage.plan?.name ?? tenant?.planName ?? null,
                    usage.plan?.monthly_limit ?? tenant?.monthlyVideoLimit ?? null,
                  )
              : '—'}
          </p>
          {isUnlimited ? (
            <p className="text-xs text-slate-400">Unlimited videos (owner override)</p>
          ) : planLimit !== null ? (
            <p className="text-xs text-slate-400">
              {planLimit} videos / month{bonusCredits ? ` (includes ${bonusCredits} bonus)` : ''}
            </p>
          ) : null}
          <p className="text-xs text-slate-400">Renews on {renewalLabel ?? '—'}</p>
        </div>
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Used</p>
          <p className="mt-2 text-2xl font-semibold text-white">{usage ? usage.used : '—'}</p>
        </div>
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Remaining</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {isUnlimited
              ? '∞'
              : remainingVideos !== null
              ? remainingVideos
              : planPending
              ? 'Plan pending'
              : waitingForUsage
              ? 'Loading'
              : '—'}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div>
      )}
      {creationBlockedReason && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            tenantState === 'suspended'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-100'
              : 'border-amber-400/40 bg-amber-500/10 text-amber-100'
          }`}
        >
          {creationBlockedReason}
        </div>
      )}
      {quotaUnavailable && (
        <div className="rounded-2xl border border-slate-400/40 bg-slate-500/10 px-4 py-3 text-sm text-slate-100">
          We could not load your quota snapshot. Refresh this page or contact support before launching more jobs.
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Step 1</p>
              <h2 className="text-xl font-semibold text-white">Upload your product image</h2>
              <p className="text-sm text-slate-400">PNG/JPG up to 10MB. Solid backgrounds work best.</p>
            </div>
            {selectedFileName && (
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-slate-200">
                {selectedFileName}
              </span>
            )}
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Product name
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2"
              placeholder="Example: Aurora night serum"
              {...register('productName')}
            />
          </label>
          <div
            className={clsx(
              'mt-4 relative flex min-h-[18rem] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed text-center transition',
              isDragging
                ? 'border-indigo-400/80 bg-indigo-500/10 shadow-inner shadow-indigo-500/20'
                : 'border-white/20 bg-slate-950/60',
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0] ?? null;
              handleFileSelection(file);
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[26px] bg-[radial-gradient(circle_at_1px,_rgba(148,163,184,0.12)_1px,_transparent_0)] bg-[length:18px_18px] opacity-40"
              aria-hidden
            />
            {filePreview ? (
              <>
                <img
                  src={filePreview}
                  alt="Selected preview"
                  className="relative z-10 max-h-[360px] w-full object-contain py-5"
                />
                <button
                  type="button"
                  className="absolute right-4 top-4 z-20 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-slate-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleFileSelection(null);
                  }}
                >
                  Clear
                </button>
              </>
            ) : (
              <div className="relative z-10 px-8 text-slate-300">
                <p className="text-base font-semibold text-white">Drag & drop or click to browse</p>
                <p className="mt-2 text-sm">
                  We preserve your aspect ratio and prep the image for generation.
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Narrative DNA</h3>
              <p className="text-sm text-slate-400">Customize language, platform, voice profile, vibe, creator, and CTA.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Script language
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('scriptLanguage')}>
                    {LANGUAGES.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Choose the language for the spoken script. English (US) and English (UK) are separate options.
                  </p>
                </label>
                <label className="text-sm text-slate-300">
                  Platform focus
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('platformFocus')}>
                    {platforms.map((platform) => (
                      <option key={platform.value} value={platform.value}>
                        {platform.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Vibe
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('vibe')}>
                    {vibes.map((vibe) => (
                      <option key={vibe.value} value={vibe.value}>
                        {vibe.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Voice profile
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('voiceProfile')}>
                    {voiceProfiles.map((profile) => (
                      <option key={profile.value} value={profile.value}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Creator gender
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('creatorGender')}>
                    {creatorGenders.map((gender) => (
                      <option key={gender.value} value={gender.value}>
                        {gender.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-300">
                  Age range
                  <select className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2" {...register('creatorAgeRange')}>
                    {creatorAgeRanges.map((range) => (
                      <option key={range.value} value={range.value}>
                        {range.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>CTA emphasis</span>
                  <span className="text-xs text-slate-500">
                    {selectedCallToAction === 'none' ? 'Optional' : 'Applied'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {callsToAction.map((cta) => (
                    <button
                      type="button"
                      key={cta.value}
                      className={clsx(
                        'rounded-full border px-4 py-1 text-xs font-semibold transition',
                        selectedCallToAction === cta.value
                          ? 'border-indigo-400 bg-indigo-500/20 text-white'
                          : 'border-white/15 text-slate-300 hover:border-indigo-400/40',
                      )}
                      onClick={() => setValue('callToAction', cta.value)}
                    >
                      {cta.label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Selecting “None” keeps the script neutral.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-white">Creative brief & directives</h3>
                  <p className="text-sm text-slate-400">
                    Keep every cue—hooks, transitions, props, CTA emphasis—in one field.
                  </p>
                </div>
                <span className="rounded-full border border-indigo-400/30 px-3 py-1 text-xs text-indigo-200">Optional</span>
              </div>
              <label className="mt-4 block text-sm text-slate-300">
                Narrative brief
                <textarea
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/40 px-3 py-2"
                  placeholder="e.g. Creator unboxes, highlights 3 benefits, closes with direct look + CTA badge"
                  {...register('creativeBrief')}
                />
              </label>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Output batching</h3>
              <p className="text-sm text-slate-400">Each generated video counts toward your monthly quota.</p>
              <p className="mt-2 text-xs text-slate-500">
                Your plan determines how many recent videos stay visible in your dashboard (Starter 10 / Growth 20 / Scale 30).
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {[1, 2, 3, 4, 5].map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={clsx(
                      'w-12 rounded-2xl border px-0 py-2 text-sm font-semibold',
                      selectedCount === count
                        ? 'border-indigo-400 bg-indigo-500/30 text-white'
                        : 'border-white/10 text-slate-400 hover:border-indigo-400/40',
                    )}
                    onClick={() => setValue('videoCount', count)}
                  >
                    {count}x
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-5 text-center backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Generate video</h3>
              <p className="mt-2 text-sm text-slate-400">
                Video generation can take up to 10 minutes per clip. Feel free to navigate—jobs continue server-side.
              </p>
              <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-left text-xs text-slate-400">
                <p className="flex items-center justify-between text-sm text-slate-200">
                  <span>Status</span>
                  <span>{pipelineStatusLabel}</span>
                </p>
                <p className="mt-2">Clips ready: {outputs.length}</p>
                {selectedFileName && (
                  <p className="mt-1 truncate text-[11px] text-slate-500">Input: {selectedFileName}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={disabled}
                className="mt-4 w-full rounded-2xl bg-indigo-500 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
              >
                {status === 'running' ? 'Synthesizing...' : 'Generate video'}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                {isUnlimited
                  ? 'Unlimited quota is enabled for this workspace.'
                  : remainingVideos !== null
                  ? `${remainingVideos} of ${planLimit} videos left this cycle.`
                  : planPending
                  ? 'Plan assignment pending.'
                  : quotaUnavailable
                  ? 'Quota status unavailable—refresh required.'
                  : 'We refresh your quota automatically.'}
              </p>
            </div>
          </div>
        </div>
      </form>

      {outputs.length > 0 && (
        <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Fresh outputs</h2>
            <span className="text-xs uppercase tracking-widest text-slate-400">{outputs.length} clips</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {outputs.map((output) => (
              <a
                key={output.url}
                href={output.url}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-2xl border border-white/10"
              >
                <video
                  src={output.url}
                  className="aspect-[9/16] w-full object-cover transition group-hover:scale-[1.01]"
                  playsInline
                  muted
                  loop
                  controls
                />
                <div className="border-t border-white/10 px-3 py-2 text-xs text-slate-300">
                  {output.type ?? 'UGC clip'} • {output.size ?? 'vertical'}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">Latest 20 videos</h2>
          <p className="text-xs uppercase tracking-widest text-slate-400">Auto-pruned • newest first</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {recentClips.map((clip) => (
            <div key={clip.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
              <video src={clip.url} className="aspect-[9/16] w-full object-cover" playsInline muted loop controls />
              <div className="px-3 py-3 text-xs text-slate-300">
                <p className="font-semibold text-white">{clip.platform ?? 'multi-platform'}</p>
                <p className="text-slate-400">{clip.vibe ?? 'UGC'} • {clip.language ?? 'multi-lang'}</p>
                <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
                  {new Date(clip.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {recentClips.length === 0 && <p className="text-sm text-slate-400">Run your first job to populate this rail.</p>}
        </div>
      </div>
    </section>
  );
};

export default NewVideoPage;
