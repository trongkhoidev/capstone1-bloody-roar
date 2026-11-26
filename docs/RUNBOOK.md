# Runbook vận hành

Dành cho người trực khi app chạy trên Railway (xem [`DEPLOY.md`](DEPLOY.md) để biết cách deploy lần đầu).

## 1. Rollback

**Ứng dụng: redeploy image trước.** Trên Railway: service web → Deployments → chọn bản đang chạy tốt trước đó → Redeploy. Không sửa code trực tiếp lúc sự cố.

**Database: migration chỉ tiến, không rollback bằng tay.**
- Quy tắc viết migration: cột mới phải nullable hoặc có default, và phải deploy migration trước code cần nó. Nhờ vậy redeploy image cũ vẫn chạy được trên schema mới.
- Migration đã xóa hoặc đổi cột mà code cũ cần: khôi phục database từ backup Supabase, rồi redeploy image cũ. Chụp backup trước mọi migration có thao tác xóa.

**Contract: không upgrade.** Contract đã deploy là bất biến, không có đường rollback contract. Sự cố on-chain xử lý theo quy trình của escrow, không theo runbook này.

## 2. Kiểm tra nhanh

- `GET /api/health` phải trả `200` và `"database":"connected"`. Trả `503` nghĩa là không kết nối được database.
- Mọi response có header `x-request-id`. Dùng id này để tìm mọi dòng log của cùng một request.
- Log GraphQL: mỗi operation ghi `operation`, `durationMs`, `errors`. Tìm theo `requestId` hoặc theo tên operation.

## 3. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| Container thoát ngay, log có `Invalid environment: DATABASE_URL: required in production` (hoặc `AI_HASH_KEY`) | Thiếu biến bắt buộc khi chạy production. Thêm biến trên Railway rồi redeploy. |
| `429 Too many requests` kèm `Retry-After` | Vượt giới hạn theo IP hoặc theo user (`/api/auth/nonce`, `/api/auth/login`, `/api/graphql`, `/api/uploads`). Chờ đúng số giây trong `Retry-After`. Nhiều người chung một IP (NAT) có thể chạm giới hạn: tăng `GRAPHQL_POINTS_PER_MINUTE` trong `app/api/graphql/route.ts`. Giới hạn nằm trong bộ nhớ của từng instance, nên scale ra nhiều instance sẽ nhân giới hạn lên. |
| Đăng nhập ví thất bại, không rõ lý do | Kiểm tra `NEXT_PUBLIC_APP_URL` (xem DEPLOY.md mục 3). Biến này được đóng vào bundle lúc build, sai thì phải redeploy. |
| `Login challenge already used` | Nonce đã được dùng. Ví phải ký lại từ đầu. Đây là replay, không phải lỗi hệ thống. |
| Liên kết GitHub trả `GITHUB_ALREADY_LINKED` | Tài khoản GitHub đã gắn với ví khác. Chủ ví đó phải gọi `unlinkGithub` trước. |
| `next build` bị `SIGKILL` | Builder thiếu RAM (xem DEPLOY.md mục 2). |

## 4. Cấp quyền admin

```bash
railway run bun run --cwd apps/web scripts/grant-admin.ts 0x<address>
```

Lệnh đặt role `ADMIN` và ghi một dòng `AdminLog` (action `grant_admin`, adminId `cli`). Chạy trên đúng môi trường cần cấp quyền. Không chạy trên database của người khác.

## 5. Dừng server

`SIGTERM` (Railway gửi khi redeploy): đóng Socket.IO, đóng HTTP server, ngắt Prisma, rồi thoát `0`. Nếu chưa xong sau 10 giây, tiến trình thoát `1`.

## Auto-claim

Bản release (MVP) tắt auto-claim: để trống `RELAYER_PRIVATE_KEY`, worker vẫn chạy
bình thường và bỏ qua job. Người dùng rút tiền bằng Withdraw trên dashboard.

