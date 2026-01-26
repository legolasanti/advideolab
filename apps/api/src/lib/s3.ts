import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import crypto from 'crypto';
import type { Readable } from 'node:stream';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  region: 'auto',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const sanitizePathComponent = (value: string, label: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!cleaned || cleaned !== value || cleaned.includes('..') || cleaned.startsWith('.')) {
    throw new Error(`Invalid ${label}`);
  }
  return cleaned;
};

const sanitizeExtension = (ext: string) => {
  const cleaned = ext
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9]/g, '');
  if (!cleaned || cleaned.length > 16) {
    throw new Error('Invalid file extension');
  }
  return cleaned;
};

export const uploadBuffer = async (
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ACL: env.s3ObjectAcl,
      ContentType: contentType,
    }),
  );

  return `${env.PUBLIC_CDN_BASE.replace(/\/$/, '')}/${key}`;
};

export const uploadStream = async (
  stream: Readable,
  key: string,
  contentType: string,
  contentLength?: number,
): Promise<string> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: stream,
      ACL: env.s3ObjectAcl,
      ContentType: contentType,
      ContentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    }),
  );

  return `${env.PUBLIC_CDN_BASE.replace(/\/$/, '')}/${key}`;
};

export const generateAssetKey = (tenantId: string, type: 'input' | 'output', jobId: string, ext: string) => {
  const safeTenantId = sanitizePathComponent(tenantId, 'tenantId');
  const safeJobId = sanitizePathComponent(jobId, 'jobId');
  const safeExt = sanitizeExtension(ext);
  const random = crypto.randomBytes(4).toString('hex');
  return `${safeTenantId}/${type}/${safeJobId}-${random}.${safeExt}`;
};

const streamToBuffer = async (stream: Readable) => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

export const downloadBufferByKey = async (key: string): Promise<Buffer> => {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
  if (!result.Body) {
    throw new Error('Missing S3 object body');
  }
  return streamToBuffer(result.Body as Readable);
};

export const resolveKeyFromPublicUrl = (value: string): string | null => {
  try {
    const target = new URL(value);
    const base = new URL(env.PUBLIC_CDN_BASE);
    if (target.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/$/, '');
    const targetPath = target.pathname;
    if (basePath && !targetPath.startsWith(basePath)) return null;
    const key = targetPath.slice(basePath.length).replace(/^\/+/, '');
    return key.length > 0 ? key : null;
  } catch (_err) {
    return null;
  }
};
