# Current Context (UGC Video Generator)

**Last updated:** 2025-12-24

## Working agreement (important)

- For every new task you give me, I will **read this file first** before making changes.
- After I finish any change (code/copy/config), I will **append a short English summary** under **Change log**.

## Product in 1 sentence

Generate high-converting short‑form UGC videos from a **single product image** (TikTok / Reels / Shorts), with controls for language, voice, vibe, creator persona, CTA, and batch variations.

## Repo / app overview

This is a monorepo for a SaaS-style UGC video generator:

- `apps/web`: React + Vite + Tailwind (marketing + app UI)
- `apps/api`: Node.js + Express + Prisma (Postgres) API
- Infra: Docker Compose stack with Postgres + MinIO (+ optional services)

Key routes (web):

- Marketing: `/`, `/product`, `/examples`, `/pricing`, `/contact`, `/about`, `/blog`
- App (auth required): `/new-video`, `/jobs`, `/app`, `/settings`

## Tech stack (high level)

- Frontend: React, TypeScript, Vite, TailwindCSS
- Backend: Node.js, Express, Prisma ORM
- DB: PostgreSQL
- Storage: S3-compatible (MinIO in local Docker)
- Deployment/dev: Docker Compose (Traefik disabled in local override)

## Video generation flow (conceptual)

1. User uploads a product image in the web app (`/new-video`).
2. Web app sends image to the API (`/ugc/uploads/hero`), then creates a job (`/ugc/jobs`) with creative settings.
3. API triggers an external workflow provider (configured via `N8N_WEBHOOK_URL`) and later receives a video upload callback.
4. Output video is stored in S3/MinIO and shown in the dashboard.

## Marketing positioning (current)

We removed “enterprise/agents/replace your team/autonomous/workflows” style messaging and aligned everything to:

- “Create/Generate high‑converting UGC videos from a single image”
- Demo-first UX: primary CTA always pushes to creation
- Dark, premium, minimal UI with a single green primary accent

CTA conventions:

- Primary CTA: **“Generate your first UGC video”** → `/new-video`
- Secondary CTA: **“View pricing”** → `/pricing`

## Canonical languages list

Single source of truth is:

- `apps/web/src/lib/languages.ts` (`LANGUAGES`)

Usage:

- `/new-video` “Script language” dropdown uses `LANGUAGES` and displays `Name — code`.
- Pricing/Contact FAQs render the same list for “Which languages are supported?”

## What has been implemented so far (summary)

- Marketing site refactor:
  - Homepage rebuilt demo-first with product preview placeholders (no fake logos/credibility).
  - `/product`, `/examples`, `/pricing`, `/contact` rewritten to match the UGC generator positioning.
  - Pricing now includes both **plan cards (purchase CTA)** and a strict comparison table.
- Added shared language constant module: `apps/web/src/lib/languages.ts`.
- `/new-video` copy aligned to the product and language dropdown now uses `LANGUAGES`.

## Notes / constraints

- Examples: if no real video URLs are provided, the marketing site shows uniform placeholders (no random stock content).
- Purchase flow: pricing CTAs route to existing signup flow using `/signup?plan=starter|growth|scale`.
- Docker local: `docker-compose.override.yml` exposes web on `:4173` and api on `:4000`.

## Change log

### 2025-12-24

- Added this context document and established the “read first + append changes” workflow.

### 2026-01-26

- Expanded supported languages list to 50+ and updated marketing copy to reflect the new count.
