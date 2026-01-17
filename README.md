# Multi-tenant UGC Video Generator

This monorepo contains everything needed to run a modern SaaS for AI-powered UGC video generation. Each tenant gets isolated auth, quota, branding, and their own n8n workflow. The stack ships with:

- **API** – Node.js + Express + Prisma + PostgreSQL + JWT + S3-compatible storage.
- **Web** – React + Vite + Tailwind with multi-role UI (tenant admin/user + owner super-admin).
- **Infra** – Docker Compose stack with Traefik (TLS), Postgres, MinIO, optional Sharp-based compose microservice, and ready-to-seed data.

## Requirements

- Node 20+
- npm 10+
- Docker & Docker Compose v2

## Getting Started (local dev)

1. **Install dependencies**
   ```bash
   cd apps/api && npm install
   cd ../web && npm install
   cd ../../docker/compose-service && npm install
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Adjust values (database URL, MinIO creds, Cloudinary keys if using overlays, etc.).

3. **Database**
   ```bash
   cd apps/api
   npx prisma migrate dev
   npm run prisma:seed:dev
   ```
   Use `npm run prisma:seed` only after running `npm run build` (the compiled seed lives in `dist/`) or when executing inside the Docker image.

4. **Run API**
   ```bash
   npm run dev
   ```

5. **Run Web**
   ```bash
   cd ../web
   npm run dev -- --host
   ```

6. **Compose microservice (if USE_CLOUDINARY=false)**
   ```bash
   cd docker/compose-service
   npm start
   ```

### Seeding
Seed script creates:
| Type | Credentials | Notes |
| --- | --- | --- |
| Owner | `owner@example.com` / `Owner2025!` | Full access to manage tenants/plans |
| Tenant admin | `admin@customer1.com` / `Customer1Video!` | Assigned to tenant `customer1` on the Starter plan |

Tenant `customer1` starts on the **Starter** plan (10 videos/month) with its placeholder n8n endpoint and zero usage.

### Default Plans
| Plan | Code | Price (USD/mo) | Monthly videos |
| --- | --- | --- | --- |
| Starter | `starter` | 69 | 10 |
| Growth | `growth` | 179 | 30 |
| Scale | `scale` | 499 | 100 |

## Video job API & quota enforcement

- Tenant-side video jobs are created via `POST /api/videos` (multipart: `file` + JSON fields like `script_language`, `platform_focus`, etc.).
- The backend reloads the tenant, ensures they are not suspended, and verifies `videosUsedThisCycle < monthlyVideoLimit`. If quota is exceeded the request returns:
  ```json
  {
    "error": "quota_exceeded",
    "message": "Your monthly video limit is reached. Please upgrade your plan or wait until the next cycle."
  }
  ```
- Usage is incremented only after n8n finishes the job (when the callback succeeds) so failed jobs do not burn credits.
- `Tenant.monthlyVideoLimit`, `Tenant.videosUsedThisCycle`, and `Tenant.billingCycleStart` drive the quota UI + owner reporting. Owners can update plans with `POST /api/owner/tenants/:id/plan` and reset usage via `POST /api/owner/tenants/:id/reset`. `GET /api/owner/tenants` surfaces plan name/code, limits, usage, and primary tenant-admin contact email.

### n8n payload contract

Every call to n8n is multipart with the sanitized `file` upload and the following JSON payload (also duplicated across top-level form fields for backwards compatibility):

```json
{
  "job_id": "job_cuid",
  "tenant_id": "tenant_cuid",
  "webhook_base": "https://api.example.com",
  "script_language": "en-US",
  "platform_focus": "tiktok_vertical",
  "vibe": "future_retail",
  "voice_profile": "creator_next_door",
  "call_to_action": "shop_now",
  "video_count": 1,
  "creative_brief": "fast cuts, UGC style",
  "creator_gender": "female",
  "creator_age_range": "25-35",
  "apikeys": {
    "openai": "****",
    "elevenlabs": "****"
  },
  "input_assets": {
    "image_url": "https://cdn…/input/job.png",
    "thumbnail_url": "https://cdn…/input/job-thumb.jpg",
    "reference_video": null
  }
}
```

### Callback contract

n8n must POST to the `callback_url` provided in the job payload and include the per-job callback token in the `x-callback-token` header (value: `callback_token`) with:

```json
{
  "status": "done",
  "outputs": [
    {
      "url": "https://cdn…/render.mp4",
      "type": "video/mp4",
      "size": 12345678
    }
  ]
}
```

Notes:
- The callback is authenticated via the per-job token. Prefer sending `x-callback-token` (headers are less likely to be logged than query params).
- The API will download each `outputs[].url` and re-upload it to the configured object storage/CDN.

Use `status: "error"` with an optional `"errorMessage"` string if the workflow fails. Successful callbacks store each output as an Asset record, mark the Job as done, and increment the tenant's `videosUsedThisCycle`.

## Docker deployment

The provided `docker-compose.yml` spins up:

- `traefik` with Let’s Encrypt certificates for `example.com`
- `api` (Express)
- `web` (Vite preview serving the built React app)
- `db` (Postgres)
- `minio` (+ console)
- `compose` (Sharp overlay microservice)

Set real secrets (especially `JWT_SECRET`, `ENCRYPTION_KEY`, and ACME email) before running:

```bash
docker compose up -d --build
```

After the images are built, run database migrations and seeds inside the API container so the compiled Prisma assets are available:
```bash
docker compose run --rm api npx prisma migrate deploy
docker compose run --rm api npm run prisma:seed
```

### Stripe billing (optional)

This repo supports Stripe Checkout subscriptions + coupon codes + B2B billing details.

1. Log in as owner (seeded owner credentials are printed by the seed script).
2. Go to `Owner → Settings` and set:
   - Stripe publishable + secret keys
   - Starter/Growth/Scale monthly price IDs (or click **Auto-create monthly prices** to generate them in test mode)
3. (Production) Configure a Stripe webhook endpoint to:
   - `https://<your-api-domain>/api/billing/stripe/webhook`
   - and paste the webhook signing secret into `Owner → Settings`.
