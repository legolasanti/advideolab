import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { sendEmailTest, getEmailStatus } from '../services/email';
import { prisma } from '../lib/prisma';
import { requireAuth, requireOwner } from '../middleware/auth';
import { env } from '../config/env';

const router = Router();
const emailTestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: env.isProd ? 2 : 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', async (req, res) => {
  if (env.isProd && req.auth?.role !== 'owner_superadmin') {
    return res.status(404).json({ error: 'Not found' });
  }
  const checks = {
    database: false,
    timestamp: new Date().toISOString(),
  };

  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (err) {
    console.error('[health] Database check failed:', err);
  }

  const allHealthy = checks.database;
  const status = allHealthy ? 200 : 503;

  return res.status(status).json({
    ok: allHealthy,
    checks,
  });
});

router.get('/email-test', emailTestLimiter, requireAuth, requireOwner(), async (_req, res) => {
  const status = await getEmailStatus();
  if (!status.configured) {
    console.warn('[email][health] SMTP not configured', { missing: status.missing });
    return res.status(503).json({
      ok: false,
      error: 'SMTP not configured',
      missing: env.isProd ? undefined : status.missing,
    });
  }
  try {
    const ok = await sendEmailTest();
    if (!ok) {
      console.error('[email][health] send failed');
      return res.status(500).json({ ok: false, error: 'Email send failed' });
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[email][health] failed', err);
    return res.status(500).json({ ok: false, error: err?.message ?? 'Email test failed' });
  }
});

export default router;
