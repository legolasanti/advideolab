#!/bin/bash
#
# Deployment Script for AdVideoLab
#
# Usage: ./scripts/deploy.sh [--fresh]
#
# Options:
#   --fresh    Clean deployment (removes old containers and volumes)
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.prod.yml"
FRESH_DEPLOY=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --fresh)
      FRESH_DEPLOY=true
      shift
      ;;
  esac
done

cd "$PROJECT_DIR"

# 1. Verify .env file exists
log_step "1/8 Checking environment configuration..."
if [ ! -f .env ]; then
  log_error ".env file not found!"
  log_error "Please create .env from .env.example and configure your settings."
  exit 1
fi

# Verify required variables
REQUIRED_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "ENCRYPTION_KEY"
  "POSTGRES_PASSWORD"
  "MINIO_ROOT_PASSWORD"
  "SEED_OWNER_EMAIL"
  "SEED_OWNER_PASSWORD"
)

for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^${var}=" .env; then
    log_error "Required variable ${var} not found in .env"
    exit 1
  fi
done
log_info "Environment configuration OK"

# 2. Fresh deployment cleanup
if [ "$FRESH_DEPLOY" = true ]; then
  log_step "2/8 Fresh deployment requested - cleaning up..."
  log_warn "This will remove ALL existing data!"
  read -p "Are you sure? (yes/no): " -r CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    log_error "Aborted by user"
    exit 1
  fi

  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
  docker system prune -f
  log_info "Cleanup completed"
else
  log_step "2/8 Stopping existing containers..."
  docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
fi

# 3. Pull latest images
log_step "3/8 Pulling latest base images..."
docker pull postgres:16
docker pull minio/minio:latest
docker pull docker.n8n.io/n8n/n8n:latest
docker pull caddy:2

# 4. Build application images
log_step "4/8 Building application images..."
docker compose -f "$COMPOSE_FILE" build --no-cache api web

# 5. Start infrastructure services first
log_step "5/8 Starting infrastructure services (DB, MinIO, N8N)..."
docker compose -f "$COMPOSE_FILE" up -d db minio n8n

# Wait for database to be ready
log_info "Waiting for database to be ready..."
RETRIES=30
until docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U app -d app > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    log_error "Database did not become ready in time"
    exit 1
  fi
  echo -n "."
  sleep 2
done
echo ""
log_info "Database is ready"

# 6. Run database migrations
log_step "6/8 Running database migrations..."
docker compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy
log_info "Migrations completed"

# 7. Seed database (only on fresh deploy)
if [ "$FRESH_DEPLOY" = true ]; then
  log_step "6b/8 Seeding database..."
  docker compose -f "$COMPOSE_FILE" run --rm \
    -e ALLOW_PROD_SEED=true \
    -e SEED_RESET=true \
    api npx prisma db seed
  log_info "Database seeded"
fi

# 8. Start all services
log_step "7/8 Starting all services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for all services to be healthy
log_info "Waiting for services to become healthy..."
sleep 10

# 9. Verify deployment
log_step "8/8 Verifying deployment..."
if [ -f "$SCRIPT_DIR/verify-prod-health.sh" ]; then
  bash "$SCRIPT_DIR/verify-prod-health.sh" || true
else
  # Basic health check
  if curl -sf http://localhost:4000/healthz > /dev/null 2>&1; then
    log_info "API health check passed"
  else
    log_warn "API health check failed - check logs with: docker compose -f $COMPOSE_FILE logs api"
  fi
fi

echo ""
log_info "========================================="
log_info "Deployment completed!"
log_info "========================================="
echo ""
log_info "Services:"
log_info "  - Web:   https://app.advideolab.com"
log_info "  - API:   https://api.advideolab.com"
log_info "  - N8N:   https://n8n.advideolab.com"
log_info "  - Files: https://files.advideolab.com"
echo ""
log_info "Useful commands:"
log_info "  View logs:        docker compose -f $COMPOSE_FILE logs -f"
log_info "  View API logs:    docker compose -f $COMPOSE_FILE logs -f api"
log_info "  Restart service:  docker compose -f $COMPOSE_FILE restart <service>"
log_info "  Stop all:         docker compose -f $COMPOSE_FILE down"
echo ""