4. Customers can sign up at `/signup`, enter a coupon code + company/VAT details, then complete payment in Stripe Checkout. After payment the tenant plan is activated automatically.

## Deployment

### Web (Vercel)
1. Push this repo to GitHub/GitLab and import the `apps/web` folder in Vercel.
2. Set build command to `npm install && npm run build` (prerender runs inside `build` automatically).
3. Set output directory to `apps/web/dist`.
4. Environment variables:
   - `VITE_API_BASE_URL=https://your-api-domain.com/api`
   - `VITE_SITE_URL=https://your-marketing-domain.com`
5. Redeploy after each CMS change if you want to regenerate the static HTML files; live CMS data still hydrates on the client, so marketing updates show immediately without redeploys.

### API + DB + MinIO (Railway / Fly.io / Render)
1. Provision Postgres and MinIO (or S3/R2). On Railway you can deploy both as managed services; on Fly/Render use separate apps.
2. Deploy `apps/api` as a Node service. Build command: `npm install && npm run build`. Start command: `node dist/src/server.js`.
3. Set secrets:
   - `DATABASE_URL` (Railway returns a `postgresql://` URL).
   - `JWT_SECRET`, `ENCRYPTION_KEY`, `S3_*`, `PUBLIC_CDN_BASE`, `API_PUBLIC_URL`, `WEB_BASE_URL`, SMTP credentials, etc.
4. Attach persistent volumes for MinIO if you self-host it (or point `S3_ENDPOINT`/`S3_BUCKET` to R2/S3).
5. After deployment, run `npx prisma migrate deploy` and `npm run prisma:seed` inside the API container once.
6. Point Vercel’s API base (`VITE_API_BASE_URL`) at the deployed API.

CMS data lives inside Postgres, so as long as the database volume is persisted, CMS edits survive deploys.

> Reverse proxy tip: send `/api` traffic to the API service and fall through to the static web app for everything else. The web build contains prerendered `/`, `/product`, `/pricing`, `/about`, and `/contact` routes so Nginx/Traefik can serve them without SPA rewrites.

## Cron & quotas

- Quota usage is tracked per tenant/month (`Usage` table).
- Node-cron runs daily at 02:00 to reset tenants whose `resetDay` matches the current day.

## n8n integration

Every tenant stores their own `n8nBaseUrl` and `n8nProcessPath`. When a job is created:

