# Production Hardening Verification Checklist

This document provides step-by-step verification commands for the production hardening changes.

## Prerequisites

```bash
# Ensure you're in the project root
cd /path/to/Amazon-resim

# Copy and configure environment
cp .env.example .env
# Edit .env with your production values
```

---

## 1. Run Production Compose

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up --build -d

# Watch service health status
docker-compose -f docker-compose.prod.yml ps

# Wait for all services to be healthy (may take 30-60 seconds)
watch -n 2 'docker-compose -f docker-compose.prod.yml ps'
```

**Expected output:** All services should show `(healthy)` status.

```
NAME                COMMAND                  SERVICE   STATUS                   PORTS
ugcvideo-api-1      "docker-entrypoint..."   api       running (healthy)        4000/tcp
ugcvideo-caddy-1    "caddy run --config..."  caddy     running (healthy)        0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
ugcvideo-db-1       "docker-entrypoint..."   db        running (healthy)        5432/tcp
ugcvideo-minio-1    "/usr/bin/docker-en..."  minio     running (healthy)        9000/tcp, 9001/tcp
ugcvideo-n8n-1      "tini -- /docker-en..."  n8n       running (healthy)        5678/tcp
ugcvideo-web-1      "docker-entrypoint..."   web       running (healthy)        4173/tcp
```

---

## 2. Verify /healthz Endpoint

### Direct API Check (inside container network)

```bash
# Check health from inside the network
docker-compose -f docker-compose.prod.yml exec api wget -qO- http://localhost:4000/healthz

# Expected: {"ok":true,"checks":{"database":true,"timestamp":"2026-01-19T..."}}
```

### External Check (via Caddy/domain)

```bash
# If DNS is configured
curl -s https://api.ugcvideo.cloud/healthz | jq

# Local testing (add to /etc/hosts: 127.0.0.1 api.ugcvideo.cloud)
curl -sk https://api.ugcvideo.cloud/healthz | jq
```

### Verify DB Failure Detection

```bash
# Stop database temporarily
docker-compose -f docker-compose.prod.yml stop db

# Health check should return 503
docker-compose -f docker-compose.prod.yml exec api wget -qO- http://localhost:4000/healthz
# Expected: {"ok":false,"checks":{"database":false,"timestamp":"..."}}

# Restart database
docker-compose -f docker-compose.prod.yml start db
```

---

## 3. Verify N8N IP Restriction

### Test from Allowed IP

```bash
# If your IP is in N8N_ALLOWED_IPS, you should reach n8n UI
curl -s -o /dev/null -w "%{http_code}" https://n8n.ugcvideo.cloud/
# Expected: 401 (unauthorized - n8n's own login) or 200 (if already logged in)
```

### Test from Blocked IP

```bash
# From a different IP (or use a VPN/proxy)
curl -s -o /dev/null -w "%{http_code}" https://n8n.ugcvideo.cloud/
# Expected: 403 (Access denied by Caddy)
```

### Verify Webhooks Still Work

```bash
# Webhooks should work from ANY IP (not restricted)
curl -s -o /dev/null -w "%{http_code}" https://n8n.ugcvideo.cloud/webhook/test
# Expected: 404 (no such webhook) or 200 (if webhook exists) - NOT 403
```

### Check Caddy Logs for IP Blocking

```bash
docker-compose -f docker-compose.prod.yml logs caddy | grep "n8n"
```

### Configure Specific IPs

```bash
# Edit .env to set specific IPs
# N8N_ALLOWED_IPS=203.0.113.10,198.51.100.0/24

# Reload Caddy
docker-compose -f docker-compose.prod.yml restart caddy
```

---

## 4. Verify Stripe Webhook (with Stripe CLI)

### Install Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee -a /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe
```

### Forward Webhooks to Local

```bash
# Login to Stripe
stripe login

# Forward webhooks to your local API
stripe listen --forward-to localhost:4000/api/billing/stripe/webhook
# Note the webhook signing secret printed (whsec_...)
```

### Trigger Test Event

```bash
# In another terminal
stripe trigger checkout.session.completed

# Check API logs for successful processing
docker-compose -f docker-compose.prod.yml logs api | grep stripe
```

### Verify Body Size Limit

```bash
# Create a large payload (> 1MB) - should be rejected
dd if=/dev/zero bs=1100000 count=1 2>/dev/null | \
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -H "Stripe-Signature: invalid" \
    --data-binary @- \
    http://localhost:4000/api/billing/stripe/webhook

# Expected: 413 Payload Too Large (or connection reset)
```

### Verify Normal Payload Works

