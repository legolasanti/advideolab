import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { verifyPassword, hashPassword } from '../services/password';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { sendCustomerSignupConfirmation, sendOwnerSignupNotification, sendPasswordResetEmail } from '../services/email';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { createStripeCheckoutSessionForTenant } from '../services/stripe';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const tenantWithPlanInclude = {
  planDetails: true,
} satisfies Prisma.TenantInclude;

type TenantWithPlan = Prisma.TenantGetPayload<{ include: typeof tenantWithPlanInclude }>;

const serializeTenant = (tenant?: TenantWithPlan | null) => {
  if (!tenant) return undefined;
  return {
    id: tenant.id,
    name: tenant.name,
    resetDay: tenant.resetDay,
    status: tenant.status,
    paymentStatus: tenant.paymentStatus,
    requestedPlanCode: tenant.requestedPlanCode,
    monthlyVideoLimit: tenant.planDetails?.monthlyVideoLimit ?? tenant.monthlyVideoLimit ?? null,
    planCode: tenant.planDetails?.code ?? null,
    planName: tenant.planDetails?.name ?? null,
    billingCycleStart: tenant.billingCycleStart,
    nextBillingDate: tenant.nextBillingDate,
  };
};

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const owner = await prisma.owner.findUnique({ where: { email } });
  if (owner) {
    const matches = await verifyPassword(password, owner.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({ sub: owner.id, role: 'owner_superadmin', ownerId: owner.id });
    return res.json({ token, role: 'owner_superadmin' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: {
        include: tenantWithPlanInclude,
      },
    },
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
  });

  return res.json({
    token,
    role: user.role,
    tenant: serializeTenant(user.tenant),
  });
});

const signupSchema = z.object({
  companyName: z.string().min(2),
  contactName: z.string().min(2).optional(),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((val) => /[A-Z]/.test(val), { message: 'Password must include an uppercase letter.' })
    .refine((val) => /[a-z]/.test(val), { message: 'Password must include a lowercase letter.' })
    .refine((val) => /\d/.test(val), { message: 'Password must include a number.' })
    .refine((val) => /[^A-Za-z0-9]/.test(val), { message: 'Password must include a symbol.' }),
  planCode: z.enum(['starter', 'growth', 'scale']),
  couponCode: z.string().optional(),
});

router.post('/signup', async (req, res) => {
  const {
    companyName,
    contactName,
    email,
    password,
    planCode,
    couponCode,
  } = signupSchema.parse(req.body);
  const existingOwner = await prisma.owner.findUnique({ where: { email } });
  if (existingOwner) {
    return res.status(400).json({ error: 'email_taken' });
  }
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ error: 'email_taken' });
  }

  const requestedPlan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!requestedPlan) {
    return res.status(400).json({ error: 'plan_not_found' });
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      status: 'pending',
      monthlyVideoLimit: 0,
      requestedPlanCode: requestedPlan.code,
      paymentStatus: 'payment_pending',
      billingCompanyName: companyName,
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      role: 'tenant_admin',
      passwordHash: await hashPassword(password),
    },
  });

  let checkoutUrl: string | null = null;
  try {
    const session = await createStripeCheckoutSessionForTenant({
      tenantId: tenant.id,
      planCode: requestedPlan.code as 'starter' | 'growth' | 'scale',
      customerEmail: user.email,
      customerName: companyName,
      couponCode,
      successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
    });
    checkoutUrl = session.url;
  } catch (err) {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    throw err;
  }

  await prisma.adminNotification.create({
    data: {
      tenantId: tenant.id,
      type: 'signup',
      message: `${tenant.name} signed up requesting the ${requestedPlan.name} plan`,
      details: {
        email,
        planCode: requestedPlan.code,
        contactName,
        couponCode: couponCode?.trim() || null,
      },
    },
  });

  await sendOwnerSignupNotification({
    tenant,
    user,
    plan: requestedPlan,
    adminName: contactName,
  });
  await sendCustomerSignupConfirmation({
    tenant,
    user,
    plan: requestedPlan,
    paymentUrl: checkoutUrl,
  });

  const token = signToken({
    sub: user.id,
    role: user.role,
    tenantId: tenant.id,
  });

  res.status(201).json({
    token,
    role: user.role,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      paymentStatus: tenant.paymentStatus,
      requestedPlanCode: tenant.requestedPlanCode,
    },
    checkoutUrl,
  });
});

router.get('/me', requireAuth, async (req, res) => {
  if (req.auth?.role === 'owner_superadmin') {
    if (!req.auth.ownerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const owner = await prisma.owner.findUnique({
      where: { id: req.auth.ownerId },
      select: { id: true, email: true, createdAt: true, tenantId: true },
    });
    if (!owner) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json({ owner });
  }

  if (!req.auth?.userId || !req.auth.tenantId) {
    return res.status(400).json({ error: 'Tenant scope missing' });
  }

  const [user, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { id: true, email: true, role: true },
    }),
    prisma.tenant.findUnique({
      where: { id: req.auth.tenantId },
      include: tenantWithPlanInclude,
    }),
  ]);
  if (!user || !tenant) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({ user, tenant: serializeTenant(tenant) });
});

router.post('/password-reset', async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    // Check if user or owner exists
    const user = await prisma.user.findUnique({ where: { email } });
    const owner = await prisma.owner.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user && !owner) {
      console.info(`[password reset] email not found: ${email}`);
      return res.json({ ok: true });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    await prisma.passwordResetToken.create({
      data: {
        email,
        token: resetTokenHash,
        expiresAt,
      },
    });

    // Send email
    await sendPasswordResetEmail({ email, resetToken });
    console.info(`[password reset] sent link to ${email}`);

    res.json({ ok: true });
  } catch (err) {
    console.error('[password reset] error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, { message: 'Invalid reset token format' }),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .refine((val) => /[A-Z]/.test(val), { message: 'Password must include an uppercase letter.' })
    .refine((val) => /[a-z]/.test(val), { message: 'Password must include a lowercase letter.' })
    .refine((val) => /\d/.test(val), { message: 'Password must include a number.' })
    .refine((val) => /[^A-Za-z0-9]/.test(val), { message: 'Password must include a symbol.' }),
});

router.post('/password-reset/confirm', async (req, res) => {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find and validate token
    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (resetRecord.used) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }

    if (new Date() > resetRecord.expiresAt) {
      return res.status(400).json({ error: 'Reset link has expired' });
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update user or owner password
    const user = await prisma.user.findUnique({ where: { email: resetRecord.email } });
    const owner = await prisma.owner.findUnique({ where: { email: resetRecord.email } });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    } else if (owner) {
      await prisma.owner.update({
        where: { id: owner.id },
        data: { passwordHash },
      });
    } else {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { token: tokenHash },
      data: { used: true },
    });

    console.info(`[password reset] password updated for ${resetRecord.email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[password reset confirm] error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
