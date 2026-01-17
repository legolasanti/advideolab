const ALLOWED_TYPES = ['image/png', 'image/jpeg'];
const MAX_SIZE = 10 * 1024 * 1024;

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
};
