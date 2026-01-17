const ALLOWED_TYPES = ['image/png', 'image/jpeg'];
const MAX_SIZE = 10 * 1024 * 1024;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const hasPngMagic = (buffer: Buffer) => buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);

const hasJpegMagic = (buffer: Buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

export const validateUpload = (file?: Express.Multer.File) => {
  if (!file) {
    throw new Error('File is required');
  }
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    throw new Error('Unsupported file type');
  }
  if (file.size > MAX_SIZE) {
    throw new Error('File too large (max 10MB)');
  }
  if (!file.buffer || file.buffer.length === 0) {
    throw new Error('Empty file');
  }
  if (file.mimetype === 'image/png' && !hasPngMagic(file.buffer)) {
    throw new Error('Invalid PNG file');
  }
  if (file.mimetype === 'image/jpeg' && !hasJpegMagic(file.buffer)) {
    throw new Error('Invalid JPEG file');
  }
};
