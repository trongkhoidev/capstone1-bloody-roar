#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WALLETS_DIR="$ROOT_DIR/demo-wallets"

echo "Stopping demo processes (ports 4019, 4100, 4101)..."

for pidfile in "$WALLETS_DIR"/*.pid; do
  [ -e "$pidfile" ] || continue
  name="$(basename "$pidfile" .pid)"
  pid="$(cat "$pidfile")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (PID $pid)..."
    kill -15 "$pid" 2>/dev/null || true
    for _ in {1..10}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.5
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "Force killing $name (PID $pid)..."
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pidfile"
done

echo "All demo processes stopped."
