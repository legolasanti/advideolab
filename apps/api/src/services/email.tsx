import nodemailer from 'nodemailer';
import { Plan } from '@prisma/client';
import type { Tenant, User } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { decrypt } from '../lib/crypto';

const SYSTEM_CONFIG_ID = 'singleton';

type EmailStatus = {
  configured: boolean;
  missing: string[];
  notificationEmail: string | null;
};

type ResolvedEmailConfig = {
  smtp:
    | {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
        from: string;
      }
    | null;
  notificationEmail: string | null;
  missing: string[];
};

const getSystemConfig = async () => {
  try {
    return await prisma.systemConfig.upsert({
      where: { id: SYSTEM_CONFIG_ID },
      update: {},
      create: { id: SYSTEM_CONFIG_ID },
    });
  } catch (err) {
    console.warn('[email] failed to load SystemConfig; falling back to env');
    return null;
  }
};

const normalizeOptional = (value?: string | null) => (value && value.trim().length > 0 ? value.trim() : null);

const sanitizeHeaderValue = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return match;
    }
  });

const escapeAttr = escapeHtml;

const sanitizeUrl = (raw: string, allowedProtocols: ReadonlySet<string> = new Set(['https:', 'http:'])) => {
  try {
    const parsed = new URL(raw);
    if (!allowedProtocols.has(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_err) {
    return null;
  }
};

const resolveEmailConfig = async (): Promise<ResolvedEmailConfig> => {
  const system = await getSystemConfig();

  const host = normalizeOptional(system?.smtpHost) ?? normalizeOptional(env.SMTP_HOST);
  const port = system?.smtpPort ?? (env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587);
  const user = normalizeOptional(system?.smtpUser) ?? normalizeOptional(env.SMTP_USER);
  const pass = system?.smtpPassEncrypted ? decrypt(system.smtpPassEncrypted) : normalizeOptional(env.SMTP_PASS);
  const from = normalizeOptional(system?.emailFrom) ?? normalizeOptional(env.EMAIL_FROM);
  const notificationEmail =
    normalizeOptional(system?.notificationEmail) ?? normalizeOptional(env.ownerNotificationEmail);

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');
  if (!from) missing.push('EMAIL_FROM');

  if (missing.length > 0) {
    return { smtp: null, notificationEmail, missing };
  }

  return {
    smtp: {
      host: host!,
      port,
      secure: port === 465,
      user: user!,
      pass: pass!,
      from: from!,
    },
    notificationEmail,
    missing,
  };
};

export const getEmailStatus = async (): Promise<EmailStatus> => {
  const config = await resolveEmailConfig();
  return {
    configured: Boolean(config.smtp),
    missing: config.missing,
    notificationEmail: config.notificationEmail,
  };
};

const sendMail = async (options: nodemailer.SendMailOptions, templateName?: string) => {
  const config = await resolveEmailConfig();
  const details = env.isProd
    ? { templateName }
    : {
        templateName,
        subject: sanitizeHeaderValue(String(options.subject ?? '')),
        to: options.to,
      };
  if (!config.smtp) {
    console.warn('[email] skipping send; SMTP not configured', { missing: config.missing, ...details });
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  console.info('[email] sending', details);
  try {
    await transporter.sendMail({
      from: sanitizeHeaderValue(config.smtp.from),
      ...options,
      subject: sanitizeHeaderValue(String(options.subject ?? '')),
    });
    console.info('[email] sent', details);
    return true;
  } catch (err) {
    console.error('[email] send failed', { ...details, error: err });
    return false;
  }
};

type EmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

const buildCustomerPendingEmail = ({
  companyName,
  adminEmail,
  planName,
  planMonthlyVideos,
  planPriceUsd,
  dashboardUrl,
  paymentUrl,
  verificationUrl,
}: {
  companyName: string;
  adminEmail: string;
  planName: string;
  planMonthlyVideos: number;
  planPriceUsd: number;
  dashboardUrl: string;
  paymentUrl?: string;
  verificationUrl?: string;
}): EmailTemplate => {
  const safeCompany = escapeHtml(companyName);
  const safeAdminEmail = escapeHtml(adminEmail);
  const safePlan = escapeHtml(planName);
  const safeDashboardHref = escapeAttr(sanitizeUrl(dashboardUrl) ?? '#');
  const safeDashboardLabel = escapeHtml(dashboardUrl);
  const safePaymentUrl = paymentUrl ? sanitizeUrl(paymentUrl) : null;
  const safePaymentHref = escapeAttr(safePaymentUrl ?? '#');
  const safePaymentLabel = paymentUrl ? escapeHtml(paymentUrl) : '';
  const safeVerifyUrl = verificationUrl ? sanitizeUrl(verificationUrl) : null;
  const safeVerifyHref = escapeAttr(safeVerifyUrl ?? '#');
  const safeVerifyLabel = verificationUrl ? escapeHtml(verificationUrl) : '';

  const subject = 'Welcome — your workspace is pending approval';
  const verificationLine = verificationUrl
    ? `Verify your email to continue: ${verificationUrl}`
    : '';
  const paymentLine = paymentUrl
    ? `Complete payment here: ${paymentUrl}`
    : `Complete payment from your dashboard: ${dashboardUrl}`;
  const text = [
    `Hi ${adminEmail},`,
    '',
    `Thanks for creating ${companyName} on UGC Studio. You requested the ${planName} plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).`,
    ...(verificationLine ? [verificationLine] : []),
    paymentLine,
    `You can log in anytime at ${dashboardUrl}.`,
    '',
    '— The UGC Studio Team',
  ].join('\n');
  const verificationHtml = verificationUrl
    ? `<p>Verify your email to continue: <a href="${safeVerifyHref}">${safeVerifyLabel}</a></p>`
    : '';
  const paymentHtml = paymentUrl
    ? `<p>Complete payment here: <a href="${safePaymentHref}">${safePaymentLabel}</a></p>`
    : `<p>Complete payment from your dashboard: <a href="${safeDashboardHref}">${safeDashboardLabel}</a></p>`;
  const html = `
    <p>Hi ${safeAdminEmail},</p>
    <p>Thanks for creating <strong>${safeCompany}</strong> on UGC Studio. You requested the <strong>${safePlan}</strong> plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).</p>
    ${verificationHtml}
    ${paymentHtml}
    <p>You can log in anytime at <a href="${safeDashboardHref}">${safeDashboardLabel}</a>.</p>
    <p>— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

const buildEmailVerificationEmail = ({
  email,
  verifyUrl,
}: {
  email: string;
  verifyUrl: string;
}): EmailTemplate => {
  const safeEmail = escapeHtml(email);
  const safeVerifyHref = escapeAttr(sanitizeUrl(verifyUrl) ?? '#');
  const safeVerifyLabel = escapeHtml(verifyUrl);
  const subject = 'Verify your email to activate your workspace';
  const text = [
    `Hi ${email},`,
    '',
    'Thanks for signing up for UGC Studio.',
    `Verify your email to continue: ${verifyUrl}`,
    '',
    '— The UGC Studio Team',
  ].join('\n');
  const html = `
    <p>Hi ${safeEmail},</p>
    <p>Thanks for signing up for UGC Studio.</p>
    <p>Verify your email to continue: <a href="${safeVerifyHref}">${safeVerifyLabel}</a></p>
    <p>— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

const buildOwnerNewSignupEmail = ({
  companyName,
  adminEmail,
  adminName,
  planName,
  planMonthlyVideos,
  planPriceUsd,
  tenantsUrl,
  requestedAt,
}: {
  companyName: string;
  adminEmail: string;
  adminName?: string;
  planName: string;
  planMonthlyVideos: number;
  planPriceUsd: number;
  tenantsUrl: string;
  requestedAt: Date;
}): EmailTemplate => {
  const subject = `[UGC Studio] New customer signup`;
  const adminLine = adminName ? `${adminName} <${adminEmail}>` : adminEmail;
  const requestedLabel = requestedAt.toLocaleString();
  const safeCompany = escapeHtml(companyName);
  const safePlan = escapeHtml(planName);
  const safeAdminLine = escapeHtml(adminLine);
  const safeTenantsHref = escapeAttr(sanitizeUrl(tenantsUrl) ?? '#');
  const text = [
    `${companyName} requested the ${planName} plan (${planMonthlyVideos} videos/mo at $${planPriceUsd}/mo).`,
    `Admin: ${adminLine}`,
    `Requested at: ${requestedLabel}`,
    `Review in the owner console: ${tenantsUrl}`,
  ].join('\n');
  const html = `
    <p><strong>${safeCompany}</strong> requested the <strong>${safePlan}</strong> plan (${planMonthlyVideos} videos/mo at $${planPriceUsd}/mo).</p>
    <p>Admin: ${safeAdminLine}</p>
    <p>Requested at: ${requestedLabel}</p>
    <p><a href="${safeTenantsHref}">Open owner console →</a></p>
  `;
  return { subject, text, html };
};

const buildTenantActivatedEmail = ({
  companyName,
  planName,
  planMonthlyVideos,
  planPriceUsd,
  nextBillingDateLabel,
  dashboardUrl,
}: {
  companyName: string;
  planName: string;
  planMonthlyVideos: number;
  planPriceUsd: number;
  nextBillingDateLabel?: string;
  dashboardUrl: string;
}): EmailTemplate => {
  const subject = 'Your workspace is now active';
  const nextBilling = nextBillingDateLabel ? `Your next billing date is ${nextBillingDateLabel}.` : '';
  const safeCompany = escapeHtml(companyName);
  const safePlan = escapeHtml(planName);
  const safeDashboardHref = escapeAttr(sanitizeUrl(dashboardUrl) ?? '#');
  const text = [
    `Great news – ${companyName} is now active on the ${planName} plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).`,
    nextBilling,
    `Start creating videos: ${dashboardUrl}`,
    '',
    '— The UGC Studio Team',
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <p>Great news – <strong>${safeCompany}</strong> is now active on the <strong>${safePlan}</strong> plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).</p>
    ${nextBilling ? `<p>${escapeHtml(nextBilling)}</p>` : ''}
    <p><a href="${safeDashboardHref}">Launch UGC Studio →</a></p>
    <p>— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

const buildOwnerContactEmail = ({
  name,
  email,
  company,
  message,
  source,
}: {
  name: string;
  email: string;
  company?: string;
  message: string;
  source: string;
}): EmailTemplate => {
  const subject = `[UGC Studio] New contact message`;
  const text = [`Name: ${name}`, `Email: ${email}`, `Company: ${company ?? '—'}`, `Source: ${source}`, '', message].join('\n');
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const mailtoHref = escapeAttr(sanitizeUrl(`mailto:${email}`, new Set(['mailto:'])) ?? '#');
  const safeCompany = company ? escapeHtml(company) : '—';
  const safeSource = escapeHtml(source);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const html = `
    <p><strong>${safeName}</strong> sent a new message from ${safeSource}.</p>
    <p>Email: <a href="${mailtoHref}">${safeEmail}</a></p>
    <p>Company: ${safeCompany}</p>
    <p><strong>Message</strong></p>
    <p>${safeMessage}</p>
  `;
  return { subject, text, html };
};

const buildSubscriptionCancelledEmail = ({
  companyName,
  planName,
  effectiveDateLabel,
  dashboardUrl,
}: {
  companyName: string;
  planName: string;
  effectiveDateLabel: string;
  dashboardUrl: string;
}): EmailTemplate => {
  const safeCompany = escapeHtml(companyName);
  const safePlan = escapeHtml(planName);
  const safeEffective = escapeHtml(effectiveDateLabel);
  const safeDashboardHref = escapeAttr(sanitizeUrl(dashboardUrl) ?? '#');
  const subject = 'Your subscription has been scheduled to cancel';
  const text = [
    `We have received your cancellation request for ${companyName}.`,
    `Plan: ${planName}`,
    `Your subscription will end on ${effectiveDateLabel}.`,
    '',
    `You will continue to have access until that date, and no further charges will be made afterward.`,
    `If you change your mind, you can re-subscribe from your dashboard: ${dashboardUrl}`,
    '',
    '— The UGC Studio Team',
  ].join('\n');
  const html = `
    <p>We have received your cancellation request for <strong>${safeCompany}</strong>.</p>
    <p>Plan: <strong>${safePlan}</strong></p>
    <p>Your subscription will end on <strong>${safeEffective}</strong>.</p>
    <p>You will continue to have access until that date, and no further charges will be made afterward.</p>
    <p><a href="${safeDashboardHref}">Manage your subscription →</a></p>
    <p>— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

export const sendOwnerSignupNotification = async ({
  tenant,
  user,
  plan,
  adminName,
}: {
  tenant: Tenant;
  user: User;
  plan: Plan;
  adminName?: string;
}) => {
  const { notificationEmail: target } = await resolveEmailConfig();
  if (!target) return;
  const template = buildOwnerNewSignupEmail({
    companyName: tenant.name,
    adminEmail: user.email,
    adminName,
    planName: plan.name,
    planMonthlyVideos: plan.monthlyVideoLimit,
    planPriceUsd: plan.monthlyPriceUsd,
    tenantsUrl: `${env.WEB_BASE_URL}/owner/tenants`,
    requestedAt: new Date(),
  });
  await sendMail({
    to: target,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'owner_signup');
};

export const sendCustomerSignupConfirmation = async ({
  tenant,
  user,
  plan,
  paymentUrl,
  verificationUrl,
}: {
  tenant: Tenant;
  user: User;
  plan: Plan;
  paymentUrl?: string | null;
  verificationUrl?: string | null;
}) => {
  const template = buildCustomerPendingEmail({
    companyName: tenant.name,
    adminEmail: user.email,
    planName: plan.name,
    planMonthlyVideos: plan.monthlyVideoLimit,
    planPriceUsd: plan.monthlyPriceUsd,
    dashboardUrl: `${env.WEB_BASE_URL}/login`,
    paymentUrl: paymentUrl ?? undefined,
    verificationUrl: verificationUrl ?? undefined,
  });
  await sendMail({
    to: user.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'customer_signup');
};

export const sendEmailVerification = async ({
  email,
  verifyUrl,
}: {
  email: string;
  verifyUrl: string;
}) => {
  const template = buildEmailVerificationEmail({ email, verifyUrl });
  await sendMail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'email_verification');
};

export const sendPlanApprovedNotification = async ({
  tenant,
  user,
  plan,
  nextBillingDate,
}: {
  tenant: Tenant;
  user: User;
  plan: Plan;
  nextBillingDate?: Date | null;
}) => {
  const formattedDate = nextBillingDate ? new Date(nextBillingDate).toLocaleDateString() : undefined;
  const template = buildTenantActivatedEmail({
    companyName: tenant.name,
    planName: plan.name,
    planMonthlyVideos: plan.monthlyVideoLimit,
    planPriceUsd: plan.monthlyPriceUsd,
    nextBillingDateLabel: formattedDate,
    dashboardUrl: `${env.WEB_BASE_URL}/new-video`,
  });
  await sendMail({
    to: user.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'plan_approved');
};

export const sendSubscriptionCancelledEmail = async ({
  email,
  companyName,
  planName,
  effectiveDate,
}: {
  email: string;
  companyName: string;
  planName: string;
  effectiveDate: Date;
}) => {
  const effectiveDateLabel = effectiveDate.toLocaleDateString();
  const template = buildSubscriptionCancelledEmail({
    companyName,
    planName,
    effectiveDateLabel,
    dashboardUrl: `${env.WEB_BASE_URL}/settings`,
  });
  await sendMail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'subscription_cancelled');
};

export const sendOwnerContactNotification = async ({
  name,
  email,
  company,
  message,
  source,
}: {
  name: string;
  email: string;
  company?: string;
  message: string;
  source: string;
}) => {
  const { notificationEmail: target } = await resolveEmailConfig();
  if (!target) return;
  const template = buildOwnerContactEmail({ name, email, company, message, source });
  await sendMail({
    to: target,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'contact');
};

const buildJobCompletedEmail = ({
  productName,
  jobId,
  videoUrl,
  dashboardUrl,
}: {
  productName: string;
  jobId: string;
  videoUrl: string;
  dashboardUrl: string;
}): EmailTemplate => {
  const subject = sanitizeHeaderValue(`Your video is ready: ${productName}`);
  const safeProduct = escapeHtml(productName);
  const safeVideoHref = escapeAttr(sanitizeUrl(videoUrl) ?? '#');
  const safeDashboardHref = escapeAttr(sanitizeUrl(dashboardUrl) ?? '#');
  const text = [
    `Great news!`,
    '',
    `Your UGC video for "${productName}" has been generated successfully.`,
    '',
    `View and download your video:`,
    videoUrl,
    '',
    `Or visit your dashboard:`,
    dashboardUrl,
    '',
    '— The UGC Studio Team',
  ].join('\n');
  const html = `
    <p><strong>Great news!</strong></p>
    <p>Your UGC video for <strong>"${safeProduct}"</strong> has been generated successfully.</p>
    <p><a href="${safeVideoHref}" style="display: inline-block; background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 8px;">View Your Video →</a></p>
    <p style="margin-top: 16px;">Or <a href="${safeDashboardHref}">visit your dashboard</a> to see all your videos.</p>
    <p style="margin-top: 24px; color: #64748b;">— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

const buildPasswordResetEmail = ({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}): EmailTemplate => {
  const subject = 'Reset your password';
  const safeEmail = escapeHtml(email);
  const safeResetHref = escapeAttr(sanitizeUrl(resetUrl) ?? '#');
  const text = [
    `Hi,`,
    '',
    `You requested a password reset for your account (${email}).`,
    `Click the link below to reset your password:`,
    resetUrl,
    '',
    `This link will expire in 1 hour.`,
    `If you didn't request this, you can safely ignore this email.`,
    '',
    '— The UGC Studio Team',
  ].join('\n');
  const html = `
    <p>Hi,</p>
    <p>You requested a password reset for your account (<strong>${safeEmail}</strong>).</p>
    <p><a href="${safeResetHref}">Reset your password →</a></p>
    <p>This link will expire in 1 hour.</p>
    <p>If you didn't request this, you can safely ignore this email.</p>
    <p>— The UGC Studio Team</p>
  `;
  return { subject, text, html };
};

export const sendJobCompletedEmail = async ({
  email,
  productName,
  jobId,
  videoUrl,
}: {
  email: string;
  productName: string;
  jobId: string;
  videoUrl: string;
}) => {
  const dashboardUrl = `${env.WEB_BASE_URL}/jobs?jobId=${jobId}`;
  const template = buildJobCompletedEmail({ productName, jobId, videoUrl, dashboardUrl });
  return await sendMail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'job_completed');
};

export const sendPasswordResetEmail = async ({
  email,
  resetToken,
}: {
  email: string;
  resetToken: string;
}) => {
  const resetUrl = `${env.WEB_BASE_URL}/reset-password?token=${resetToken}`;
  const template = buildPasswordResetEmail({ email, resetUrl });
  return await sendMail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'password_reset');
};

export const sendEmailTest = async () => {
  const { notificationEmail: target } = await resolveEmailConfig();
  if (!target) {
    console.warn('[email] test skipped; notificationEmail missing');
    return false;
  }
  const ok = await sendMail({
    to: target,
    subject: '[UGC Studio] Email test',
    text: 'Testing Brevo SMTP integration from /health/email-test.',
    html: '<p>Testing Brevo SMTP integration from <strong>/health/email-test</strong>.</p>',
  }, 'email_test');
  if (ok) {
    console.info('[email][health] send ok');
  } else {
    console.error('[email][health] send failed');
  }
  return ok;
};
