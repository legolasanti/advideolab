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

// Professional email template wrapper with Advideolab branding
const wrapEmailHtml = (content: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Advideolab</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); overflow: hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Advideolab</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: rgba(255, 255, 255, 0.85);">AI-Powered UGC Video Generation</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <div style="font-size: 15px; line-height: 1.6; color: #334155;">
                ${content}
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 32px 40px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" style="width: 100%;">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #1e293b;">Advideolab Team</p>
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b;">
                      <a href="https://advideolab.com" style="color: #6366f1; text-decoration: none;">advideolab.com</a>
                    </p>
                    <p style="margin: 16px 0 0 0; font-size: 12px; color: #94a3b8;">
                      © ${new Date().getFullYear()} Advideolab. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

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
  let pass: string | null = null;
  try {
    pass = system?.smtpPassEncrypted ? decrypt(system.smtpPassEncrypted) : normalizeOptional(env.SMTP_PASS);
  } catch (err) {
    console.warn('[email] failed to decrypt SMTP password, falling back to env');
    pass = normalizeOptional(env.SMTP_PASS);
  }
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

// Button style for email CTAs
const buttonStyle = `display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;`;

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
  const safePaymentUrl = paymentUrl ? sanitizeUrl(paymentUrl) : null;
  const safePaymentHref = escapeAttr(safePaymentUrl ?? '#');
  const safeVerifyUrl = verificationUrl ? sanitizeUrl(verificationUrl) : null;
  const safeVerifyHref = escapeAttr(safeVerifyUrl ?? '#');

  const subject = 'Welcome to Advideolab — Your Workspace is Ready';
  const verificationLine = verificationUrl
    ? `Verify your email to continue: ${verificationUrl}`
    : '';
  const paymentLine = paymentUrl
    ? `Complete payment here: ${paymentUrl}`
    : `Complete payment from your dashboard: ${dashboardUrl}`;
  const text = [
    `Hi ${adminEmail},`,
    '',
    `Thanks for creating ${companyName} on Advideolab! You requested the ${planName} plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).`,
    ...(verificationLine ? [verificationLine] : []),
    paymentLine,
    `You can log in anytime at ${dashboardUrl}.`,
    '',
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');

  const verificationHtml = verificationUrl
    ? `<p style="margin: 20px 0;"><a href="${safeVerifyHref}" style="${buttonStyle}">Verify Your Email</a></p>`
    : '';
  const paymentHtml = paymentUrl
    ? `<p style="margin: 20px 0;"><a href="${safePaymentHref}" style="${buttonStyle}">Complete Payment</a></p>`
    : `<p style="margin: 20px 0;"><a href="${safeDashboardHref}" style="${buttonStyle}">Go to Dashboard</a></p>`;

  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Welcome to Advideolab!</h2>
    <p>Hi ${safeAdminEmail},</p>
    <p>Thanks for creating <strong>${safeCompany}</strong> on Advideolab! You requested the <strong>${safePlan}</strong> plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).</p>
    ${verificationHtml}
    ${paymentHtml}
    <p style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
      If you have any questions, feel free to reply to this email.
    </p>
  `);
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
  const subject = 'Verify Your Email — Advideolab';
  const text = [
    `Hi ${email},`,
    '',
    'Thanks for signing up for Advideolab!',
    `Verify your email to continue: ${verifyUrl}`,
    '',
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Verify Your Email</h2>
    <p>Hi ${safeEmail},</p>
    <p>Thanks for signing up for Advideolab! Please verify your email address to activate your account.</p>
    <p style="margin: 28px 0;"><a href="${safeVerifyHref}" style="${buttonStyle}">Verify Email Address</a></p>
    <p style="color: #64748b; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
  `);
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
  const subject = `[Advideolab] New Customer Signup: ${companyName}`;
  const adminLine = adminName ? `${adminName} <${adminEmail}>` : adminEmail;
  const requestedLabel = requestedAt.toLocaleString();
  const safeCompany = escapeHtml(companyName);
  const safePlan = escapeHtml(planName);
  const safeAdminLine = escapeHtml(adminLine);
  const safeTenantsHref = escapeAttr(sanitizeUrl(tenantsUrl) ?? '#');
  const text = [
    `New customer signup!`,
    '',
    `${companyName} requested the ${planName} plan (${planMonthlyVideos} videos/mo at $${planPriceUsd}/mo).`,
    `Admin: ${adminLine}`,
    `Requested at: ${requestedLabel}`,
    `Review in the owner console: ${tenantsUrl}`,
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">New Customer Signup</h2>
    <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 12px 0;"><strong>Company:</strong> ${safeCompany}</p>
      <p style="margin: 0 0 12px 0;"><strong>Plan:</strong> ${safePlan} (${planMonthlyVideos} videos/mo at $${planPriceUsd}/mo)</p>
      <p style="margin: 0 0 12px 0;"><strong>Admin:</strong> ${safeAdminLine}</p>
      <p style="margin: 0;"><strong>Requested at:</strong> ${requestedLabel}</p>
    </div>
    <p style="margin: 24px 0;"><a href="${safeTenantsHref}" style="${buttonStyle}">Open Admin Console</a></p>
  `);
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
  const subject = 'Your Workspace is Now Active — Advideolab';
  const nextBilling = nextBillingDateLabel ? `Your next billing date is ${nextBillingDateLabel}.` : '';
  const safeCompany = escapeHtml(companyName);
  const safePlan = escapeHtml(planName);
  const safeDashboardHref = escapeAttr(sanitizeUrl(dashboardUrl) ?? '#');
  const text = [
    `Great news!`,
    '',
    `${companyName} is now active on the ${planName} plan (${planMonthlyVideos} videos/mo for $${planPriceUsd}/month).`,
    nextBilling,
    `Start creating videos: ${dashboardUrl}`,
    '',
    'Best regards,',
    'The Advideolab Team',
  ]
    .filter(Boolean)
    .join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Your Workspace is Active!</h2>
    <p>Great news! <strong>${safeCompany}</strong> is now active on the <strong>${safePlan}</strong> plan.</p>
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #166534;">Plan Details</p>
      <p style="margin: 0; color: #166534;">${planMonthlyVideos} videos/month • $${planPriceUsd}/month</p>
      ${nextBilling ? `<p style="margin: 8px 0 0 0; color: #166534; font-size: 14px;">${escapeHtml(nextBilling)}</p>` : ''}
    </div>
    <p style="margin: 24px 0;"><a href="${safeDashboardHref}" style="${buttonStyle}">Start Creating Videos</a></p>
  `);
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
  const subject = `[Advideolab] New Contact Message from ${name}`;
  const text = [`Name: ${name}`, `Email: ${email}`, `Company: ${company ?? '—'}`, `Source: ${source}`, '', message].join('\n');
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const mailtoHref = escapeAttr(sanitizeUrl(`mailto:${email}`, new Set(['mailto:'])) ?? '#');
  const safeCompany = company ? escapeHtml(company) : '—';
  const safeSource = escapeHtml(source);
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">New Contact Message</h2>
    <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 12px 0;"><strong>Name:</strong> ${safeName}</p>
      <p style="margin: 0 0 12px 0;"><strong>Email:</strong> <a href="${mailtoHref}" style="color: #6366f1;">${safeEmail}</a></p>
      <p style="margin: 0 0 12px 0;"><strong>Company:</strong> ${safeCompany}</p>
      <p style="margin: 0;"><strong>Source:</strong> ${safeSource}</p>
    </div>
    <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">Message:</p>
      <p style="margin: 0; color: #475569;">${safeMessage}</p>
    </div>
    <p><a href="${mailtoHref}" style="${buttonStyle}">Reply to ${safeName}</a></p>
  `);
  return { subject, text, html };
};

const buildContactConfirmationEmail = ({
  name,
}: {
  name: string;
}): EmailTemplate => {
  const safeName = escapeHtml(name);
  const subject = 'We Received Your Message — Advideolab';
  const text = [
    `Hi ${name},`,
    '',
    'Thank you for reaching out to Advideolab! We have received your message and will get back to you as soon as possible.',
    '',
    'In the meantime, feel free to explore our platform and create amazing UGC videos.',
    '',
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Thank You for Contacting Us!</h2>
    <p>Hi ${safeName},</p>
    <p>Thank you for reaching out to Advideolab! We have received your message and will get back to you as soon as possible.</p>
    <p>In the meantime, feel free to explore our platform and create amazing UGC videos.</p>
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0; color: #0369a1; font-size: 14px;">
        <strong>Our typical response time:</strong> Within 24 hours on business days.
      </p>
    </div>
    <p style="margin-top: 24px;"><a href="https://advideolab.com" style="${buttonStyle}">Visit Our Website</a></p>
  `);
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
  const subject = 'Subscription Cancellation Confirmed — Advideolab';
  const text = [
    `We have received your cancellation request for ${companyName}.`,
    `Plan: ${planName}`,
    `Your subscription will end on ${effectiveDateLabel}.`,
    '',
    `You will continue to have access until that date, and no further charges will be made afterward.`,
    `If you change your mind, you can re-subscribe from your dashboard: ${dashboardUrl}`,
    '',
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Cancellation Confirmed</h2>
    <p>We have received your cancellation request for <strong>${safeCompany}</strong>.</p>
    <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0;"><strong>Plan:</strong> ${safePlan}</p>
      <p style="margin: 0;"><strong>Access until:</strong> ${safeEffective}</p>
    </div>
    <p>You will continue to have access until that date, and no further charges will be made afterward.</p>
    <p>We're sorry to see you go! If you change your mind, you can always re-subscribe from your dashboard.</p>
    <p style="margin: 24px 0;"><a href="${safeDashboardHref}" style="${buttonStyle}">Manage Subscription</a></p>
  `);
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
}): Promise<boolean> => {
  const effectiveDateLabel = effectiveDate.toLocaleDateString();
  const template = buildSubscriptionCancelledEmail({
    companyName,
    planName,
    effectiveDateLabel,
    dashboardUrl: `${env.WEB_BASE_URL}/settings`,
  });
  return sendMail({
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
  if (!target) {
    throw new Error('Notification email not configured');
  }
  const template = buildOwnerContactEmail({ name, email, company, message, source });
  const sent = await sendMail({
    to: target,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'contact');
  if (!sent) {
    throw new Error('Failed to send contact notification');
  }
};

export const sendContactConfirmation = async ({
  email,
  name,
}: {
  email: string;
  name: string;
}) => {
  const template = buildContactConfirmationEmail({ name });
  return sendMail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  }, 'contact_confirmation');
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
  const subject = sanitizeHeaderValue(`Your Video is Ready: ${productName}`);
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
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Your Video is Ready!</h2>
    <p>Great news! Your UGC video for <strong>"${safeProduct}"</strong> has been generated successfully.</p>
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
      <p style="margin: 0 0 16px 0; font-size: 16px; color: #166534;">Your video is ready to download!</p>
      <a href="${safeVideoHref}" style="${buttonStyle}">View Your Video</a>
    </div>
    <p style="color: #64748b; font-size: 14px;">Or <a href="${safeDashboardHref}" style="color: #6366f1;">visit your dashboard</a> to see all your videos.</p>
  `);
  return { subject, text, html };
};

const buildPasswordResetEmail = ({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}): EmailTemplate => {
  const subject = 'Reset Your Password — Advideolab';
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
    'Best regards,',
    'The Advideolab Team',
  ].join('\n');
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Reset Your Password</h2>
    <p>You requested a password reset for your account (<strong>${safeEmail}</strong>).</p>
    <p style="margin: 28px 0;"><a href="${safeResetHref}" style="${buttonStyle}">Reset Password</a></p>
    <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 16px; margin: 24px 0;">
      <p style="margin: 0; color: #92400e; font-size: 14px;">This link will expire in 1 hour.</p>
    </div>
    <p style="color: #64748b; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
  `);
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
  const html = wrapEmailHtml(`
    <h2 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 600; color: #1e293b;">Email Test Successful</h2>
    <p>This is a test email from your Advideolab instance.</p>
    <p>If you received this, your email configuration is working correctly!</p>
  `);
  const ok = await sendMail({
    to: target,
    subject: '[Advideolab] Email Configuration Test',
    text: 'Testing SMTP integration from Advideolab.',
    html,
  }, 'email_test');
  if (ok) {
    console.info('[email][health] send ok');
  } else {
    console.error('[email][health] send failed');
  }
  return ok;
};