Worker dùng `RELAYER_PRIVATE_KEY` để trả gas cho `claim(recipient)`. Ví nhận tiền
vẫn là client/developer, không phải relayer. Không có key thì job tắt. Chỉ nạp ETH
gas vào relayer; không dùng ví client, developer hoặc fee recipient.

Job chạy mỗi 15 giây, tối đa 10 ví/tick, chỉ lấy ví user đã đăng ký và đúng
chain/contract, bỏ fee recipient. Mỗi lần thử cách nhau ít nhất 10 phút, kể cả
gửi lỗi hoặc projection còn chậm. Indexer xác nhận event `Claimed` rồi đưa số dư
về 0. Dashboard hiện pending nhưng giữ Withdraw làm dự phòng.

`RELAYER_MIN_GAS_WEI=1000000000000000` là ngưỡng mặc định. Alert
`RELAYER_LOW_GAS` chỉ phát một lần cho đến khi số dư phục hồi. Theo dõi alert và
log job, nạp ETH nếu thấp hơn ngưỡng; không đổi khóa chỉ để xử lý thiếu gas.

Kiểm chứng ngày 2026-11-10: `bun run test:e2e:backend`, scenario
`tests/e2e/e33-auto-claim.test.ts`. Tạo issue → fund → submit → release → relayer
claim; xác nhận event, USDC tăng đúng số claimable và projection về 0 trong dưới
một phút. Test dùng Hardhat/DB riêng, relayer riêng được cấp gas bằng RPC local.

## Test runner và migration chat

Trước khi bật `TEST_RUNNER_ENABLED=true` trên worker:

```bash
docker build -t bloodyroar-test-runner:1 -f apps/worker/runner/Dockerfile apps/worker/runner
docker pull python:3.12-slim
bun run --cwd packages/database db:migrate:prod
bun run --cwd packages/database db:backfill:conversations
```

Image JS có Node 22 để chạy Vitest và Bun để cài package với `--ignore-scripts`.
Không bật lifecycle scripts cho source upload. Dự án cần native build riêng có
thể trả ERROR/No result; kết quả đó không được dùng để approve test.
Container test không có mạng, chạy UID 1000, giới hạn CPU/RAM/PID, root filesystem
chỉ đọc và chỉ mount thư mục làm việc. Không truyền secret của worker vào Docker.

`SNAPSHOT_DIR` mặc định `.data/snapshots`, tính từ repo root. Web và worker cần
truy cập cùng thư mục để tải pinned snapshot. Với nhiều máy worker, cần chuyển
lưu snapshot sang shared storage trước khi mở rộng. Snapshot lỗi trả FAILED;
run kẹt quá 20 phút được cleanup chuyển ERROR.

Migration backfill chat chạy trước khi đặt `conversationId` NOT NULL và bỏ
`readAt`; giữ nguyên nội dung, người gửi, thời gian và attachment cũ. Script
backfill có thể chạy lại. Sau triển khai cần restart web/worker cùng phiên bản
schema mới. Không chạy test reset DB trên database đang sử dụng.

Python runner chỉ cài wheel từ `requirements.txt` hoặc `project.dependencies` trong
`pyproject.toml`; không build/cài chính project. Chỉ hỗ trợ dependency theo tên,
không hỗ trợ đường dẫn local, URL hoặc pip directives.
Khi deploy thật, phải chặn egress của container cài dependency tới dải IP nội bộ,
loopback và endpoint metadata cloud ở firewall/network của host.

## Cold start indexer và hash checkpoint

Migration `20261110175315_checkpoint_block_hashes` thêm `canonicalBlockHashes`
(mặc định `{}`) và `reorgAlerted` (mặc định `false`) vào `projection_checkpoints`.
Map rỗng sau migration là bình thường; không cần backfill.

Cold start đúng sẽ trông như sau:

- Database mới: tick đầu tạo checkpoint với cursor `ESCROW_DEPLOY_BLOCK - 1`, rồi quét
  tới safe block. `lastCanonicalBlockHash` rỗng nên bước kiểm tra reorg được bỏ qua.
