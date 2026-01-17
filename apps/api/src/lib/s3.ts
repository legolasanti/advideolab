import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import crypto from 'crypto';

const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  region: 'auto',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

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
      ACL: 'public-read',
      ContentType: contentType,
    }),
  );

  return `${env.PUBLIC_CDN_BASE.replace(/\/$/, '')}/${key}`;
};

export const generateAssetKey = (tenantId: string, type: 'input' | 'output', jobId: string, ext: string) => {
  const random = crypto.randomBytes(4).toString('hex');
  return `${tenantId}/${type}/${jobId}-${random}.${ext}`;
};
