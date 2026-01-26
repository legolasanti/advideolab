import axios from 'axios';
import { JobStatus, Prisma } from '@prisma/client';
import crypto from 'crypto';
import http from 'node:http';
import https from 'node:https';
import { Transform, type Readable } from 'node:stream';
import { prisma } from '../lib/prisma';
import { uploadBuffer, uploadStream, generateAssetKey } from '../lib/s3';
import { sanitizeImage } from './imageProcessing';
import { validateUpload } from '../utils/fileValidation';
import { triggerWorkflow } from './n8n';
import { env } from '../config/env';
import { TenantWithPlan, reserveTenantQuota, releaseReservedTenantQuota } from './quota';
import { decrypt } from '../lib/crypto';
import { resolveSafeExternalTarget, UnsafeExternalUrlError } from '../utils/safeUrl';
export { UnsafeExternalUrlError } from '../utils/safeUrl';

const MAX_TENANT_JOBS = 20;
const MAX_EXTERNAL_OUTPUT_BYTES = 250 * 1024 * 1024;
const OUTPUT_HOST_ALLOWLIST = (env.outputDownloadHostAllowlist ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
  .filter(Boolean);
const N8N_HOST_ALLOWLIST = (env.n8nHostAllowlist ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
  .filter(Boolean);
const N8N_TRUSTED_HOST_ALLOWLIST = (env.n8nTrustedHostAllowlist ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
  .filter(Boolean);

export class WorkflowConfigurationError extends Error {
  code = 'workflow_not_configured';

  constructor(message = 'Workflow configuration missing for this tenant.') {
    super(message);
  }
}

type VideoJobOptions = {
  scriptLanguage: string;
  platformFocus: string;
  vibe: string;
  voiceProfile: string;
  callToAction?: string;
  videoCount: number;
  creativeBrief?: string;
  creatorGender: string;
  creatorAgeRange: string;
};

type StoredVideoJobOptions = VideoJobOptions & {
  callbackTokenHash: string;
  callbackToken?: string;
  quotaReservation?: {
    reservedVideos: number;
    reservedAt: string;
  };
};

export class ExternalAssetTooLargeError extends Error {
  code = 'external_asset_too_large';
}

const hashCallbackToken = (token: Buffer) => crypto.createHash('sha256').update(token).digest('hex');

const normalizeWorkflowOutputs = (value: unknown): ExternalOutput[] | null => {
  if (!Array.isArray(value)) return null;
  if (value.length === 0 || value.length > 5) return null;
  const normalized: ExternalOutput[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const rawUrl = record.url;
    if (typeof rawUrl !== 'string') return null;
    const url = rawUrl.trim();
    if (url.length === 0 || url.length > 2048) return null;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (_err) {
      return null;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;

    const entry: ExternalOutput = { url };

    const rawType = record.type;
    if (rawType != null) {
      if (typeof rawType !== 'string') return null;
      const type = rawType.trim();
      if (type.length > 128) return null;
      if (type.length > 0) entry.type = type;
    }

    const rawSize = record.size;
    if (rawSize != null) {
      if (typeof rawSize === 'number') {
        if (!Number.isFinite(rawSize) || rawSize < 0) return null;
        entry.size = rawSize;
      } else if (typeof rawSize === 'string') {
        const parsed = Number(rawSize);
        if (!Number.isFinite(parsed) || parsed < 0) return null;
        entry.size = parsed;
      } else {
        return null;
      }
    }

    const rawThumbnailUrl = record.thumbnailUrl;
    if (rawThumbnailUrl != null) {
      if (typeof rawThumbnailUrl !== 'string') return null;
      const thumbnailUrl = rawThumbnailUrl.trim();
      if (thumbnailUrl.length > 2048) return null;
      try {
        const parsedThumb = new URL(thumbnailUrl);
        if (parsedThumb.protocol !== 'http:' && parsedThumb.protocol !== 'https:') return null;
      } catch (_err) {
        return null;
      }
      entry.thumbnailUrl = thumbnailUrl;
    }

    const rawDurationSeconds = record.durationSeconds;
    if (rawDurationSeconds != null) {
      if (typeof rawDurationSeconds === 'number') {
        if (!Number.isFinite(rawDurationSeconds) || rawDurationSeconds < 0) return null;
        entry.durationSeconds = rawDurationSeconds;
      } else if (typeof rawDurationSeconds === 'string') {
        const parsed = Number(rawDurationSeconds);
        if (!Number.isFinite(parsed) || parsed < 0) return null;
        entry.durationSeconds = parsed;
      } else {
        return null;
      }
    }

    normalized.push(entry);
  }
  return normalized;
};

export const createJob = async (params: {
  tenant: TenantWithPlan;
  file: Express.Multer.File;
  options: VideoJobOptions;
  initiatingUserEmail: string;
  tenantContactEmail: string;
}) => {
  if (!params.tenant.n8nBaseUrl || !params.tenant.n8nProcessPath) {
    throw new WorkflowConfigurationError();
  }
  const n8nBaseUrl = params.tenant.n8nBaseUrl!;
  const n8nProcessPath = params.tenant.n8nProcessPath!;
  if (!n8nProcessPath.startsWith('/')) {
    throw new WorkflowConfigurationError('n8n process path must start with "/"');
  }
  const resolvedN8nUrl = new URL(n8nProcessPath, n8nBaseUrl).toString();
  let n8nTarget;
  try {
    n8nTarget = await resolveSafeExternalTarget(resolvedN8nUrl, {
      allowHttp: !env.isProd,
      allowedHostnames: N8N_HOST_ALLOWLIST,
      isProd: env.isProd,
    });
  } catch (err: any) {
    throw new WorkflowConfigurationError(err?.message ?? 'Invalid n8n URL');
  }
  const allowCloudinarySecrets = (() => {
    if (!env.useCloudinary) return false;
    if (N8N_TRUSTED_HOST_ALLOWLIST.length === 0) return false;
    return N8N_TRUSTED_HOST_ALLOWLIST.some((pattern) => {
      const normalized = pattern.trim().toLowerCase().replace(/\.$/, '');
      const hostname = n8nTarget.url.hostname.trim().toLowerCase().replace(/\.$/, '');
      if (normalized.startsWith('*.')) {
        const suffix = normalized.slice(2);
        return hostname === suffix || hostname.endsWith(`.${suffix}`);
      }
      return hostname === normalized;
    });
  })();
  validateUpload(params.file);

  const sanitized = await sanitizeImage(params.file);
  const callbackTokenBytes = crypto.randomBytes(32);
  const callbackToken = callbackTokenBytes.toString('hex');
  const callbackTokenHash = hashCallbackToken(callbackTokenBytes);

  const { job } = await prisma.$transaction(async (trx: Prisma.TransactionClient) => {
    const reservation = await reserveTenantQuota(trx, params.tenant, params.options.videoCount);
    const storedOptions: StoredVideoJobOptions = {
      ...params.options,
      callbackTokenHash,
      quotaReservation: reservation.reservedVideos > 0 ? reservation : undefined,
    };
    const job = await trx.job.create({
      data: {
        tenantId: params.tenant.id,
        status: JobStatus.pending,
        options: storedOptions,
      },
    });
    return { job };
  });

  try {
    const inputKey = generateAssetKey(params.tenant.id, 'input', job.id, sanitized.ext);
    const inputUrl = await uploadBuffer(sanitized.buffer, inputKey, params.file.mimetype);
    const thumbKey = generateAssetKey(params.tenant.id, 'input', `${job.id}-thumb`, 'jpg');
    const thumbUrl = await uploadBuffer(sanitized.thumbnail, thumbKey, 'image/jpeg');

    const asset = await prisma.asset.create({
      data: {
        tenantId: params.tenant.id,
        jobId: job.id,
        type: 'input',
        url: inputUrl,
        meta: {
          thumbnailUrl: thumbUrl,
        },
      },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { inputAssetId: asset.id, status: JobStatus.running },
    });

    const webhookBase = env.API_PUBLIC_URL.replace(/\/$/, '');
    const callbackUrl = `${webhookBase}/api/videos/jobs/${job.id}/callback`;
    const apiKeys = await prisma.apiKey.findMany({ where: { tenantId: params.tenant.id } });
    const decryptedKeys = Object.fromEntries(
      apiKeys.map((key) => [key.provider, decrypt(key.keyEncrypted)] as const),
    );

    const lookup = (
      _hostname: string,
      _opts: any,
      cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
    ) => {
      cb(null, n8nTarget.address, n8nTarget.family);
    };
    const httpAgent = new http.Agent({ keepAlive: false, lookup });
    const httpsAgent = new https.Agent({ keepAlive: false, lookup });

    const result = await triggerWorkflow(n8nTarget.url.toString(), {
      file: sanitized.buffer,
      fileName: params.file.originalname,
      mimeType: params.file.mimetype,
      jobId: job.id,
      tenantId: params.tenant.id,
      tenantName: params.tenant.name,
      tenantEmail: params.tenantContactEmail,
      createdByEmail: params.initiatingUserEmail,
      webhookBase,
      scriptLanguage: params.options.scriptLanguage,
      platformFocus: params.options.platformFocus,
      vibe: params.options.vibe,
      voiceProfile: params.options.voiceProfile,
      callToAction: params.options.callToAction,
      videoCount: params.options.videoCount,
      creativeBrief: params.options.creativeBrief,
      creatorGender: params.options.creatorGender,
      creatorAgeRange: params.options.creatorAgeRange,
      callbackUrl,
      callbackToken,
      apiKeyPayload: decryptedKeys,
      inputAssets: { imageUrl: inputUrl, thumbnailUrl: thumbUrl },
      composition: {
        useCloudinary: env.useCloudinary,
        composeServiceUrl: env.COMPOSE_SERVICE_URL,
        composeInternalToken: env.composeInternalToken,
        cloudinary: allowCloudinarySecrets
          ? {
              cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
              apiKey: env.CLOUDINARY_API_KEY ?? '',
              apiSecret: env.CLOUDINARY_API_SECRET ?? '',
            }
          : undefined,
      },
    }, { httpAgent, httpsAgent });

    if (result.immediateOutputs) {
      const outputs = normalizeWorkflowOutputs(result.immediateOutputs);
      if (!outputs) {
        await markJobError(job.id, params.tenant.id, 'n8n returned invalid outputs');
        return { jobId: job.id };
      }
      const claimed = await prisma.job.updateMany({
        where: {
          id: job.id,
          finishedAt: null,
          status: { in: [JobStatus.pending, JobStatus.running] },
        },
        data: { status: JobStatus.processing },
      });
      if (claimed.count === 0) {
        return { jobId: job.id };
      }

      let storedOutputs;
      try {
        storedOutputs = await persistOutputsToStorage(params.tenant.id, job.id, outputs);
      } catch (err: any) {
        console.error('[n8n-sync] failed to persist outputs', err);
        if (err instanceof UnsafeExternalUrlError || err instanceof ExternalAssetTooLargeError) {
          await markJobError(job.id, params.tenant.id, err.message || 'Invalid output URL');
          return { jobId: job.id };
        }
        await prisma.job.updateMany({
          where: { id: job.id, status: JobStatus.processing, finishedAt: null },
          data: { status: JobStatus.running },
        });
        throw err;
      }

      try {
        await completeJobWithOutputs(job.id, params.tenant.id, storedOutputs, params.options.videoCount);
        return { jobId: job.id, outputs: storedOutputs };
      } catch (err) {
        console.error('[n8n-sync] failed to finalize job', err);
        await prisma.job.updateMany({
          where: { id: job.id, status: JobStatus.processing, finishedAt: null },
          data: { status: JobStatus.running },
        });
        throw err;
      }
    }

    return { jobId: job.id };
  } catch (err: any) {
    const message =
      err?.response?.data?.message ??
      err?.response?.data?.error ??
      err?.message ??
      'job_create_failed';
    await markJobError(job.id, params.tenant.id, message);
    throw err;
  }
};

type ExternalOutput = {
  url: string;
  type?: string;
  size?: number | string;
  thumbnailUrl?: string | null;
  durationSeconds?: number | string;
};

type OutputAsset = ExternalOutput & {
  originalUrl?: string;
};

const DEFAULT_OUTPUT_CONTENT_TYPE = 'video/mp4';
const ALLOWED_OUTPUT_CONTENT_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const redactExternalUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (_err) {
    return value.split('?')[0];
  }
};

const normalizeOutputContentType = (raw?: string | null) => {
  const cleaned = (raw ?? '').split(';')[0]?.trim().toLowerCase();
  if (!cleaned) return DEFAULT_OUTPUT_CONTENT_TYPE;
  if (ALLOWED_OUTPUT_CONTENT_TYPES.has(cleaned)) return cleaned;
  return DEFAULT_OUTPUT_CONTENT_TYPE;
};

const determineOutputExtension = (contentType?: string) => {
  const normalizedType = normalizeOutputContentType(contentType);
  if (normalizedType === 'video/mp4') return 'mp4';
  if (normalizedType === 'video/webm') return 'webm';
  if (normalizedType === 'video/quicktime') return 'mov';
  return 'mp4';
};

const sanitizeMetadataUrl = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return redactExternalUrl(value);
  } catch (_err) {
    return undefined;
  }
};

const normalizeFiniteNonnegative = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
};

