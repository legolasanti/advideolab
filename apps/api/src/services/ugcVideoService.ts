import axios from 'axios';
import { JobStatus } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { uploadBuffer } from '../lib/s3';
import { env } from '../config/env';
import { decrypt } from '../lib/crypto';
import {
  ensureTenantReadyForUsage,
  incrementUsageOnSuccess,
  reserveTenantQuota,
  releaseReservedTenantQuota,
} from './quota';
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
  cta?: string | null;
};

export const createUgcJob = async (params: {
  tenantId: string;
  tenantName?: string | null;
  userId?: string;
  payload: UgcJobPayload;
}) => {
  const { tenantId, tenantName, userId, payload } = params;

  // Fetch global n8n configuration from SystemConfig
  const systemConfig = await prisma.systemConfig.findUnique({
    where: { id: 'singleton' },
  });

  if (!systemConfig?.n8nBaseUrl || !systemConfig?.n8nProcessPath) {
    throw new Error('n8n workflow not configured. Please contact the administrator to set up n8n integration.');
  }

  const webhookUrl = `${systemConfig.n8nBaseUrl}${systemConfig.n8nProcessPath}`;

  // Fetch global API keys (encrypted JSON)
  let apiKeys: Record<string, string> = {};
  if (systemConfig.apiKeysEncrypted) {
    try {
      apiKeys = JSON.parse(decrypt(systemConfig.apiKeysEncrypted));
    } catch (error) {
      console.error('[ugc] Failed to decrypt API keys:', error);
    }
  }

  // Enforce quota before creating job
  const tenant = await ensureTenantReadyForUsage(tenantId, 1);

  const { job } = await prisma.$transaction(async (trx) => {
    const reservation = await reserveTenantQuota(trx, tenant, 1);
    const options = {
      ...payload,
      quotaReservation: reservation.reservedVideos > 0 ? reservation : undefined,
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
        cta: payload.cta ?? null,
        imageUrl: payload.imageUrl,
      },
    });

    return { job };
  });

  const callbackUrl = `${env.API_PUBLIC_URL.replace(/\/$/, '')}/api/ugc/jobs/${job.id}/upload-video`;

  // Get callback token (prefer global config, fallback to env)
  let callbackToken: string | null = null;
  try {
    callbackToken = systemConfig.n8nInternalToken ? decrypt(systemConfig.n8nInternalToken) : env.n8nInternalToken;
  } catch (decryptErr) {
    console.error('[ugc] Failed to decrypt internal token', decryptErr);
  }
  callbackToken = callbackToken?.trim() ?? null;

  if (!callbackToken || callbackToken.length < 32) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: JobStatus.failed,
        errorMessage: 'Internal token not configured',
        finishedAt: new Date(),
      },
    });
    await releaseReservedTenantQuota(tenantId, 1);
    throw new Error('Internal token not configured');
  }

  try {
    await axios.post(
      webhookUrl,
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
    await releaseReservedTenantQuota(tenantId, 1);
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
  const uploadedUrl = await uploadBuffer(file.buffer, key, mimeType);

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

  if (reservation == null) {
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
