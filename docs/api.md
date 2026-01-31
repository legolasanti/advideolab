# API Reference (MVP)

This document summarizes the public API surface for the UGC Video Generator. All routes are prefixed with `/api`.

## Authentication

- Access tokens are JWTs sent as `Authorization: Bearer <token>`.
- Refresh tokens are issued as an `HttpOnly` cookie named `refresh_token` and rotated on every refresh.
- For cross-origin local development, requests must send credentials (cookies).

### Session Endpoints

| Method | Path | Description | Auth |
| --- | --- | --- | --- |
| POST | `/auth/login` | Email/password login. Returns access token + role. | No |
| POST | `/auth/signup` | Create tenant + tenant admin, send verification email. | No |
| POST | `/auth/verify-email` | Verify email with token and issue access token. | No |
| POST | `/auth/verify-email/resend` | Re-send verification email. | No |
| GET | `/auth/me` | Return current user/tenant or owner profile. | Yes |
| POST | `/auth/refresh` | Rotate refresh token and return new access token. | No (cookie) |
| POST | `/auth/logout` | Revoke refresh token + clear cookie. | No (cookie) |
| POST | `/auth/password-reset` | Send reset email (always returns ok). | No |
| POST | `/auth/password-reset/confirm` | Confirm reset with token. | No |
| GET | `/auth/google` | Start Google OAuth. Returns URL. | No |
| GET | `/auth/google/callback` | OAuth redirect handler (sets refresh cookie, redirects to web). | No |

## Tenant App (Authenticated)

### Usage / Quotas

| Method | Path | Description |
| --- | --- | --- |
| GET | `/usage` | Current quota stats + billing cycle data. |

### Video Jobs

| Method | Path | Description |
| --- | --- | --- |
| POST | `/videos` | Create a new video job (multipart upload). |
| GET | `/videos/jobs` | List tenant jobs with pagination + status filter. |
| GET | `/videos/jobs/:id` | Get a single job (tenant-scoped). |
| POST | `/videos/jobs/:id/callback` | n8n callback to finalize a job. |
| POST | `/videos/jobs/:id/rerun` | Re-run a job using stored input asset. |

Create job (multipart) expected fields:
- `file` (image/png or image/jpeg)
- `script_language`, `platform_focus`, `vibe`, `voice_profile`
- `call_to_action`, `video_count`, `creative_brief`
- `creator_gender`, `creator_age_range`

### UGC Jobs (Tenant Side)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/ugc/uploads/hero` | Upload hero image for UGC workspace. |
| POST | `/ugc/jobs` | Create UGC job using stored image URL. |
| GET | `/ugc/jobs` | List UGC jobs for tenant. |
| GET | `/ugc/jobs/:jobId` | Fetch UGC job. |
| POST | `/ugc/jobs/:jobId/upload-video` | Upload finished video to finalize job. |

### Tenant Billing

| Method | Path | Description |
| --- | --- | --- |
| POST | `/tenant/billing/checkout` | Create Stripe checkout for tenant. |
| POST | `/tenant/billing/portal` | Create Stripe billing portal session. |
| POST | `/tenant/billing/cancel` | Schedule subscription cancel + capture reason. |
| POST | `/tenant/billing/stripe/finalize` | Finalize Stripe session (manual). |
| POST | `/tenant/plan-request` | Request a plan change. |

