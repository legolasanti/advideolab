import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';

const app = express();
const isProd = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
const expectedToken = process.env.COMPOSE_INTERNAL_TOKEN?.trim() ?? '';
const enforceAuth = isProd || expectedToken.length >= 32;

const isAuthorized = (providedToken) => {
  if (!enforceAuth) return true;
  if (!providedToken || expectedToken.length < 32) return false;
  const providedHash = crypto.createHash('sha256').update(providedToken).digest();
  const expectedHash = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
};

const escapeXml = (value = '') =>
  String(value).replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return char;
    }
  });

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png', 'image/jpeg']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('unsupported_file_type'));
    }
    cb(null, true);
  },
});

app.post('/compose', upload.fields([{ name: 'base' }, { name: 'logo' }]), async (req, res) => {
  try {
    const providedToken = req.header('x-internal-api-token')?.trim();
    if (!isAuthorized(providedToken)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (enforceAuth && expectedToken.length < 32) {
      return res.status(503).json({ error: 'compose_token_not_configured' });
    }

    const base = req.files.base?.[0];
    if (!base) {
      return res.status(400).json({ error: 'Base image required' });
    }
    let image = sharp(base.buffer);
    const operations = [];

    if (req.files.logo?.[0]) {
      const logo = req.files.logo[0];
      const position = req.body.logoPosition ?? 'southeast';
      const scale = clampNumber(req.body.logoScale ?? 100, 10, 300, 100) / 100;
      const resizedLogo = await sharp(logo.buffer).resize({ width: Math.round(200 * scale) }).png().toBuffer();
      operations.push({
        input: resizedLogo,
        gravity: mapPosition(position),
      });
    }

    if (req.body.watermarkText) {
      const text = escapeXml(String(req.body.watermarkText)).slice(0, 200);
      const opacity = clampNumber(req.body.watermarkOpacity ?? 50, 0, 100, 50) / 100;
      const svg = `<svg width="500" height="200">
        <text x="0" y="30" font-size="28" fill="rgba(255,255,255,${opacity})">${text}</text>
      </svg>`;
      operations.push({
        input: Buffer.from(svg),
        gravity: mapPosition(req.body.watermarkPosition ?? 'south'),
      });
    }

    if (operations.length > 0) {
      image = image.composite(operations);
    }

    const buffer = await image.jpeg({ quality: 95 }).toBuffer();
    res.set('Content-Type', 'image/jpeg');
    res.send(buffer);
  } catch (err) {
    console.error(err);
    if (String(err?.message ?? '') === 'unsupported_file_type') {
      return res.status(400).json({ error: 'unsupported_file_type' });
    }
    res.status(500).json({ error: 'Compose error' });
  }
});

const mapPosition = (pos) => {
  switch (pos) {
    case 'top-left':
      return 'northwest';
    case 'top-right':
      return 'northeast';
    case 'bottom-left':
      return 'southwest';
    case 'bottom-right':
      return 'southeast';
    default:
      return 'southeast';
  }
};

const port = process.env.PORT || 7000;
app.listen(port, () => console.log(`Compose service on ${port}`));
