#!/bin/bash
#
# UGC Video Production Health Verification Script
#
# Usage: ./scripts/verify-prod-health.sh
#
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=== UGC Video Production Health Check ==="
echo ""

check_pass() {
  echo -e "${GREEN}OK${NC}"
}

check_fail() {
  echo -e "${RED}FAIL${NC} ($1)"
}

check_warn() {
  echo -e "${YELLOW}WARN${NC} ($1)"
}

# 1. Check API healthz
echo -n "1. API /healthz endpoint: "
if API_RESPONSE=$(curl -sf http://localhost:4000/healthz 2>/dev/null); then
  DB_OK=$(echo "$API_RESPONSE" | grep -o '"database":true' || true)
  if [ -n "$DB_OK" ]; then
    check_pass
  else
    check_warn "API up but DB check failed"
  fi
else
  check_fail "not responding"
fi

# 2. Check DB directly
echo -n "2. PostgreSQL connection: "
if docker-compose -f "$COMPOSE_FILE" exec -T db pg_isready -U app -d app > /dev/null 2>&1; then
  check_pass
else
  check_fail "pg_isready failed"
fi

# 3. Check MinIO
echo -n "3. MinIO storage: "
if docker-compose -f "$COMPOSE_FILE" exec -T minio mc ready local > /dev/null 2>&1; then
  check_pass
else
  # Fallback: try curl to health endpoint
  if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    check_pass
  else
    check_fail "not ready"
  fi
fi

# 4. Check N8N
echo -n "4. N8N workflow engine: "
if docker-compose -f "$COMPOSE_FILE" exec -T n8n wget -qO- http://localhost:5678/healthz > /dev/null 2>&1; then
  check_pass
else
  check_fail "healthz failed"
fi

# 5. Check Web frontend
echo -n "5. Web frontend: "
if docker-compose -f "$COMPOSE_FILE" exec -T web wget -qO- http://localhost:4173/ > /dev/null 2>&1; then
  check_pass
else
  check_fail "not responding"
fi

# 6. Check Caddy
echo -n "6. Caddy reverse proxy: "
if docker-compose -f "$COMPOSE_FILE" exec -T caddy wget -qO- http://localhost:2019/metrics > /dev/null 2>&1; then
  check_pass
else
  check_warn "metrics endpoint not responding"
fi

# 7. Check Docker healthcheck statuses
echo ""
echo "=== Docker Healthcheck Status ==="
docker-compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.Status}}" 2>/dev/null || \
  docker-compose -f "$COMPOSE_FILE" ps

echo ""
echo "=== Verification Complete ==="