### Tenant Admin Settings

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/settings` | Fetch tenant settings. |
| POST | `/admin/settings` | Update settings + optional logo upload. |
| GET | `/admin/users` | List tenant users. |
| POST | `/admin/users` | Invite or remove tenant users. |
| GET | `/admin/apikeys` | List tenant API keys. |
| POST | `/admin/apikeys` | Upsert tenant API key. |
| POST | `/admin/n8n` | Update tenant n8n config. |

## Owner Console (Authenticated)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/owner/tenants` | List all tenants with plan + usage. |
| POST | `/owner/tenants/:tenantId/approve-plan` | Approve/activate plan with billing metadata. |
| POST | `/owner/tenants/:tenantId/plan` | Force plan change + activate. |
| POST | `/owner/tenants/:tenantId/reset` | Reset quota usage. |
| POST | `/owner/tenants/:tenantId/suspend` | Suspend or unsuspend tenant. |
| POST | `/owner/tenants/:tenantId/billing` | Update billing state. |
| POST | `/owner/tenants/:tenantId/unlimited` | Toggle unlimited videos. |
| POST | `/owner/impersonate` | Create tenant impersonation token. |
| GET | `/owner/notifications` | List admin notifications. |
| POST | `/owner/notifications/:notificationId/read` | Mark notification read. |
| GET | `/owner/cms/:section` | Read CMS section. |
| PUT | `/owner/cms/:section/:key` | Update CMS key. |
| GET | `/owner/blog` | List blog posts. |
| POST | `/owner/blog` | Create blog post. |
| PUT | `/owner/blog/:id` | Update blog post. |
| DELETE | `/owner/blog/:id` | Delete blog post. |
| GET | `/owner/coupons` | List coupons. |
| POST | `/owner/coupons` | Create coupon. |
| DELETE | `/owner/coupons/:id` | Delete coupon. |
| GET | `/owner/api-keys` | List global API keys. |
| POST | `/owner/api-keys` | Upsert global API key. |
| DELETE | `/owner/api-keys/:provider` | Delete global API key. |
| GET | `/owner/n8n-config` | Read global n8n config. |
| PUT | `/owner/n8n-config` | Update global n8n config. |
| GET | `/owner/analytics` | Owner analytics dashboard data. |
| GET | `/owner/users` | List all users across tenants. |
| GET | `/owner/system-config` | Read system config. |
| PUT | `/owner/system-config` | Update system config. |
| POST | `/owner/stripe/bootstrap` | Auto-create Stripe prices. |
| POST | `/owner/system-config/test-email` | Send test email. |
| GET | `/owner/showcase-videos` | List showcase videos. |
| POST | `/owner/showcase-videos` | Create showcase video. |
| PUT | `/owner/showcase-videos/:id` | Update showcase video. |
| DELETE | `/owner/showcase-videos/:id` | Delete showcase video. |
| POST | `/owner/showcase-videos/reorder` | Reorder showcase videos. |
| POST | `/owner/ugc/uploads/hero` | Upload owner UGC hero image. |
| POST | `/owner/ugc/jobs` | Create owner UGC job (sandbox tenant). |
| GET | `/owner/ugc/jobs` | List owner UGC jobs. |
| GET | `/owner/ugc/jobs/:jobId` | Get owner UGC job. |

## Public / Marketing

| Method | Path | Description |
| --- | --- | --- |
| GET | `/public/cms/:section` | Public CMS section for marketing pages. |
| GET | `/public/system-config` | Public system config (for client). |
| POST | `/public/analytics/event` | Capture marketing analytics event. |
| POST | `/public/contact` | Contact form submission. |
| GET | `/public/blog` | List public blog posts. |
| GET | `/public/blog/:slug` | Fetch public blog post. |
| GET | `/public/showcase-videos` | Public showcase videos. |
| POST | `/public/coupons/validate` | Validate coupon code. |

## Health & Webhooks

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | API + DB health (owner-only in prod). |
| GET | `/health/email-test` | SMTP test (owner-only). |
| POST | `/billing/stripe/webhook` | Stripe webhook receiver (raw body). |

## Error Responses

Common errors return `{"error": "<code>"}` with optional `message` or `details`. Rate limits return 429.

## Notes

- `/videos/jobs/:id/callback` requires `x-callback-token` and is intentionally opaque (404 on invalid tokens).
- `/auth/refresh` expects the `refresh_token` cookie; the access token is returned in JSON.
