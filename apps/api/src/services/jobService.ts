import axios from 'axios';
import { JobStatus, Prisma } from '@prisma/client';
import crypto from 'crypto';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { prisma } from '../lib/prisma';
import { uploadBuffer, generateAssetKey } from '../lib/s3';
import { sanitizeImage } from './imageProcessing';
import { validateUpload } from '../utils/fileValidation';
import { triggerWorkflow } from './n8n';
import { env } from '../config/env';
import { TenantWithPlan } from './quota';
import { decrypt } from '../lib/crypto';

const MAX_TENANT_JOBS = 20;
const MAX_EXTERNAL_OUTPUT_BYTES = 250 * 1024 * 1024;

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
};

export class UnsafeExternalUrlError extends Error {
  code = 'unsafe_external_url';
}

export class ExternalAssetTooLargeError extends Error {
  code = 'external_asset_too_large';
}

const hashCallbackToken = (token: Buffer) => crypto.createHash('sha256').update(token).digest('hex');

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // "this host on this network"
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved

  return false;
};

const isPrivateIp = (ip: string) => {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family !== 6) return true;

  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;

  if (normalized.startsWith('::ffff:')) {
    const maybeIpv4 = normalized.slice('::ffff:'.length);
    if (net.isIP(maybeIpv4) === 4) return isPrivateIpv4(maybeIpv4);
  }

  const firstHextet = normalized.split(':')[0] ?? '';
  if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) return true; // fc00::/7

  const firstFour = normalized.replace(':', '').slice(0, 4);
  if (firstFour.startsWith('fe8') || firstFour.startsWith('fe9') || firstFour.startsWith('fea') || firstFour.startsWith('feb')) {
    return true; // fe80::/10
  }

  if (normalized.startsWith('2001:db8:')) return true; // documentation

  return false;
};

type SafeExternalTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

const resolveSafeExternalTarget = async (rawUrl: string): Promise<SafeExternalTarget> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_err) {
    throw new UnsafeExternalUrlError('Invalid output URL');
  }

  if (parsed.protocol !== 'https:' && (env.isProd || parsed.protocol !== 'http:')) {
    throw new UnsafeExternalUrlError('Output URL must use http(s)');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeExternalUrlError('Output URL must not contain credentials');
  }

  if (env.isProd && parsed.port && parsed.port !== '443' && parsed.port !== '80') {
    throw new UnsafeExternalUrlError('Output URL port is not allowed');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeExternalUrlError('Output URL hostname is not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeExternalUrlError('Output URL must resolve to a public address');
    }
    return { url: parsed, address: hostname, family: net.isIP(hostname) as 4 | 6 };
  }

  let resolved;
  try {
    resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (_err) {
    throw new UnsafeExternalUrlError('Failed to resolve output URL');
  }

  if (resolved.length === 0) {
    throw new UnsafeExternalUrlError('Output URL did not resolve');
  }

  for (const record of resolved) {
    if (isPrivateIp(record.address)) {
      throw new UnsafeExternalUrlError('Output URL must resolve to a public address');
    }
  }

  const selected = resolved[0]!;
  return { url: parsed, address: selected.address, family: selected.family as 4 | 6 };
};

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
  validateUpload(params.file);

  const sanitized = await sanitizeImage(params.file);
  const callbackTokenBytes = crypto.randomBytes(32);
  const callbackToken = callbackTokenBytes.toString('hex');
  const storedOptions: StoredVideoJobOptions = {
    ...params.options,
    callbackTokenHash: hashCallbackToken(callbackTokenBytes),
  };
  const job = await prisma.job.create({
    data: {
      tenantId: params.tenant.id,
      status: JobStatus.pending,
      options: storedOptions,
    },
  });

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

  const n8nUrl = `${n8nBaseUrl}${n8nProcessPath}`;
  const result = await triggerWorkflow(n8nUrl, {
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
      cloudinary: env.useCloudinary
        ? {
            cloudName: env.CLOUDINARY_CLOUD_NAME ?? '',
            apiKey: env.CLOUDINARY_API_KEY ?? '',
            apiSecret: env.CLOUDINARY_API_SECRET ?? '',
          }
        : undefined,
    },
  });

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
    } catch (err) {
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

const downloadExternalAsset = async (url: string) => {
  const target = await resolveSafeExternalTarget(url);
  const lookup = (
    _hostname: string,
    _opts: any,
    cb: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
  ) => {
    cb(null, target.address, target.family);
  };
  const httpAgent = new http.Agent({ keepAlive: false, lookup });
  const httpsAgent = new https.Agent({ keepAlive: false, lookup });

  const response = await axios.get<ArrayBuffer>(target.url.toString(), {
    responseType: 'arraybuffer',
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
  const buffer = Buffer.from(response.data);
  if (buffer.length > MAX_EXTERNAL_OUTPUT_BYTES) {
    throw new ExternalAssetTooLargeError(`Output asset exceeds ${MAX_EXTERNAL_OUTPUT_BYTES} bytes`);
  }
  const contentTypeHeader = response.headers['content-type'];
  const lengthHeader = response.headers['content-length'];
  const parsedLength =
    typeof lengthHeader === 'string'
      ? Number(lengthHeader)
      : Array.isArray(lengthHeader)
      ? Number(lengthHeader[0])
      : undefined;
  if (Number.isFinite(parsedLength) && Number(parsedLength) > MAX_EXTERNAL_OUTPUT_BYTES) {
    throw new ExternalAssetTooLargeError(`Output asset exceeds ${MAX_EXTERNAL_OUTPUT_BYTES} bytes`);
  }
  return {
    buffer,
    contentType: typeof contentTypeHeader === 'string' ? contentTypeHeader : undefined,
    size: Number.isFinite(parsedLength) ? Number(parsedLength) : undefined,
  };
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
    const uploadedUrl = await uploadBuffer(download.buffer, key, contentType);
    const normalizedPayloadSize =
      typeof payload.size === 'number'
        ? payload.size
        : payload.size
        ? Number(payload.size)
        : undefined;
    const size = Number.isFinite(normalizedPayloadSize)
      ? Number(normalizedPayloadSize)
      : download.size ?? download.buffer.length;
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

    if (typeof usageIncrementBy === 'number' && Number.isFinite(usageIncrementBy) && usageIncrementBy > 0) {
      await trx.tenant.update({
        where: { id: tenantId },
        data: { videosUsedThisCycle: { increment: Math.trunc(usageIncrementBy) } },
      });
    }
  });
  await pruneTenantJobs(tenantId, MAX_TENANT_JOBS);
};

export const markJobError = async (jobId: string, tenantId: string, error: string) => {
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
