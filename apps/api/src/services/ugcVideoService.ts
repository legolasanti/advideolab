import axios from 'axios';
import { JobStatus } from '@prisma/client';
import crypto from 'crypto';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { prisma } from '../lib/prisma';
import { uploadBuffer, uploadStream } from '../lib/s3';
import { env } from '../config/env';
import { decrypt } from '../lib/crypto';
import { resolveSafeExternalTarget } from '../utils/safeUrl';
import {
  ensureTenantReadyForUsage,
  incrementUsageOnSuccess,
  reserveTenantQuota,
  releaseReservedTenantQuota,
} from './quota';
import type { QuotaReservation } from './quota';
import { sendJobCompletedEmail } from './email';

export type UgcJobPayload = {
  imageUrl: string;
  productName: string;
  prompt?: string | null;
  language: string;
  gender: string;
  ageRange: string;
  platform?: string | null;
  voiceProfile?: string | null;
  vibe?: string | null;
  videoCount?: number | null;
  cta?: string | null;
};

export const createUgcJob = async (params: {
  tenantId: string;
  tenantName?: string | null;
  userId?: string;
  payload: UgcJobPayload;
  skipQuota?: boolean;
}) => {
  const { tenantId, tenantName, userId, payload, skipQuota } = params;

  // Fetch global n8n configuration from SystemConfig
  const systemConfig = await prisma.systemConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!systemConfig?.n8nBaseUrl || !systemConfig?.n8nProcessPath) {
    throw new Error('n8n workflow not configured. Please contact the administrator to set up n8n integration.');
  }
  if (!systemConfig.n8nProcessPath.startsWith('/')) {
    throw new Error('n8n process path must start with "/"');
  }

  const webhookUrl = new URL(systemConfig.n8nProcessPath, systemConfig.n8nBaseUrl).toString();
  const allowlist = (env.n8nHostAllowlist ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  const n8nTarget = await resolveSafeExternalTarget(webhookUrl, {
    allowHttp: !env.isProd,
    allowedHostnames: allowlist,
    isProd: env.isProd,
  });
  const lookup = (
    _hostname: string,
    opts: { all?: boolean } | undefined,
    cb: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void,
  ) => {
    if (opts?.all) {
      cb(null, [{ address: n8nTarget.address, family: n8nTarget.family }]);
      return;
    }
    cb(null, n8nTarget.address, n8nTarget.family);
  };
  const httpAgent = new http.Agent({ keepAlive: false, lookup });
  const httpsAgent = new https.Agent({ keepAlive: false, lookup });

  // Fetch global API keys (encrypted JSON)
  let apiKeys: Record<string, string> = {};
  if (systemConfig.apiKeysEncrypted) {
    try {
      apiKeys = JSON.parse(decrypt(systemConfig.apiKeysEncrypted));
    } catch (error) {
      console.error('[ugc] Failed to decrypt API keys:', error);
    }
  }

  const bypassQuota = Boolean(skipQuota);
  if (bypassQuota) {
    const exists = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!exists) {
      throw new Error('Tenant not found');
    }
  }
  const tenantForQuota = bypassQuota ? null : await ensureTenantReadyForUsage(tenantId, 1);

  const callbackTokenBytes = crypto.randomBytes(32);
  const callbackToken = callbackTokenBytes.toString('hex');
  const callbackTokenHash = crypto.createHash('sha256').update(callbackTokenBytes).digest('hex');

  let reservedVideos = 0;
  const { job } = await prisma.$transaction(async (trx) => {
    let quotaReservation: QuotaReservation | null = null;
    if (tenantForQuota) {
      quotaReservation = await reserveTenantQuota(trx, tenantForQuota, 1);
      reservedVideos = quotaReservation.reservedVideos;
    }
    const options = {
      ...payload,
      callbackTokenHash,
      ...(bypassQuota ? { skipQuota: true } : {}),
      ...(quotaReservation && quotaReservation.reservedVideos > 0 ? { quotaReservation } : {}),
    };

    const job = await trx.job.create({
      data: {
        tenantId,
        userId,
        status: JobStatus.pending,
        options,
        productName: payload.productName,
        prompt: payload.prompt ?? null,
        language: payload.language,
        gender: payload.gender,
        ageRange: payload.ageRange,
        platform: payload.platform ?? null,
        voiceProfile: payload.voiceProfile ?? null,
        vibe: payload.vibe ?? null,
        videoCount: payload.videoCount ?? 1,
        cta: payload.cta ?? null,
        imageUrl: payload.imageUrl,
      },
    });

    return { job };
  });

  const callbackUrl = `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/ugc/jobs/${job.id}/upload-video`;

  try {
    await axios.post(
      n8nTarget.url.toString(),
      {
        jobId: job.id,
        tenantId,
        userId,
        tenantName,
        callbackUrl,
        callbackToken,
        apiKeys, // Pass global API keys to n8n workflow
        ...payload,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30_000,
        httpAgent,
        httpsAgent,
        proxy: false,
      },
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { status: JobStatus.processing },
    });

    return { jobId: job.id, status: 'processing' as const };
  } catch (err: any) {
    const message =
      err?.response?.data?.message ??
      err?.response?.data?.error ??
      err?.message ??
      'Failed to trigger video workflow';
    console.error('[ugc] Failed to trigger n8n webhook', message);
    await prisma.job
      .update({
        where: { id: job.id },
        data: {
          status: JobStatus.failed,
          errorMessage: message,
          finishedAt: new Date(),
        },
      })
      .catch((updateErr) => {
        console.error('[ugc] Failed to mark job failed', updateErr);
      });
    if (reservedVideos > 0) {
      await releaseReservedTenantQuota(tenantId, reservedVideos);
    }
    throw err;
  }
};