- Database đã migrate: hash tại cursor vẫn khớp node, nên tick đầu tải lại toàn bộ
  hash trong cửa sổ thay vì dùng cache.
- Sau tick đầu, `canonicalBlockHashes` có tối đa `INDEXER_REORG_WINDOW + 1` khóa (65 với
  mặc định), `reorgAlerted = false`, và `lastCanonicalBlockHash` bằng hash tại
  `lastScannedBlock`. `/health` báo `projectionLagBlocks` gần 0 và
  `rpcErrorStreak: 0`. Log không có dòng `reorg detected`.

Kiểm tra checkpoint:

```sql
select "lastScannedBlock", "lastSafeBlock", "reorgAlerted",
       jsonb_array_length(jsonb_path_query_array("canonicalBlockHashes", '$.keyvalue()')) as hashes
from projection_checkpoints where "chainId" = <CHAIN_ID>;
```

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| Worker crash với `Unknown argument canonicalBlockHashes` | Prisma client cũ hơn schema. Chạy `bun run db:generate` rồi restart. |
| Lỗi `column "canonicalBlockHashes" does not exist` | Database chưa chạy migration. Chạy `prisma migrate deploy` trên database đó rồi restart. |
| `lastScannedBlock` đứng yên, `hashes` vẫn 0 | Tick đầu chưa xong. Xem log có `RPC returned no block` (RPC thiếu block cũ, cần node lưu đủ lịch sử) hoặc lỗi giới hạn range của RPC. |
| Log có `reorg detected; cursor rewound` ngay sau cold start | Hash tại cursor không khớp node: thường do `RPC_URL` trỏ sang chain khác hoặc node local đã được khởi động lại. Kiểm tra `CHAIN_ID` và `RPC_URL`. |
| `REORG_BEYOND_WINDOW` và `reorgAlerted = true` | Hash biên cửa sổ đổi hoặc thiếu. Có thể xảy ra nếu reorg đến trước khi tick đầu sau migration điền map. Worker dừng tiến cursor; xác nhận chain đúng rồi chạy `bun run worker:replay --from <ESCROW_DEPLOY_BLOCK>`. Replay đặt `lastCanonicalBlockHash = ""`, nên tick kế tiếp quét thành công và tự đặt `reorgAlerted = false`. |
| Hardhat local khởi động lại, cursor cao hơn block hiện tại | Chain mới, checkpoint cũ không còn hợp lệ. Xóa dòng checkpoint của `chainId` 31337 và địa chỉ escrow cũ, rồi deploy và chạy lại. |

## Máy demo: khởi động và khôi phục (S-113, US-83)

Đã chạy thử ngày 2026-11-26 trên WSL2 Ubuntu. Khi thử, cổng 8545/4000 đang bận nên các bước của `local-up.sh` được chạy tay trên 8645/4311/4110 (`LOCAL_RPC_URL`, `WORKER_PORT`, `PORT` trong `.env`); **`local-up.sh` chưa được chạy nguyên bản trên máy này**. Máy chạy với Docker Desktop (bật WSL Integration cho distro), Bun 1.4, Postgres 16 trong `docker-compose.yml` (cổng 5433). Máy demo dùng Postgres local, **không dùng Supabase** (G-17).

**Một lần:**

```bash
docker compose up -d postgres
docker exec bloody_roar_postgres createdb -U postgres bloody_roar_demo
docker build -t bloodyroar-test-runner:1 -f apps/worker/runner/Dockerfile apps/worker/runner
docker pull python:3.12-slim
bun install --frozen-lockfile && bun run db:generate
```