```bash
# Small valid-ish payload should reach signature verification
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234,v1=abc" \
  -d '{"type":"test"}' \
  http://localhost:4000/api/billing/stripe/webhook

# Expected: 400 with "invalid signature" or similar (not size error)
```

---

## 5. Verify JWT Expiry

### Check Default Expiry (1h)

```bash
# Login and decode the token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}' | jq -r '.token')

# Decode JWT (without verification) to check expiry
echo $TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq

# Check exp vs iat - should be ~3600 seconds (1 hour)
```

### Verify Invalid Expiry is Rejected

```bash
# In .env, set an invalid value
# JWT_EXPIRES_IN=999d

# Restart API and check logs for warning
docker-compose -f docker-compose.prod.yml restart api
docker-compose -f docker-compose.prod.yml logs api | grep jwt
# Expected: "[jwt] JWT_EXPIRES_IN "999d" is too long (max 24h), using safe default 1h"
```

### Verify Short Expiry is Rejected

```bash
# In .env, set too short value
# JWT_EXPIRES_IN=30s

# Check logs
# Expected: "[jwt] JWT_EXPIRES_IN "30s" is too short (min 15m), using safe default 1h"
```

---

## 6. Verify Healthcheck Dependencies

The docker-compose.prod.yml now uses `condition: service_healthy` dependencies:

```bash
# API waits for DB and MinIO to be healthy before starting
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Watch the startup sequence
docker-compose -f docker-compose.prod.yml logs -f

# DB should start first, then MinIO, then API, then Web, then Caddy
```

---

## 7. Verify Refresh Tokens

```bash
# Login to get access token + refresh cookie
curl -i -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'

# Use the refresh cookie to obtain a new access token
curl -i -X POST http://localhost:4000/api/auth/refresh \
  -H "Cookie: refresh_token=<paste-from-set-cookie>"
```

Expected:
- `/auth/login` returns `Set-Cookie: refresh_token=...` and JSON with `token`.
- `/auth/refresh` returns a new `token` and rotates the cookie.

---

## 8. Verify Sentry (Optional)

```bash
# Set SENTRY_DSN in .env, then restart API
docker-compose -f docker-compose.prod.yml restart api

# Trigger a controlled 404 to see it in Sentry
curl -s http://localhost:4000/api/does-not-exist
```

---

## 9. View All Service Health at Once

```bash
# Quick health summary
docker-compose -f docker-compose.prod.yml ps --format "table {{.Service}}\t{{.Status}}"

# Detailed health info
for svc in db minio api web n8n caddy; do
  echo "=== $svc ==="
  docker inspect --format='{{.State.Health.Status}}' "ugcvideo-${svc}-1" 2>/dev/null || echo "no healthcheck"
done
```

---

## Troubleshooting

### Service Stuck in "starting"

```bash
# Check container logs
docker-compose -f docker-compose.prod.yml logs <service>

# Check healthcheck command manually
docker-compose -f docker-compose.prod.yml exec api wget --spider http://localhost:4000/healthz
```

### Caddy Not Starting

```bash
# Validate Caddyfile syntax
docker-compose -f docker-compose.prod.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### N8N Healthcheck Failing

```bash
# Check if n8n is responding
docker-compose -f docker-compose.prod.yml exec n8n wget -qO- http://localhost:5678/healthz
```

### Database Connection Issues

```bash
# Check DB is accepting connections
docker-compose -f docker-compose.prod.yml exec db pg_isready -U app -d app
```

---

## Quick Validation Script

Save as `scripts/verify-prod-health.sh`:

```bash
#!/bin/bash
set -e

echo "=== UGC Video Production Health Check ==="

echo -n "1. API healthz: "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/healthz)
[ "$STATUS" = "200" ] && echo "OK" || echo "FAIL ($STATUS)"

echo -n "2. DB connection: "
docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U app -d app > /dev/null && echo "OK" || echo "FAIL"

echo -n "3. MinIO ready: "
docker-compose -f docker-compose.prod.yml exec -T minio mc ready local > /dev/null 2>&1 && echo "OK" || echo "FAIL"

echo -n "4. N8N healthz: "
docker-compose -f docker-compose.prod.yml exec -T n8n wget -qO- http://localhost:5678/healthz > /dev/null && echo "OK" || echo "FAIL"

echo -n "5. Web responding: "
docker-compose -f docker-compose.prod.yml exec -T web wget -qO- http://localhost:4173/ > /dev/null && echo "OK" || echo "FAIL"

echo "=== All checks completed ==="
```

Run with:

```bash
chmod +x scripts/verify-prod-health.sh
./scripts/verify-prod-health.sh
```
