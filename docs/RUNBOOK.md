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
  tối đa `INDEXER_RANGE_SIZE` block mỗi tick (mặc định 2000). Database còn xa safe block
  sẽ cần nhiều tick mới đuổi kịp. `lastCanonicalBlockHash` rỗng nên bước kiểm tra reorg
  được bỏ qua.
- Database đã migrate: map hash có thể rỗng, nhưng hash tại cursor vẫn khớp node, nên tick
  đầu quét tiếp bình thường và điền lại map trong cửa sổ thay vì dùng cache.
- Nếu map trống hoặc thiếu khóa biên mà một reorg xảy ra trước khi map được điền lại, worker
  coi depth là chưa biết: nó lùi về `ESCROW_DEPLOY_BLOCK - 1` (`rewoundTo` bằng block này)
  rồi quét lại toàn bộ thay vì báo `REORG_BEYOND_WINDOW`. Đây là hành vi mong đợi, không phải lỗi.
- Sau khi đuổi kịp safe block, `canonicalBlockHashes` có tối đa `INDEXER_REORG_WINDOW + 1`
  khóa (65 với mặc định), `reorgAlerted = false`, và `lastCanonicalBlockHash` bằng hash tại
  `lastScannedBlock`. `/health` báo `projectionLagBlocks` gần 0 và
  `rpcErrorStreak: 0`. Log không có dòng `reorg detected`.

Kiểm tra checkpoint:

```sql
select "lastScannedBlock", "lastSafeBlock", "reorgAlerted",
       jsonb_array_length(jsonb_path_query_array("canonicalBlockHashes", '$.keyvalue()')) as hashes
from projection_checkpoints
where "chainId" = <CHAIN_ID> and "contractAddress" = '<ESCROW_ADDRESS>';
```

Kiểm chứng ngày 2026-11-27: `bun run --cwd apps/worker test` trên database `_test`
đã migrate; test cold start sau restart và test reorg ngay sau migration đều xanh.

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| Worker crash với `Unknown argument canonicalBlockHashes` | Prisma client cũ hơn schema. Chạy `bun run db:generate` rồi restart. |
| Lỗi `column "canonicalBlockHashes" does not exist` | Database chưa chạy migration. Chạy `bun run --cwd packages/database db:migrate:prod` trên database đó rồi restart. |
| `lastScannedBlock` đứng yên, `hashes` vẫn 0 | Các tick đuổi kịp chưa xong, hoặc tick đang lỗi. Xem log có `RPC returned no block` (RPC thiếu block cũ, cần node lưu đủ lịch sử) hoặc lỗi giới hạn range của RPC. |
| Log có `reorg detected; cursor rewound` ngay sau cold start | Hash tại cursor không khớp node: thường do `RPC_URL` trỏ sang chain khác hoặc node local đã được khởi động lại. Kiểm tra `CHAIN_ID` và `RPC_URL`. |
| `REORG_BEYOND_WINDOW` và `reorgAlerted = true` | Hash biên cửa sổ đã đổi, nghĩa là reorg sâu hơn `INDEXER_REORG_WINDOW`. Map thiếu khóa biên không gây alert: worker coi depth là chưa biết, lùi về `ESCROW_DEPLOY_BLOCK - 1` và quét lại toàn bộ. Khi alert thật: worker dừng tiến cursor; xác nhận chain đúng và điểm fork, rồi replay từ một block đã xác nhận nằm dưới fork. Mặc định an toàn là `bun run worker:replay --from <ESCROW_DEPLOY_BLOCK>`; nếu đã xác định fork cao hơn, dùng block thấp hơn fork nhưng không thấp hơn `ESCROW_DEPLOY_BLOCK`. Replay đặt cursor về `from - 1` và `lastCanonicalBlockHash = ""`; tick kế tiếp có thể log thêm `reorg detected; cursor rewound` một lần trước khi quét, rồi tự đặt `reorgAlerted = false`. |
| Hardhat local khởi động lại, cursor cao hơn block hiện tại | Chain mới, checkpoint cũ không còn hợp lệ. Chạy `bun run --cwd packages/database db:reset` để dựng lại database local (lệnh này xóa toàn bộ dữ liệu local), rồi deploy và chạy lại. Nếu chỉ xóa dòng checkpoint, `chain_events` và projection cũ vẫn còn và sẽ lẫn với chain mới. Sau đó kiểm lại `ESCROW_ADDRESS`/`ESCROW_DEPLOY_BLOCK` và chạy `bun run db:seed:local` nếu cần dữ liệu local. |
