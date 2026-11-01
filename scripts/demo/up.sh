#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WALLETS_DIR="$ROOT_DIR/demo-wallets"
mkdir -p "$WALLETS_DIR"

if [ ! -f "$ROOT_DIR/.env.demo" ]; then
  echo "Error: $ROOT_DIR/.env.demo not found. Run R4 environment setup first."
  exit 1
fi

# Stop any old demo processes first
"$ROOT_DIR/scripts/demo/down.sh"

echo "Starting Base Sepolia demo environment..."

# Load .env.demo without printing
set -a
. "$ROOT_DIR/.env.demo" >/dev/null 2>&1
set +a

# 1. AI Mock on port 4019
echo "Starting AI mock on port 4019..."
nohup bun run "$ROOT_DIR/tests/e2e/mocks/ai-server.ts" > "$WALLETS_DIR/ai-mock.log" 2>&1 &
echo $! > "$WALLETS_DIR/ai-mock.pid"

# 2. Worker on port 4101
echo "Starting Worker on port 4101..."
(
  cd "$ROOT_DIR/apps/worker"
  nohup bun src/index.ts > "$WALLETS_DIR/worker.log" 2>&1 &
  echo $! > "$WALLETS_DIR/worker.pid"
)

# 3. Web on port 4100
echo "Starting Web server on port 4100..."
(
  cd "$ROOT_DIR/apps/web"
  nohup bun server.ts > "$WALLETS_DIR/web.log" 2>&1 &
  echo $! > "$WALLETS_DIR/web.pid"
)

echo "Waiting for services to become healthy..."

# Check web health (timeout 60s)
for i in {1..60}; do
  if curl -sf http://localhost:4100/api/health >/dev/null 2>&1; then
    echo "Web server healthy at http://localhost:4100/api/health"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "Warning: Web server did not become healthy within 60s (may need deployed escrow on-chain)"
  fi
done

echo "Demo environment script up.sh finished."