const normalizeDuration = (value?: string | number) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const extensionFromMime = (mime?: string) => {
  if (!mime) return 'mp4';
  const [, subtype] = mime.split('/');
  if (!subtype) return 'mp4';
  const cleaned = subtype.split('+')[0]?.replace(/[^a-z0-9]/gi, '');
  return cleaned || 'mp4';
};

export const completeUgcJobFromUpload = async (params: {
  jobId: string;
  file: Express.Multer.File;
  provider?: string | null;
  providerJobId?: string | null;
  durationSeconds?: string | number | null;
  metadata?: unknown;
}) => {
  const { jobId, file, provider, providerJobId, durationSeconds, metadata } = params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new Error('job_not_found');
  }

  if (!['pending', 'processing', 'running'].includes(job.status)) {
    throw new Error('job_not_in_processable_state');
  }

  const mimeType = file.mimetype || 'video/mp4';
  const ext = extensionFromMime(mimeType);
  const key = `ugc/jobs/${jobId}/output-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  const uploadedUrl = await (async () => {
    if (file.buffer && file.buffer.length > 0) {
      return await uploadBuffer(file.buffer, key, mimeType);
    }
    if (file.path) {
      const stream = fs.createReadStream(file.path);
      try {
        return await uploadStream(stream, key, mimeType, file.size);
      } finally {
        stream.destroy();
        await fs.promises.unlink(file.path).catch(() => undefined);
      }
    }
    throw new Error('missing_video_payload');
  })();

  const normalizedDuration = durationSeconds != null ? normalizeDuration(durationSeconds) : undefined;
  const metaData = {
    provider: job.provider ?? null,
    providerJobId: job.providerJobId ?? null,
    durationSeconds: job.durationSeconds ?? null,
  } as any;

  await prisma.$transaction([
    prisma.asset.create({
      data: {
        tenantId: job.tenantId,
        jobId: job.id,
        type: 'output',
        url: uploadedUrl,
        meta: metaData,
      },
    }),
    prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.completed,
        videoUrl: uploadedUrl,
        provider: provider ?? 'sora-2',
        providerJobId: providerJobId ?? null,
        durationSeconds: normalizedDuration ?? null,
        completedAt: new Date(),
        finishedAt: new Date(),
        outputs: [
          {
            url: uploadedUrl,
            durationSeconds: normalizedDuration,
            provider: provider ?? 'sora-2',
          },
        ],
        error: null,
        errorMessage: null,
      },
    }),
  ]);

  const reservation = (() => {
    const options = job?.options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    const entry = (options as Record<string, unknown>).quotaReservation;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const reservedVideos = (entry as { reservedVideos?: unknown }).reservedVideos;
    return typeof reservedVideos === 'number' && Number.isFinite(reservedVideos) && reservedVideos > 0
      ? Math.trunc(reservedVideos)
      : null;
  })();

  const skipQuota = (() => {
    if (!job?.options || typeof job.options !== 'object' || Array.isArray(job.options)) return false;
    const value = (job.options as Record<string, unknown>).skipQuota;
    return value === true;
  })();

  if (reservation == null && !skipQuota) {
    // Backwards compatibility: jobs created before quota reservations existed.
    await incrementUsageOnSuccess(job.tenantId, 1);
  }

  // Send completion email to user
  if (job.userId) {
    const user = await prisma.user.findUnique({
      where: { id: job.userId },
      select: { email: true },
    });
    if (user?.email) {
      const productName = job.productName || 'UGC Video';
      await sendJobCompletedEmail({
        email: user.email,
        productName,
        jobId: job.id,
        videoUrl: uploadedUrl,
      }).catch((err) => {
        console.error('[ugc] Failed to send completion email:', err);
      });
    }
  }

  return {
    jobId: job.id,
    status: 'completed',
    videoUrl: uploadedUrl,
  };
};

export const markUgcJobFailed = async (params: { jobId: string; errorMessage?: string | null }) => {
  const { jobId, errorMessage } = params;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, tenantId: true, status: true, finishedAt: true, options: true },
  });
  if (!job) {
    throw new Error('job_not_found');
  }

  const reservation = (() => {
    const options = job?.options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    const entry = (options as Record<string, unknown>).quotaReservation;
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
      status: { in: [JobStatus.pending, JobStatus.processing, JobStatus.running] },
    },
    data: {
      status: JobStatus.failed,
      errorMessage: (errorMessage ?? 'workflow_failed').slice(0, 2000),
      finishedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return { updated: false };
  }

  if (reservation != null) {
    await releaseReservedTenantQuota(job.tenantId, reservation);
  }

  return { updated: true };
};