type DownloadedExternalAsset = {
  stream: Readable;
  contentType?: string;
  size?: number;
};

const downloadExternalAsset = async (url: string): Promise<DownloadedExternalAsset> => {
  const target = await resolveSafeExternalTarget(url, {
    allowHttp: !env.isProd,
    allowedHostnames: OUTPUT_HOST_ALLOWLIST,
    isProd: env.isProd,
  });
  const lookup = (
    _hostname: string,
    _opts: any,
    cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    cb(null, target.address, target.family);
  };
  const httpAgent = new http.Agent({ keepAlive: false, lookup });
  const httpsAgent = new https.Agent({ keepAlive: false, lookup });

  const response = await axios.get<NodeJS.ReadableStream>(target.url.toString(), {
    responseType: 'stream',
    timeout: 180_000,
    maxRedirects: 0,
    maxContentLength: MAX_EXTERNAL_OUTPUT_BYTES,
    maxBodyLength: MAX_EXTERNAL_OUTPUT_BYTES,
    proxy: false,
    httpAgent,
    httpsAgent,
    headers: {
      'Accept-Encoding': 'identity',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });
  const stream = response.data as unknown as Readable;
  const contentTypeHeader = response.headers['content-type'];
  const lengthHeader = response.headers['content-length'];
  const parsedLength =
    typeof lengthHeader === 'string'
      ? Number(lengthHeader)
      : Array.isArray(lengthHeader)
      ? Number(lengthHeader[0])
      : undefined;
  if (Number.isFinite(parsedLength) && Number(parsedLength) > MAX_EXTERNAL_OUTPUT_BYTES) {
    if (typeof stream.destroy === 'function') {
      stream.destroy();
    }
    throw new ExternalAssetTooLargeError(`Output asset exceeds ${MAX_EXTERNAL_OUTPUT_BYTES} bytes`);
  }
  return {
    stream,
    contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : undefined,
    size: Number.isFinite(parsedLength) ? Number(parsedLength) : undefined,
  };
};

const createMaxBytesTransform = (maxBytes: number) => {
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const length = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      bytes += length;
      if (bytes > maxBytes) {
        callback(new ExternalAssetTooLargeError(`Output asset exceeds ${maxBytes} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
  return { limiter, getBytes: () => bytes };
};

export const persistOutputsToStorage = async (
  tenantId: string,
  jobId: string,
  outputs: ExternalOutput[],
): Promise<OutputAsset[]> => {
  const stored: OutputAsset[] = [];
  for (let index = 0; index < outputs.length; index += 1) {
    const payload = outputs[index];
    const originalUrl = payload.url;
    const download = await downloadExternalAsset(originalUrl);
    const contentType = normalizeOutputContentType(download.contentType ?? payload.type ?? DEFAULT_OUTPUT_CONTENT_TYPE);
    const ext = determineOutputExtension(contentType);
    const key = generateAssetKey(tenantId, 'output', `${jobId}-${index}`, ext);

    const source = download.stream;
    const { limiter, getBytes } = createMaxBytesTransform(MAX_EXTERNAL_OUTPUT_BYTES);
    source.on('error', (err) => {
      limiter.destroy(err);
    });
    limiter.on('error', (err) => {
      if (typeof source.destroy === 'function') {
        source.destroy(err);
      }
    });
    source.pipe(limiter);
    let uploadedUrl: string;
    try {
      uploadedUrl = await uploadStream(limiter, key, contentType, download.size);
    } catch (err) {
      if (typeof source.destroy === 'function') {
        source.destroy(err as NodeJS.ErrnoException);
      }
      throw err;
    }
    const size = getBytes();

    stored.push({
      url: uploadedUrl,
      type: contentType,
      size,
      thumbnailUrl: sanitizeMetadataUrl(payload.thumbnailUrl),
      durationSeconds: normalizeFiniteNonnegative(payload.durationSeconds),
      originalUrl: redactExternalUrl(originalUrl),
    });
  }
  return stored;
};

export const completeJobWithOutputs = async (
  jobId: string,
  tenantId: string,
  outputs: OutputAsset[],
  usageIncrementBy?: number,
) => {
  await prisma.$transaction(async (trx: Prisma.TransactionClient) => {
    const existingJob = await trx.job.findUnique({ where: { id: jobId } });
    await Promise.all(
      outputs.map((output) =>
        trx.asset.create({
          data: {
            tenantId,
            jobId,
            type: 'output',
            url: output.url,
            meta: {
              type: output.type,
              size: output.size,
              thumbnailUrl: output.thumbnailUrl,
              durationSeconds: output.durationSeconds,
              originalUrl: output.originalUrl,
            },
          },
        }),
      ),
    );

    const baseOptions =
      existingJob && typeof existingJob.options === 'object' && !Array.isArray(existingJob.options)
        ? (existingJob.options as Prisma.JsonObject)
        : ({} as Prisma.JsonObject);
    const mergedOptions: Prisma.JsonObject = { ...baseOptions };
    await trx.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.done,
        outputs,
        finishedAt: new Date(),
        cost: 1,
        options: mergedOptions,
      },
    });

    const reservation = (() => {
      const options = existingJob?.options;
      if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
      const record = options as Record<string, unknown>;
      const entry = record.quotaReservation;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const reservedVideos = (entry as { reservedVideos?: unknown }).reservedVideos;
      return typeof reservedVideos === 'number' && Number.isFinite(reservedVideos) && reservedVideos > 0
        ? Math.trunc(reservedVideos)
        : null;
    })();

    const shouldIncrementUsage =
      typeof usageIncrementBy === 'number' &&
      Number.isFinite(usageIncrementBy) &&
      usageIncrementBy > 0 &&
      reservation == null;

    if (shouldIncrementUsage) {
      await trx.tenant.update({
        where: { id: tenantId },
        data: { videosUsedThisCycle: { increment: Math.trunc(usageIncrementBy) } },
      });
    }
  });
  await pruneTenantJobs(tenantId, MAX_TENANT_JOBS);
};

export const markJobError = async (jobId: string, tenantId: string, error: string) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { options: true },
  });
  const reservation = (() => {
    const options = job?.options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    const record = options as Record<string, unknown>;
    const entry = record.quotaReservation;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const reservedVideos = (entry as { reservedVideos?: unknown }).reservedVideos;
    return typeof reservedVideos === 'number' && Number.isFinite(reservedVideos) && reservedVideos > 0
      ? Math.trunc(reservedVideos)
      : null;
  })();

  const updated = await prisma.job.updateMany({
    where: {
      id: jobId,
      finishedAt: null,
      status: { in: [JobStatus.pending, JobStatus.running, JobStatus.processing] },
    },
    data: {
      status: JobStatus.error,
      error: error.slice(0, 2000),
      finishedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    return;
  }
  if (reservation != null) {
    await releaseReservedTenantQuota(tenantId, reservation);
  }
  await pruneTenantJobs(tenantId, MAX_TENANT_JOBS);
};

export const pruneTenantJobs = async (tenantId: string, maxJobs: number) => {
  const jobsToDelete = await prisma.job.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    skip: maxJobs,
    select: { id: true },
  });
  if (jobsToDelete.length === 0) {
    return;
  }
  const jobIds = jobsToDelete.map((job) => job.id);
  await prisma.asset.deleteMany({
    where: { jobId: { in: jobIds } },
  });
  await prisma.job.deleteMany({
    where: { id: { in: jobIds } },
  });
};
