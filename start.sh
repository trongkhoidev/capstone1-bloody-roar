#!/usr/bin/env bash

# =============================================================================
# Bloody-Roar Dev Starter Script
# Starts both Backend (GraphQL Yoga + Socket.io + Prisma) & Frontend (Next.js)
# =============================================================================

set -e

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================================${NC}"
echo -e "${BLUE}        🩸 Bloody-Roar Development Server          ${NC}"
echo -e "${BLUE}=====================================================${NC}"

# Check .env file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo -e "${YELLOW}⚠️  No .env file found. Creating .env from .env.example...${NC}"
    cp .env.example .env
  else
    echo -e "${RED}❌ Error: .env file and .env.example not found.${NC}"
    exit 1
  fi
fi

# Export the root environment so Prisma commands run from workspace packages use
# the same database configuration as the custom web server.
set -a
# shellcheck disable=SC1091
source .env
set +a

# This workspace reserves the 3000 range for other running projects.
export PORT="${BR_DEV_PORT:-4000}"
export NEXT_PUBLIC_APP_URL="http://localhost:${PORT}"

# Optional Docker container start for Postgres
if command -v docker > /dev/null 2>&1 && [ -f docker-compose.yml ]; then
  if ! docker ps --format '{{.Names}}' | grep -q "bloody_roar_postgres"; then
    echo -e "${YELLOW}📦 Starting Postgres container via Docker Compose...${NC}"
    docker compose up -d || echo -e "${YELLOW}⚠️ Could not start Docker. Assuming local Postgres or external DB is running.${NC}"
  else
    echo -e "${GREEN}✅ Postgres container is running.${NC}"
  fi

  echo -e "${BLUE}⏳ Waiting for PostgreSQL to accept connections...${NC}"
  for attempt in {1..30}; do
    if docker compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
      break
    fi
    if [ "$attempt" -eq 30 ]; then
      echo -e "${RED}❌ PostgreSQL did not become ready in time.${NC}"
      exit 1
    fi
    sleep 1
  done
fi

echo -e "${BLUE}🔄 Generating Prisma client & GraphQL types...${NC}"
bun run db:generate
echo -e "${BLUE}🗄️  Applying database migrations...${NC}"
bun run --cwd packages/database db:migrate:prod
echo -e "${BLUE}🌱 Ensuring development seed data exists...${NC}"
bun run db:seed

echo -e ""
echo -e "${GREEN}🚀 Starting Backend & Frontend server on http://localhost:${PORT}${NC}"
echo -e "${BLUE}   - Frontend (Next.js): http://localhost:${PORT}${NC}"
echo -e "${BLUE}   - Backend GraphQL:   http://localhost:${PORT}/api/graphql${NC}"
echo -e "${BLUE}   - Health Check:      http://localhost:${PORT}/api/health${NC}"
echo -e "${BLUE}=====================================================${NC}"
echo -e ""

# Execute dev server
exec bun run dev
