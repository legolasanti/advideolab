import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { verifyPassword, hashPassword } from '../services/password';
import { signToken } from '../utils/jwt';
import { requireAuth } from '../middleware/auth';
import { sendEmailVerification, sendOwnerSignupNotification, sendPasswordResetEmail } from '../services/email';
import type { BillingInterval, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { createStripeCheckoutSessionForTenant } from '../services/stripe';
import { decrypt } from '../lib/crypto';
import { trackMarketingEvent } from '../services/marketing';
import { MarketingEventType } from '@prisma/client';
import {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  getRefreshTokenRecord,
  getRefreshCookieName,
} from '../services/refreshTokens';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: env.isProd ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: env.isProd ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: env.isProd ? 10 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

const passwordResetConfirmLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: env.isProd ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const marketingSchema = z
  .object({
    sessionId: z.string().min(8).max(128).optional(),
    utmSource: z.string().max(128).optional().nullable(),
    utmMedium: z.string().max(128).optional().nullable(),
    utmCampaign: z.string().max(128).optional().nullable(),
    referrer: z.string().max(2048).optional().nullable(),
    landingPage: z.string().max(2048).optional().nullable(),
  })
  .optional();

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
    billingInterval: tenant.billingInterval,
    subscriptionPeriodStart: tenant.subscriptionPeriodStart,
    subscriptionPeriodEnd: tenant.subscriptionPeriodEnd,
    subscriptionCancelAt: tenant.subscriptionCancelAt,
    subscriptionCanceledAt: tenant.subscriptionCanceledAt,
  };
};

const refreshCookieName = getRefreshCookieName();
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/api/auth/refresh',
};

const setRefreshCookie = (res: any, token: string, expiresAt: Date) => {
  res.cookie(refreshCookieName, token, {
    ...refreshCookieOptions,
    expires: expiresAt,
  });
};

const clearRefreshCookie = (res: any) => {
  res.cookie(refreshCookieName, '', {
    ...refreshCookieOptions,
    expires: new Date(0),
  });
};

const parseCookies = (header?: string) => {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.split('=');
    if (!key) continue;
    const value = rest.join('=').trim();
    cookies[key.trim()] = value ? decodeURIComponent(value) : '';
  }
  return cookies;
};

const getRefreshTokenFromReq = (req: any) => {
  const cookies = parseCookies(req.headers?.cookie ?? '');
  return cookies[refreshCookieName] ?? null;
};

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_STATE_AUDIENCE = 'google-oauth';

type GoogleOAuthState = {
  mode: 'login' | 'signup';
  planCode?: 'starter' | 'growth' | 'scale';
  billingInterval?: BillingInterval;
  couponCode?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  marketing?: {
    sessionId?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    referrer?: string | null;
    landingPage?: string | null;
  } | null;
};

const signGoogleState = (payload: GoogleOAuthState) =>
  jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
    audience: GOOGLE_STATE_AUDIENCE,
  });

const verifyGoogleState = (token: string) =>
  jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    audience: GOOGLE_STATE_AUDIENCE,
  }) as GoogleOAuthState;

