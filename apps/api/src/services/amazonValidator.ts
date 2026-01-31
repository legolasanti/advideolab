import sharp from 'sharp';

export type AmazonValidation = {
  warnings: string[];
  passes: boolean;
};

export const validateAmazonMainImage = async (buffer: Buffer): Promise<AmazonValidation> => {
  const warnings: string[] = [];
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    warnings.push('Could not read dimensions');
  } else {
    if (metadata.width !== metadata.height) {
      warnings.push('Image should be square (2000x2000)');
    }
    if (metadata.width < 1600 || metadata.height < 1600) {
      warnings.push('Image width/height must be at least 1600px');
    }
  }

  const stats = await image.stats();
  const avgBrightness =
    stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / Math.max(stats.channels.slice(0, 3).length, 1);
  if (avgBrightness < 245) {
    warnings.push('Background may not be pure white (#FFFFFF)');
  }

  // Rough product coverage estimation via center crop
  const { width = 0, height = 0 } = metadata;
  if (width && height) {
    const cropWidth = Math.round(width * 0.6);
    const cropHeight = Math.round(height * 0.6);
    const center = await sharp(buffer)
      .extract({
        left: Math.round((width - cropWidth) / 2),
        top: Math.round((height - cropHeight) / 2),
        width: cropWidth,
        height: cropHeight,
      })
      .stats();
    const centerBrightness =
      center.channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) /
      Math.max(center.channels.slice(0, 3).length, 1);
    if (centerBrightness > 200) {
      warnings.push('Product bounds may be too small (<80% coverage)');
    }
  }

  return {
    warnings,
    passes: warnings.length === 0,
  };
};
