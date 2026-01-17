import sharp from 'sharp';

export type SanitizedImage = {
  buffer: Buffer;
  ext: string;
  metadata: sharp.Metadata;
  thumbnail: Buffer;
};

export const sanitizeImage = async (file: Express.Multer.File): Promise<SanitizedImage> => {
  const instance = sharp(file.buffer, { failOn: 'none' });
  const metadata = await instance.metadata();
  const format = metadata.format === 'png' ? 'png' : 'jpeg';

  const sanitized = await instance.rotate().toFormat(format, { quality: 92 }).toBuffer();
  const thumbnail = await sharp(sanitized).resize({ width: 512 }).toFormat('jpeg').toBuffer();

  return {
    buffer: sanitized,
    ext: format === 'png' ? 'png' : 'jpg',
    metadata,
    thumbnail,
  };
};
