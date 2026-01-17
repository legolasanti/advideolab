import axios from 'axios';
import { JobStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { uploadBuffer, generateAssetKey } from '../lib/s3';
import { sanitizeImage } from './imageProcessing';
import { validateUpload } from '../utils/fileValidation';
import { triggerWorkflow } from './n8n';
import { env } from '../config/env';
import { incrementUsageOnSuccess, TenantWithPlan } from './quota';
import { decrypt } from '../lib/crypto';

const MAX_TENANT_JOBS = 20;

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
  const job = await prisma.job.create({
    data: {
      tenantId: params.tenant.id,
      status: JobStatus.pending,
      options: params.options,
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
    await completeJobWithOutputs(job.id, params.tenant.id, result.immediateOutputs);
    await incrementUsageOnSuccess(params.tenant.id, params.options.videoCount);
    return { jobId: job.id, outputs: result.immediateOutputs };
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

const extractExtensionFromContentType = (contentType?: string) => {
  if (!contentType) return null;
  const [, subtype] = contentType.split('/');
  if (!subtype) return null;
  const cleaned = subtype.split('+')[0]?.replace(/[^a-z0-9]/gi, '');
  return cleaned ? cleaned.toLowerCase() : null;
};

const extractExtensionFromUrl = (value?: string) => {
  if (!value) return null;
  const stripQuery = value.split('?')[0];
  const match = stripQuery.split('.').pop();
  if (!match) return null;
  const cleaned = match.replace(/[^a-z0-9]/gi, '');
  return cleaned ? cleaned.toLowerCase() : null;
};

const determineOutputExtension = (contentType?: string, fallbackUrl?: string) => {
  return extractExtensionFromContentType(contentType) ?? extractExtensionFromUrl(fallbackUrl) ?? 'mp4';
};

const downloadExternalAsset = async (url: string) => {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 180_000,
  });
  const buffer = Buffer.from(response.data);
  const contentTypeHeader = response.headers['content-type'];
  const lengthHeader = response.headers['content-length'];
  const parsedLength =
    typeof lengthHeader === 'string'
      ? Number(lengthHeader)
      : Array.isArray(lengthHeader)
      ? Number(lengthHeader[0])
      : undefined;
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
    const contentType = download.contentType ?? payload.type ?? DEFAULT_OUTPUT_CONTENT_TYPE;
    const ext = determineOutputExtension(contentType, originalUrl);
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
      thumbnailUrl: payload.thumbnailUrl,
      durationSeconds: payload.durationSeconds,
      originalUrl,
    });
  }
  return stored;
};

export const completeJobWithOutputs = async (jobId: string, tenantId: string, outputs: OutputAsset[]) => {
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
  });
  await pruneTenantJobs(tenantId, MAX_TENANT_JOBS);
};

export const markJobError = async (jobId: string, tenantId: string, error: string) => {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.error, error, finishedAt: new Date() },
  });
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
