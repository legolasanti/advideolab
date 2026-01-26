import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, requireTenantRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { upload } from '../middleware/upload';
import { uploadBuffer, generateAssetKey } from '../lib/s3';
import { encrypt } from '../lib/crypto';
import { hashPassword } from '../services/password';
import { env } from '../config/env';
import { resolveSafeExternalTarget, UnsafeExternalUrlError } from '../utils/safeUrl';
import { validateUpload } from '../utils/fileValidation';
import { sanitizeImage } from '../services/imageProcessing';

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
      try {
        validateUpload(req.file);
      } catch (err: any) {
        return res.status(400).json({ error: err?.message ?? 'Invalid upload' });
      }

      let sanitized;
      try {
        sanitized = await sanitizeImage(req.file);
      } catch (_err) {
        return res.status(400).json({ error: 'Invalid image file' });
      }

      const contentType = sanitized.ext === 'png' ? 'image/png' : 'image/jpeg';
      const key = generateAssetKey(req.tenant.id, 'input', `logo-${Date.now()}`, sanitized.ext);
      logoUrl = await uploadBuffer(sanitized.buffer, key, contentType);
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
      n8nBaseUrl: z.string().url().max(2048),
      n8nProcessPath: z
        .string()
        .min(1)
        .max(2048)
        .refine((value) => value.startsWith('/'), { message: 'n8nProcessPath must start with "/"' }),
    }),
    async (req, res, body) => {
      const allowlist = (env.n8nHostAllowlist ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ''))
        .filter(Boolean);
      const base = body.n8nBaseUrl.trim();
      const path = body.n8nProcessPath.trim();
      const url = new URL(path, base).toString();
      try {
        await resolveSafeExternalTarget(url, {
          allowHttp: !env.isProd,
          allowedHostnames: allowlist,
          isProd: env.isProd,
        });
      } catch (err: any) {
        const message = err instanceof UnsafeExternalUrlError ? err.message : 'Invalid n8n URL';
        return res.status(400).json({ error: 'invalid_n8n_url', message });
      }

      const tenant = await prisma.tenant.update({
        where: { id: req.tenant!.id },
        data: {
          n8nBaseUrl: base.replace(/\/$/, ''),
          n8nProcessPath: path,
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
          select: { id: true, email: true, role: true, createdAt: true },
        });
        await audit(req.tenant!.id, req.auth?.userId, 'invite_user', { email: body.email, role: body.role });
        return res.json(user);
      }

      if (!body.userId) {
        return res.status(400).json({ error: 'Missing userId' });
      }
      if (!req.tenant?.id) {
        return res.status(400).json({ error: 'Tenant missing' });
      }
      if (body.userId === req.auth?.userId) {
        return res.status(400).json({ error: 'You cannot remove your own access' });
      }
      const tenantId = req.tenant.id;
      const result = await prisma.$transaction(
        async (trx) => {
          const target = await trx.user.findFirst({
            where: { id: body.userId, tenantId },
            select: { id: true, role: true },
          });
          if (!target) {
            return { deleted: 0, error: 'not_found' as const };
          }

          if (target.role === 'tenant_admin') {
            const adminCount = await trx.user.count({
              where: { tenantId, role: 'tenant_admin' },
            });
            if (adminCount <= 1) {
              return { deleted: 0, error: 'last_admin' as const };
            }
          }

          const deleted = await trx.user.deleteMany({
            where: { id: body.userId, tenantId },
          });
          return { deleted: deleted.count, error: null };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      if (result.error === 'last_admin') {
        return res.status(400).json({ error: 'Cannot delete the last tenant admin' });
      }
      if (result.deleted === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
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