1. Input image is sanitized (Sharp), EXIF stripped, and uploaded to S3 (`s3://{tenant}/input/{jobId}`).
2. API posts multipart data to the tenant’s n8n webhook with:
   - `file` (PNG/JPG), `tenant_id`, and the request `webhook_base`
   - language + vibe + voice profile + platform focus + CTA (`script_language`, `vibe`, `voice_profile`, `platform_focus`, `call_to_action`)
   - `video_count` (1–5) plus optional `creative_brief`
   - `creator_gender` and `creator_age_range` (used to style the UGC talent)
   - `callback_url` (`/api/videos/jobs/:id/callback`) and `callback_token` (forwarded back via `x-callback-token`)
   - encrypted API keys resurfaced as `apikey_*`
   - composition hints (`use_cloudinary` or `compose_service_url`)
3. If `N8N_SYNC=true`, immediate outputs are stored; otherwise the callback endpoint records completion and decrements quota atomically.

## Frontend highlights

- Seamless login for owners and tenants (no wildcard DNS gymnastics required).
- 2026-ready “Create Video” workspace with hero upload rail, vibe/voice selectors, CTA chips, directive inputs, and live status card.
- UGC Jobs list with neon filters, inline video previews, and download chips.
- Dashboard quota glassmorphism widgets plus “latest 20 videos” rail on the studio.
- Tenant admin console for branding, plans, API keys, n8n URLs, and users.
- Owner console to view tenants, change plans, reset/suspend, and impersonate (opens a tenant session via single sign-on token).
- Marketing landing pages are prerendered (/, /product, /pricing, /about, /contact) so CDNs or Vercel can serve them as pure static HTML.

## Email setup (Brevo SMTP)

- Set the following in `.env` (and ensure the api container loads it via `env_file`): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `OWNER_NOTIFICATION_EMAIL`, `WEB_BASE_URL`.
- The API logs `[email] sending` and `[email] sent` with `to`/`subject` plus clear errors if any env var is missing.
- Test delivery locally via `GET /api/health/email-test`; you should also see entries in Brevo’s real-time dashboard.

## CMS controls

- /owner/cms now manages landing hero, feature grid, testimonials, pricing subtitle, contact copy + destination email, how-it-works steps, product page sections, about-page story/timeline/values, and showcase video URLs.
- All public marketing pages (home, product, about, contact) read from CMS first, falling back to the bundled defaults.

## New video form extras

- Added creator gender and age-range selectors (sent through the API/n8n payload).
- CTA chips include a default “None” option and are omitted from the payload when unselected.
- Creative notes are a single “Creative brief & directives” textarea.

## Tests

Basic Jest coverage (run from `apps/api`):
```bash
npm test
```
Includes tenant resolution, quota enforcement, and job lifecycle happy path.

## Environment Reference

| Variable | Purpose |
| --- | --- |
| `API_PUBLIC_URL` | Public HTTPS URL to this API (used for n8n callbacks) |
| `S3_*` | S3-compatible storage (MinIO, R2, S3) |
| `PUBLIC_CDN_BASE` | Public URL base that matches the S3 bucket |
| `USE_CLOUDINARY` | `true` to send Cloudinary creds to n8n for overlays |
| `COMPOSE_SERVICE_URL` | Internal Sharp microservice for overlays when not using Cloudinary |
| `ENCRYPTION_KEY` | 32-char AES-256 key for tenant API secrets |
| `SMTP_HOST` / `SMTP_PORT` | Outbound SMTP server for transactional emails (Mailtrap, Gmail SMTP, etc.) |
| `SMTP_USER` / `SMTP_PASS` | Credentials for the SMTP server |
| `EMAIL_FROM` | Sender identity, e.g. `"UGC Studio" <no-reply@yourdomain.com>` |
| `OWNER_NOTIFY_EMAIL` | Where signup notifications are sent (default: your inbox) |
| `WEB_BASE_URL` | Public URL for the web app (used in emails for deep links) |
| `VITE_SITE_URL` | (Frontend) canonical marketing URL used while prerendering |

Example email configuration for local Mailtrap testing:

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-user-id
SMTP_PASS=your-mailtrap-pass
EMAIL_FROM="UGC Studio" <no-reply@ugc.local>
OWNER_NOTIFY_EMAIL=ac@abrahamceviz.com
WEB_BASE_URL=http://localhost:4173
```

## Development tips

- Owner endpoints require hitting the apex domain or `admin.BASE_DOMAIN`.
- To impersonate, open the generated link (it passes `impersonationToken` via query param and automatically stores it on load).
- MinIO bucket `assets` must exist before jobs run (create via console or CLI).
- Update Tailwind / UI tokens in `apps/web/tailwind.config.js` and `src/components/AppLayout.tsx` if you want to rebrand.
