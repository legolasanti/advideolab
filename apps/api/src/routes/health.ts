import { Router } from 'express';
import { sendEmailTest, getEmailStatus } from '../services/email';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
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

router.get('/email-test', async (_req, res) => {
  const status = await getEmailStatus();
  if (!status.configured) {
    console.warn('[email][health] SMTP not configured', { missing: status.missing });
    return res.status(500).json({ ok: false, error: 'SMTP not configured', missing: status.missing });
  }
  try {
    const ok = await sendEmailTest();
    if (!ok) {
      console.error('[email][health] send failed', { to: status.notificationEmail });
      return res.status(500).json({ ok: false, error: 'Email send failed' });
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[email][health] failed', err);
    return res.status(500).json({ ok: false, error: err?.message ?? 'Email test failed' });
  }
});

export default router;