const resolveGoogleOAuthConfig = async () => {
  const config = await prisma.systemConfig.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  const clientId = config.googleOAuthClientId?.trim() ?? null;
  const clientSecret = config.googleOAuthClientSecretEncrypted
    ? decrypt(config.googleOAuthClientSecretEncrypted)
    : null;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${env.API_PUBLIC_URL}/api/auth/google/callback`,
  };
};

const issueEmailVerificationToken = async (userId: string, email: string) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.emailVerificationToken.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      email,
      token: tokenHash,
      expiresAt,
    },
  });
  return token;
};

const buildVerificationUrl = (token: string) =>
  `${env.WEB_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`;

const buildWebRedirect = (path: string, params: Record<string, string | null | undefined> = {}) => {
  const url = new URL(path, env.WEB_BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  const owner = await prisma.owner.findUnique({ where: { email } });
  if (owner) {
    const matches = await verifyPassword(password, owner.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({
      sub: owner.id,
      role: 'owner_superadmin',
      ownerId: owner.id,
      tokenVersion: owner.tokenVersion ?? 0,
    });
    const refresh = await createRefreshToken({
      ownerId: owner.id,
      tenantId: owner.tenantId ?? null,
      tokenVersion: owner.tokenVersion ?? 0,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    setRefreshCookie(res, refresh.token, refresh.record.expiresAt);
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
  if (!user.emailVerifiedAt) {
    return res.status(403).json({ error: 'email_not_verified' });
  }

  const token = signToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
    tokenVersion: user.tokenVersion ?? 0,
  });

  const refresh = await createRefreshToken({
    userId: user.id,
    tenantId: user.tenantId,
    tokenVersion: user.tokenVersion ?? 0,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  setRefreshCookie(res, refresh.token, refresh.record.expiresAt);

  return res.json({
    token,
    role: user.role,
    tenant: serializeTenant(user.tenant),
  });
});

const googleStartSchema = z.object({
  mode: z.enum(['login', 'signup']),
  planCode: z.enum(['starter', 'growth', 'scale']).optional(),
  billingInterval: z.enum(['monthly', 'annual']).optional(),
  couponCode: z.string().optional(),
  companyName: z.string().optional(),
  contactName: z.string().optional(),
  sessionId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  referrer: z.string().optional(),
  landingPage: z.string().optional(),
});

router.get('/google', async (req, res) => {
  const config = await resolveGoogleOAuthConfig();
  if (!config) {
    return res.status(400).json({ error: 'google_oauth_not_configured' });
  }

  const query = googleStartSchema.parse(req.query);
  // Plan code is required for signup, but company name can come from Google profile
  if (query.mode === 'signup' && !query.planCode) {
    return res.status(400).json({ error: 'plan_required' });
  }

  const marketing =
    query.sessionId && query.sessionId.trim().length > 0
      ? {
          sessionId: query.sessionId,
          utmSource: query.utmSource ?? null,
          utmMedium: query.utmMedium ?? null,
          utmCampaign: query.utmCampaign ?? null,
          referrer: query.referrer ?? null,
          landingPage: query.landingPage ?? null,
        }
      : null;

  const statePayload: GoogleOAuthState = {
    mode: query.mode,
    planCode: query.planCode,
    billingInterval: (query.billingInterval as BillingInterval | undefined) ?? undefined,
    couponCode: query.couponCode?.trim() || null,
    companyName: query.companyName?.trim() || null,
    contactName: query.contactName?.trim() || null,
    marketing,
  };

  const state = signGoogleState(statePayload);
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);

  return res.json({ url: url.toString() });
});

router.get('/google/callback', async (req, res) => {
  const error = typeof req.query.error === 'string' ? req.query.error : null;
  if (error) {
    return res.redirect(buildWebRedirect('/login', { oauthError: error }));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const stateToken = typeof req.query.state === 'string' ? req.query.state : null;
  if (!code || !stateToken) {
    return res.redirect(buildWebRedirect('/login', { oauthError: 'missing_params' }));
  }

  let state: GoogleOAuthState;
  try {
    state = verifyGoogleState(stateToken);
  } catch (_err) {
    return res.redirect(buildWebRedirect('/login', { oauthError: 'invalid_state' }));
  }

  const config = await resolveGoogleOAuthConfig();
  if (!config) {
    return res.redirect(buildWebRedirect('/login', { oauthError: 'oauth_not_configured' }));
  }

  try {
    const tokenResponse = await axios.post(
      GOOGLE_TOKEN_URL,
      new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const idToken = tokenResponse.data?.id_token as string | undefined;
    if (!idToken) {
      throw new Error('missing_id_token');
    }

    const tokenInfo = await axios.get(GOOGLE_TOKENINFO_URL, {
      params: { id_token: idToken },
    });

    const email = tokenInfo.data?.email as string | undefined;
    const emailVerified = tokenInfo.data?.email_verified === 'true' || tokenInfo.data?.email_verified === true;
    const googleId = tokenInfo.data?.sub as string | undefined;
    const fullName = tokenInfo.data?.name as string | undefined;

    if (!email || !googleId || !emailVerified) {
      throw new Error('invalid_google_identity');
    }

    if (tokenInfo.data?.aud !== config.clientId) {
      throw new Error('audience_mismatch');
    }

    const existingOwner = await prisma.owner.findUnique({ where: { email } });
    if (existingOwner) {
      return res.redirect(buildWebRedirect('/login', { oauthError: 'owner_account' }));
    }

    let user = await prisma.user.findFirst({
      where: { googleId },
      include: { tenant: { include: tenantWithPlanInclude } },
    });
    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
        include: { tenant: { include: tenantWithPlanInclude } },
      });
      if (user && !user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
          include: { tenant: { include: tenantWithPlanInclude } },
        });
      }
    }

    let tenant = user?.tenant ?? null;
    let isNewUser = false;

    // If no user exists, create account automatically (works for both login and signup modes)
    if (!user) {
      isNewUser = true;
      // Use provided company name, or fall back to Google profile name, or email prefix
      const companyName = state.companyName?.trim() || fullName || email.split('@')[0];

      // Use provided plan or default to starter
      const planCode = state.planCode ?? 'starter';
      const plan = await prisma.plan.findUnique({ where: { code: planCode } });
      if (!plan) {
        return res.redirect(buildWebRedirect('/signup', { oauthError: 'plan_not_found' }));
      }

      const createdTenant = await prisma.tenant.create({
        data: {
          name: companyName,
          status: 'pending',
          monthlyVideoLimit: 0,
          requestedPlanCode: plan.code,
          paymentStatus: 'payment_pending',
          billingCompanyName: companyName,
          billingInterval: state.billingInterval ?? 'monthly',
        },
        include: tenantWithPlanInclude,
      });
      tenant = createdTenant;

      user = await prisma.user.create({
        data: {
          tenantId: createdTenant.id,
          email,
          role: 'tenant_admin',
          passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          googleId,
          emailVerifiedAt: new Date(),
        },
        include: { tenant: { include: tenantWithPlanInclude } },
      });

      tenant = user.tenant ?? tenant;

      const contactName = state.contactName?.trim() || fullName || null;

      await prisma.adminNotification.create({
        data: {
          tenantId: tenant.id,
          type: 'signup',
          message: `${tenant.name} signed up requesting the ${plan.name} plan`,
          details: {
            email,
            planCode: plan.code,
            contactName,
            couponCode: state.couponCode ?? null,
          },
        },
      });

      await sendOwnerSignupNotification({
        tenant,
        user,
        plan,
        adminName: contactName ?? undefined,
      });

      if (state.marketing?.sessionId) {
        try {
          await trackMarketingEvent({
            eventType: MarketingEventType.signup_completed,
            sessionId: state.marketing.sessionId,
            tenantId: tenant.id,
            userId: user.id,
            utmSource: state.marketing.utmSource ?? null,
            utmMedium: state.marketing.utmMedium ?? null,
            utmCampaign: state.marketing.utmCampaign ?? null,
            referrer: state.marketing.referrer ?? null,
            landingPage: state.marketing.landingPage ?? null,
          });
        } catch (err) {
          console.warn('[analytics] signup_completed capture failed', err);
        }
      }
    }

    if (!user || !tenant) {
      return res.redirect(buildWebRedirect('/login', { oauthError: 'account_not_found' }));
    }

    if (!user.emailVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
        include: { tenant: { include: tenantWithPlanInclude } },
      });
      tenant = user.tenant ?? tenant;
    }

    let checkoutUrl: string | null = null;
    // Redirect to checkout if:
    // 1. This is a new user (just created via Google), OR
    // 2. Existing user with pending payment status
    const needsCheckout =
      isNewUser ||
      tenant.paymentStatus === 'payment_pending' ||
      (tenant.status === 'pending' && !tenant.planId);

    if (needsCheckout) {
      const planCode = state.planCode ?? tenant.requestedPlanCode ?? 'starter';
      const session = await createStripeCheckoutSessionForTenant({
        tenantId: tenant.id,
        planCode: planCode as 'starter' | 'growth' | 'scale',
        billingInterval: state.billingInterval ?? tenant.billingInterval ?? 'monthly',
        customerEmail: user.email,
        customerName: tenant.billingCompanyName ?? tenant.name,
        couponCode: state.couponCode ?? undefined,
        successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
        marketing: state.marketing ?? null,
      });
      checkoutUrl = session.url;
    }

    const authToken = signToken({
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion ?? 0,
    });

    const refresh = await createRefreshToken({
      userId: user.id,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion ?? 0,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    setRefreshCookie(res, refresh.token, refresh.record.expiresAt);

    return res.redirect(buildWebRedirect('/oauth/callback', {
      token: authToken,
      role: user.role,
      checkoutUrl,
    }));
  } catch (err) {
    console.error('[oauth] google callback failed', err);
    return res.redirect(buildWebRedirect('/login', { oauthError: 'oauth_failed' }));
  }
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
  billingInterval: z.enum(['monthly', 'annual']).optional(),
  couponCode: z.string().optional(),
  marketing: marketingSchema,
});

router.post('/signup', signupLimiter, async (req, res) => {
  const {
    companyName,
    contactName,
    email,
    password,
    planCode,
    billingInterval,
    couponCode,
    marketing,
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
      billingInterval: billingInterval ?? 'monthly',
      appliedCouponCode: couponCode?.trim() || null,
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
  const verificationToken = await issueEmailVerificationToken(user.id, user.email);
  const verificationUrl = buildVerificationUrl(verificationToken);
  await sendEmailVerification({ email: user.email, verifyUrl: verificationUrl });

  if (marketing?.sessionId) {
    try {
      await trackMarketingEvent({
        eventType: MarketingEventType.signup_completed,
        sessionId: marketing.sessionId,
        tenantId: tenant.id,
        userId: user.id,
        utmSource: marketing.utmSource ?? null,
        utmMedium: marketing.utmMedium ?? null,
        utmCampaign: marketing.utmCampaign ?? null,
        referrer: marketing.referrer ?? null,
        landingPage: marketing.landingPage ?? null,
      });
    } catch (err) {
      console.warn('[analytics] signup_completed capture failed', err);
    }
  }

  res.status(201).json({
    verificationRequired: true,
    email: user.email,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      paymentStatus: tenant.paymentStatus,
      requestedPlanCode: tenant.requestedPlanCode,
    },
  });
});

const verifyEmailSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, { message: 'Invalid verification token format' }),
  marketing: marketingSchema,
});

router.post('/verify-email', async (req, res) => {
  const { token, marketing } = verifyEmailSchema.parse(req.body);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await prisma.emailVerificationToken.findUnique({
    where: { token: tokenHash },
  });

  if (!record) {
    return res.status(400).json({ error: 'verification_invalid' });
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    include: {
      tenant: {
        include: tenantWithPlanInclude,
      },
    },
  });

  if (!user || !user.tenant) {
    return res.status(404).json({ error: 'account_not_found' });
  }

  const alreadyVerified = Boolean(user.emailVerifiedAt);
  const tokenExpired = record.expiresAt < new Date();
  const tokenUsed = record.used;

  if ((tokenExpired || tokenUsed) && !alreadyVerified) {
    return res.status(400).json({ error: 'verification_invalid' });
  }

  if (!alreadyVerified) {
    await prisma.$transaction(async (trx) => {
      await trx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      await trx.emailVerificationToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      });
    });
  } else if (!tokenUsed) {
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });
  }

  let checkoutUrl: string | null = null;
  const effectivePlanCode =
    (user.tenant.planDetails?.code as 'starter' | 'growth' | 'scale' | undefined) ??
    (user.tenant.requestedPlanCode as 'starter' | 'growth' | 'scale' | null);

  if (effectivePlanCode && (user.tenant.status === 'pending' || user.tenant.paymentStatus !== 'active_paid')) {
    const session = await createStripeCheckoutSessionForTenant({
      tenantId: user.tenant.id,
      planCode: effectivePlanCode,
      billingInterval: user.tenant.billingInterval ?? 'monthly',
      customerEmail: user.email,
      customerName: user.tenant.billingCompanyName ?? user.tenant.name,
      couponCode: user.tenant.appliedCouponCode ?? undefined,
      successUrl: `${env.WEB_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${env.WEB_BASE_URL}/checkout/cancel`,
      marketing: marketing ?? null,
    });
    checkoutUrl = session.url;
  }

  const authToken = signToken({
    sub: user.id,
    role: user.role,
    tenantId: user.tenantId,
    tokenVersion: user.tokenVersion ?? 0,
  });

  const refresh = await createRefreshToken({
    userId: user.id,
    tenantId: user.tenantId,
    tokenVersion: user.tokenVersion ?? 0,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  });
  setRefreshCookie(res, refresh.token, refresh.record.expiresAt);

  res.json({
    token: authToken,
    role: user.role,
    tenant: serializeTenant(user.tenant),
    checkoutUrl,
  });
});

router.post('/verify-email/resend', async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) {
    return res.json({ ok: true });
  }

  const token = await issueEmailVerificationToken(user.id, user.email);
  await sendEmailVerification({ email: user.email, verifyUrl: buildVerificationUrl(token) });
  return res.json({ ok: true });
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

router.post('/refresh', async (req, res) => {
  const refreshToken = getRefreshTokenFromReq(req);
  if (!refreshToken) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'refresh_missing' });
  }

  const record = await getRefreshTokenRecord(refreshToken);
  const now = new Date();
  if (!record || record.revokedAt || record.expiresAt < now) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'refresh_invalid' });
  }

  const meta = {
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };

  if (record.ownerId) {
    const owner = await prisma.owner.findUnique({
      where: { id: record.ownerId },
      select: { id: true, tokenVersion: true, tenantId: true },
    });
    if (!owner || (owner.tokenVersion ?? 0) !== record.tokenVersion) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'refresh_invalid' });
    }

    const rotated = await rotateRefreshToken(refreshToken, {
      ownerId: owner.id,
      tenantId: owner.tenantId ?? null,
      tokenVersion: owner.tokenVersion ?? 0,
      ...meta,
    });
    if (!rotated) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'refresh_invalid' });
    }
    setRefreshCookie(res, rotated.token, rotated.record.expiresAt);

    const token = signToken({
      sub: owner.id,
      role: 'owner_superadmin',
      ownerId: owner.id,
      tokenVersion: owner.tokenVersion ?? 0,
    });
    return res.json({ token, role: 'owner_superadmin' });
  }

  if (record.userId) {
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { id: true, role: true, tenantId: true, tokenVersion: true },
    });
    if (!user || (user.tokenVersion ?? 0) !== record.tokenVersion) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'refresh_invalid' });
    }

    const rotated = await rotateRefreshToken(refreshToken, {
      userId: user.id,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion ?? 0,
      ...meta,
    });
    if (!rotated) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'refresh_invalid' });
    }
    setRefreshCookie(res, rotated.token, rotated.record.expiresAt);

    const token = signToken({
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion ?? 0,
    });
    return res.json({ token, role: user.role });
  }

  clearRefreshCookie(res);
  return res.status(401).json({ error: 'refresh_invalid' });
});

router.post('/logout', async (req, res) => {
  const refreshToken = getRefreshTokenFromReq(req);
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }
  clearRefreshCookie(res);
  return res.json({ ok: true });
});

router.post('/password-reset', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    // Check if user or owner exists
    const user = await prisma.user.findUnique({ where: { email } });
    const owner = await prisma.owner.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user && !owner) {
      console.info('[password reset] email not found');
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
    console.info('[password reset] sent link');

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

router.post('/password-reset/confirm', passwordResetConfirmLimiter, async (req, res) => {
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
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
    } else if (owner) {
      await prisma.owner.update({
        where: { id: owner.id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
    } else {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { token: tokenHash },
      data: { used: true },
    });

    console.info('[password reset] password updated');
    res.json({ ok: true });
  } catch (err) {
    console.error('[password reset confirm] error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
