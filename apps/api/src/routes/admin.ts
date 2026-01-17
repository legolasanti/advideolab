import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { upload } from '../middleware/upload';
import { uploadBuffer, generateAssetKey } from '../lib/s3';
import { encrypt } from '../lib/crypto';
import { hashPassword } from '../services/password';

const router = Router();

const audit = async (tenantId: string, actorUserId: string | undefined, action: string, details?: any) => {
  await prisma.audit.create({
    data: { tenantId, actorUserId, action, details },
  });
};

router.get('/settings', requireAuth, requireTenantRole(['tenant_admin']), async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant!.id } });
  res.json(tenant);
});

router.get('/users', requireAuth, requireTenantRole(['tenant_admin']), async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.tenant!.id },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

router.get('/apikeys', requireAuth, requireTenantRole(['tenant_admin']), async (req, res) => {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId: req.tenant!.id },
    select: { id: true, provider: true, createdAt: true },
  });
  res.json(keys);
});

router.post(
  '/settings',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  upload.single('logo'),
  async (req, res) => {
    if (!req.tenant) return res.status(400).json({ error: 'Tenant missing' });
    let logoUrl = req.tenant.logoUrl;
    if (req.file) {
      const key = generateAssetKey(req.tenant.id, 'input', `logo-${Date.now()}`, 'png');
      logoUrl = await uploadBuffer(req.file.buffer, key, req.file.mimetype);
    }

    const data = {
      defaultWatermarkText: req.body.defaultWatermarkText ?? req.tenant.defaultWatermarkText,
      defaultLogoPos: req.body.defaultLogoPos ?? req.tenant.defaultLogoPos,
      defaultLogoScale: req.body.defaultLogoScale ? Number(req.body.defaultLogoScale) : req.tenant.defaultLogoScale,
      logoUrl,
    };

    const tenant = await prisma.tenant.update({
      where: { id: req.tenant.id },
      data,
    });
    await audit(req.tenant.id, req.auth?.userId, 'update_settings', data);
    res.json(tenant);
  },
);

router.post(
  '/n8n',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  zodHandler(
    z.object({
      n8nBaseUrl: z.string().url(),
      n8nProcessPath: z.string(),
    }),
    async (req, res, body) => {
      const tenant = await prisma.tenant.update({
        where: { id: req.tenant!.id },
        data: {
          n8nBaseUrl: body.n8nBaseUrl,
          n8nProcessPath: body.n8nProcessPath,
        },
      });
      await audit(req.tenant!.id, req.auth?.userId, 'update_n8n', body);
      res.json(tenant);
    },
  ),
);

router.post(
  '/users',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  zodHandler(
    z.object({
      action: z.enum(['invite', 'remove']),
      email: z.string().email().optional(),
      userId: z.string().optional(),
      role: z.enum(['tenant_admin', 'user']).optional(),
      password: z.string().optional(),
    }),
    async (req, res, body) => {
      if (body.action === 'invite') {
        if (!body.email || !body.role || !body.password) {
          return res.status(400).json({ error: 'Missing invite data' });
        }
        const user = await prisma.user.create({
          data: {
            tenantId: req.tenant!.id,
            email: body.email,
            role: body.role,
            passwordHash: await hashPassword(body.password),
          },
        });
        await audit(req.tenant!.id, req.auth?.userId, 'invite_user', { email: body.email, role: body.role });
        return res.json(user);
      }

      if (!body.userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      if (body.userId === req.auth?.userId) {
        return res.status(400).json({ error: 'You cannot remove your own access' });
      }
      await prisma.user.delete({ where: { id: body.userId } });
      await audit(req.tenant!.id, req.auth?.userId, 'remove_user', { userId: body.userId });
      return res.json({ ok: true });
    },
  ),
);

router.post(
  '/apikeys',
  requireAuth,
  requireTenantRole(['tenant_admin']),
  zodHandler(
    z.object({
      provider: z.string(),
      key: z.string(),
    }),
    async (req, res, body) => {
      const apiKey = await prisma.apiKey.upsert({
        where: {
          tenantId_provider: {
            tenantId: req.tenant!.id,
            provider: body.provider,
          },
        },
        update: {
          keyEncrypted: encrypt(body.key),
        },
        create: {
          tenantId: req.tenant!.id,
          provider: body.provider,
          keyEncrypted: encrypt(body.key),
        },
      });
      await audit(req.tenant!.id, req.auth?.userId, 'upsert_apikey', { provider: body.provider });
      res.json(apiKey);
    },
  ),
);

function zodHandler<T extends z.ZodTypeAny>(schema: T, handler: (req: any, res: any, parsed: z.infer<T>) => Promise<void>) {
  return async (req: any, res: any) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    await handler(req, res, parsed.data);
  };
}

export default router;