`.env` của máy demo: `DATABASE_URL`/`DIRECT_URL` trỏ `localhost:5433/bloody_roar_demo`, `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `FINALITY=latest`, `TEST_RUNNER_ENABLED=true`, `AUTH_PRIVATE_KEY` sinh riêng (`openssl rand -hex 32`), `ADMIN_WALLETS` là tài khoản Hardhat #1.

**Khởi động, đúng thứ tự:** Hardhat → deploy → migration → worker → web.

```bash
(cd packages/database && bun --env-file=../../.env x prisma migrate deploy)
bash scripts/demo/local-up.sh     # Hardhat 8545, deploy, ghi ESCROW_* vào .env, seed token, worker 4300, web 4000
BASE_URL=http://localhost:4000 bun run scripts/demo/runner-smoke.ts
```

`runner-smoke.ts` đăng nhập bằng tài khoản Hardhat #2, tạo bounty, tải source ZIP, chờ snapshot `READY`, cho base check chạy trong Docker tới `PASSED`, rồi tải link snapshot (200 với chủ bounty, 401 khi không có phiên). In `OK issue <id>` khi đạt.

- Link tải snapshot (G-11) chỉ chạy khi web và worker cùng máy, cùng bản checkout: cả hai đọc `SNAPSHOT_DIR` (mặc định `<repo>/.data/snapshots`).
- Test viết tay phải có `[TC:<testCaseId>]` trong tên test. Thiếu thẻ này, runner ghi `No assertion results` và run `FAILED` dù Vitest báo pass.
- `local-up.sh` seed bằng `ALLOW_REMOTE_DB=1`, tức bỏ chặn "chỉ DB localhost". Kiểm `.env` không trỏ Supabase trước khi chạy.

**Khôi phục sau khi Hardhat khởi động lại hoặc bị reset:**

Triệu chứng: worker `/health` trả `ok:false` với `rpcErrorStreak` tăng, log `ECONNREFUSED`. Web `/api/health` vẫn `ok` vì chỉ kiểm database.

1. Chạy lại `bash scripts/demo/local-up.sh`. Script tắt tiến trình cũ, dựng chain mới, deploy và ghi `ESCROW_ADDRESS`/`ESCROW_DEPLOY_BLOCK` mới vào `.env`, rồi khởi động lại worker và web.
2. Bắt buộc khởi động lại worker sau khi đổi `.env`. Deploy lại cho **địa chỉ escrow khác**; worker cũ vẫn báo `ok:true` sau `reorg detected; cursor rewound` nhưng đang theo dõi địa chỉ không còn contract.
3. Chạy lại `runner-smoke.ts`. Bounty và escrow cũ trong DB thuộc chain đã mất; dùng bounty mới cho demo.

## Egress (S-106, US-16)

Máy worker gọi ra ngoài tới:

| Đích | Dùng cho | Cấu hình |
|---|---|---|
| RPC của chain | indexer, kiểm cấu hình lúc khởi động, gas relayer | `RPC_URL` |
| `github.com` (HTTPS) | `git clone` repo public khi tạo source snapshot | URL repo do client nhập |
| Storage S3 (hoặc tương thích S3) | tải ZIP source đã upload | `AWS_S3_BUCKET`, `S3_ENDPOINT`; bỏ trống thì đọc đĩa local |
| Webhook cảnh báo | gửi cảnh báo | `ALERT_WEBHOOK_URL`; bỏ trống thì chỉ ghi log |
| Registry npm, PyPI | **chỉ** bước cài dependency trong container test (`--network bridge`) | không cấu hình được |

Worker không gọi API model AI; AI chạy ở web (`AI_BASE_URL`, khóa API của provider).

Container test: bước cài dependency có mạng (`bridge`), bước chạy test **không có mạng** (`--network none`), chạy UID 1000, root filesystem chỉ đọc, giới hạn CPU/RAM/PID (`apps/worker/src/runner/sandbox.ts`). Khi deploy thật, chặn egress của container cài dependency tới dải IP nội bộ, loopback và endpoint metadata cloud ở firewall của host.

## Deploy có migration (S-106, US-16)

Đúng thứ tự. **Không chạy `db:migrate` (migrate dev) trên DB production**: lệnh đó có thể đòi reset DB. Production chỉ dùng `db:migrate:prod` (`prisma migrate deploy`).

1. Sao lưu: trên Supabase chụp backup trong dashboard (chưa kiểm trong runbook này). Với Postgres tự quản:
   ```bash
   pg_dump -Fc <database> > backup.dump && pg_restore -l backup.dump | grep -c "TABLE DATA"
   ```
2. Áp migration rồi kiểm:
   ```bash
   bun run --cwd packages/database db:migrate:prod
   (cd packages/database && bun --env-file=../../.env x prisma migrate status)   # phải báo "Database schema is up to date!"
   ```
3. Khởi động worker, chờ `/health` trả `ok:true`: `bun run worker:start`.
4. Khởi động web, chờ `/api/health` trả `"database":"connected"`: `bun run start`.

Worker đi trước web vì web đọc dữ liệu do worker chiếu từ chain. Migration chỉ thêm cột nullable hoặc có default (mục 1), nên web cũ vẫn chạy trong lúc chuyển.

Đã chạy ngày 2026-11-26 trên DB demo `bloody_roar_demo`: `pg_dump` (39 bảng có dữ liệu), `db:migrate:prod` ("No pending migrations to apply"), `prisma migrate status` ("up to date"), rồi worker và web như mục Máy demo. Backup Supabase và deploy Railway chưa chạy thử.

## Cảnh báo của worker (S-106, US-16)

Job `alerts` chạy mỗi 30 giây (`apps/worker/src/alerts.ts`). Mỗi cảnh báo ghi log `"worker alert"` và gửi `ALERT_WEBHOOK_URL` nếu có.

| Cảnh báo | Nghĩa | Làm gì |
|---|---|---|
| `projection lag Ns is over 300s` | Cursor indexer đứng yên hơn 5 phút trong khi safe head đã đi trước | Xem log `job":"indexer"`. Thường do RPC chậm hoặc giới hạn range; nếu do lỗi dữ liệu thì sửa rồi chạy `bun run worker:replay --from <block>` |
| `N RPC errors in a row` | RPC lỗi liên tiếp từ 5 lần (`/health` báo `rpcErrorStreak`) | Kiểm `RPC_URL`, node còn chạy không, hạn mức của provider. Với Hardhat local: node đã tắt thì làm theo "Khôi phục" ở mục Máy demo |
| `REORG_BEYOND_WINDOW` | Reorg sâu hơn `INDEXER_REORG_WINDOW` (mặc định 64 block); worker dừng tiến cursor | Xem mục Cold start indexer: xác nhận đúng chain rồi `worker:replay` |
| `RELAYER_LOW_GAS` | Ví relayer dưới `RELAYER_MIN_GAS_WEI`; chỉ báo một lần mỗi khi xuống ngưỡng | Nạp ETH cho ví relayer (mục Auto-claim). MVP tắt relayer nên thường không gặp |
| `QUEUED_RUN_OVERDUE <runId>` | Test run nằm `QUEUED` quá 15 phút (S-401) | Kiểm `TEST_RUNNER_ENABLED=true`, Docker chạy, image `bloodyroar-test-runner:1` có sẵn (`docker images`), log `job":"test-runs"`. Mỗi run chỉ báo một lần |
| `DB_UNREACHABLE` | Job không đọc được bảng `test_runs` | Kiểm Postgres, `DATABASE_URL`; web `/api/health` cũng sẽ báo 503 |

Ngưỡng và cách gộp được kiểm bằng `apps/worker/test/alerts.test.ts` và `alerts.db.test.ts`. Trên máy demo đã thấy thật khi tắt Hardhat: `/health` trả `ok:false`, `rpcErrorStreak` tăng, log `ECONNREFUSED`. Chưa kích hoạt thật `REORG_BEYOND_WINDOW`, `RELAYER_LOW_GAS`, `QUEUED_RUN_OVERDUE`, `DB_UNREACHABLE`.

**Các mục do người khác viết, đã có trong runbook này:** cold start indexer (S-501, Kiên), relayer và auto-claim (S-109, Kiên), khởi động và khôi phục máy demo (S-113).
