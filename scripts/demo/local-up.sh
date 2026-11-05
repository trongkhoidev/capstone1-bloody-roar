#!/usr/bin/env bash
# Tắt mọi tiến trình của dự án rồi dựng lại: Hardhat 8545 → deploy → worker → web :4000.
#   bash scripts/demo/local-up.sh        # dựng lại
#   bash scripts/demo/local-up.sh down   # chỉ tắt
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG="$ROOT/demo-wallets/logs"
PORTS=(4000 4300 8545)
PID_DIR="$ROOT/demo-wallets/pids"
mkdir -p "$LOG" "$PID_DIR"
cd "$ROOT"

remember() {
  local name="$1" pid="$2" started
  started=$(ps -p "$pid" -o lstart=) || return 1
  printf '%s\n%s\n' "$pid" "$started" > "$PID_DIR/$name.pid"
}

stop_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" || true); do stop_tree "$child"; done
  kill "$pid" 2>/dev/null || ! kill -0 "$pid" 2>/dev/null
}

stop_all() {
  local file pid started current
  echo "▸ Tắt tiến trình demo đã ghi nhận"
  for file in "$PID_DIR"/*.pid; do
    [ -f "$file" ] || continue
    pid=$(sed -n '1p' "$file"); started=$(sed -n '2p' "$file")
    [[ "$pid" =~ ^[0-9]+$ ]] || { echo "PID không hợp lệ: $file" >&2; return 1; }
    current=$(ps -p "$pid" -o lstart= 2>/dev/null || true)
    if [ -z "$current" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Không thể xác minh tiến trình demo $pid" >&2; return 1
    fi
    if [ -n "$current" ] && [ "$current" = "$started" ]; then
      stop_tree "$pid" || { echo "Không thể dừng tiến trình demo $pid" >&2; return 1; }
    fi
    rm -f "$file"
  done
}

check_ports() {
  local p i
  for i in {1..20}; do
    local busy=""
    for p in "${PORTS[@]}"; do lsof -ti "tcp:$p" -sTCP:LISTEN >/dev/null 2>&1 && busy="$busy $p"; done
    [ -z "$busy" ] && return 0
    sleep 0.25
  done
  for p in "${PORTS[@]}"; do
    if lsof -ti "tcp:$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Port $p đang được sử dụng; hãy dừng tiến trình đó trước khi khởi động demo." >&2
      return 1
    fi
  done
}

wait_for() { # $1 tên, $2 lệnh kiểm, $3 giây
  for _ in $(seq 1 "$3"); do eval "$2" >/dev/null 2>&1 && { echo "  $1 OK"; return 0; }; sleep 1; done
  echo "  $1 không lên sau $3s, xem $LOG"; exit 1
}

stop_all
[ "${1:-}" = "down" ] && { echo "Đã tắt hết."; exit 0; }
check_ports

echo "▸ Hardhat node :8545"
(cd apps/contracts && exec nohup bun x hardhat node --hostname 127.0.0.1 --port 8545 </dev/null >"$LOG/hardhat.log" 2>&1) &
remember hardhat "$!"
disown
wait_for "Hardhat" "curl -sf -X POST 127.0.0.1:8545 -H 'content-type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\"}'" 60
remember hardhat-listener "$(lsof -ti tcp:8545 -sTCP:LISTEN)"

echo "▸ Deploy MockUSDC + BloodyRoarEscrow"
bun run contracts:deploy >"$LOG/deploy.log" 2>&1 || { tail -20 "$LOG/deploy.log"; exit 1; }

echo "▸ Ghi địa chỉ escrow mới vào .env (bản cũ lưu ở .env.bak)"
cp .env .env.bak
bun -e '
const m = await Bun.file("apps/contracts/deployments/localhost.json").json();
if (m.chainId !== "31337" || !/^0x[0-9a-fA-F]{40}$/.test(m.address) || !Number.isSafeInteger(m.deployBlock)) throw new Error("manifest không hợp lệ");
let env = await Bun.file(".env").text();
const set = (k, v) => { const re = new RegExp(`^${k}=.*$`, "m"); env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`; };
set("ESCROW_ADDRESS", `"${m.address}"`);
set("ESCROW_CONTRACT_ADDRESS", m.address);
set("ESCROW_DEPLOY_BLOCK", String(m.deployBlock));
await Bun.write(".env", env);
console.log(`  escrow ${m.address} · token ${m.token} · block ${m.deployBlock}`);
if (m.token.toLowerCase() !== "0x5fbdb2315678afecb367f032d93f642f64180aa3") console.log("  ⚠ token khác 0x5FbDB…, bảng tokens trong DB sẽ không khớp");
'

echo "▸ Worker :4300"
nohup bun run worker:start </dev/null >"$LOG/worker.log" 2>&1 &
remember worker "$!"
disown
wait_for "Worker" "lsof -ti tcp:4300 -sTCP:LISTEN" 60
remember worker-listener "$(lsof -ti tcp:4300 -sTCP:LISTEN)"

echo "▸ Web :4000 (xoá cache .next cũ vì 2 server từng ghi chung)"
rm -rf apps/web/.next
PORT=4000 NEXT_PUBLIC_APP_URL=http://localhost:4000 nohup bun run dev </dev/null >"$LOG/web.log" 2>&1 &
remember web "$!"
disown
wait_for "Web" "curl -sf localhost:4000/api/health" 180
remember web-listener "$(lsof -ti tcp:4000 -sTCP:LISTEN)"
curl -s -o /dev/null localhost:4000/ || true # biên dịch sẵn trang chủ

cat <<EOF

Xong. Mở http://localhost:4000
  RPC      http://127.0.0.1:8545 (chain 31337) – MetaMask: thêm mạng này
  Admin    Hardhat #2 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (arbiter + ADMIN_WALLETS)
  Log      $LOG/{hardhat,deploy,worker,web}.log
  Tắt      bash scripts/demo/local-up.sh down
Lưu ý: chain mới tinh. Escrow cũ trong DB (địa chỉ khác) không còn trên chain.
EOF

if [ "${1:-}" = "stay" ] || [ "${1:-}" = "--daemon" ] || [ -n "${LOCAL_UP_DAEMON:-}" ]; then
  echo "▸ Giữ tiến trình chạy nền..."
  exec tail -f /dev/null
fi
