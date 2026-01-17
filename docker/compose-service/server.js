import express from 'express';
import multer from 'multer';
import sharp from 'sharp';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post('/compose', upload.fields([{ name: 'base' }, { name: 'logo' }]), async (req, res) => {
  try {
    const base = req.files.base?.[0];
    if (!base) {
      return res.status(400).json({ error: 'Base image required' });
    }
    let image = sharp(base.buffer);
    const operations = [];

    if (req.files.logo?.[0]) {
      const logo = req.files.logo[0];
      const position = req.body.logoPosition ?? 'southeast';
      const scale = Number(req.body.logoScale ?? 100) / 100;
      const resizedLogo = await sharp(logo.buffer).resize({ width: Math.round(200 * scale) }).png().toBuffer();
      operations.push({
        input: resizedLogo,
        gravity: mapPosition(position),
      });
    }

    if (req.body.watermarkText) {
      const svg = `<svg width="500" height="200">
        <text x="0" y="30" font-size="28" fill="rgba(255,255,255,${Number(req.body.watermarkOpacity ?? 50) / 100})">${req.body.watermarkText}</text>
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
