# A1 — Nền tảng, bảo mật, upload, CI, deploy

**Đọc trước:** [`README.md`](README.md) (quyền sở hữu, hợp đồng, quy tắc chung).
**Branch:** `be/a1-platform` · **Worktree:** `/Users/admin/repos/capstone1-wt/a1`
**Ước lượng:** ~9 ngày công cho P0/P1, ~4 ngày cho P2.

---

## 1. Phạm vi

**Được sửa:**
- `apps/web/src/lib/config/**` (mới), `apps/web/src/lib/env.ts`
- `apps/web/src/lib/rate-limit.ts` (mới), `apps/web/src/lib/request-context.ts` (mới), `apps/web/src/lib/logger.ts`
- `apps/web/src/lib/auth/**`, `apps/web/src/lib/auth.ts`, `apps/web/src/lib/server-session.ts`, `apps/web/src/lib/admin-wallets.ts`
- `apps/web/src/lib/github/**` (mới), `apps/web/src/app/api/auth/**`, `apps/web/src/app/api/webhooks/**`
- `apps/web/src/app/api/graphql/route.ts`, `apps/web/src/graphql/yoga-guards.ts` (mới)
- `apps/web/src/app/api/uploads/**`, `apps/web/src/app/api/files/**` (mới), `apps/web/src/lib/storage.ts`
- `apps/web/src/graphql/modules/user/**`
- `apps/web/server.ts` (trừ dòng của A3)
- `apps/web/scripts/grant-admin.ts` (mới)
- `apps/web/vitest.integration.config.ts` (mới), `apps/web/src/test/integration/**` (mới)
- `apps/web/src/test/{auth-challenge,siwe,graphql-client,profile-input}.test.ts`
- `packages/database/src/seed.ts`, `packages/database/src/seed-prod.ts`, xóa `packages/database/apps/**`
- `.github/**` (mới), `Dockerfile`, `railway.json`, `docker-compose.yml`, `.env.example`, `package.json` gốc (chỉ script test và CI)
- `docs/DEPLOY.md`, `docs/RUNBOOK.md` (mới), `docs/AUTHZ_MATRIX.md` (mới), `docs/PRODUCT_BACKLOG.md`, `docs/documentation_bloody-roar.md`

**Không sửa:** `schema.prisma`, `apps/worker/**`, `socket/**`, `ai/**`, `lib/escrow/**`, `packages/shared/**`, các module GraphQL khác.

**Phụ thuộc:**
- Từ A3 (mốc 1): cột `Attachment.purpose`, `sha256`, `status`; model `GithubWebhookDelivery`; `directUrl` trong schema.
- Từ A5 (mốc 1): `createNotificationIdempotent` (dùng ở BE-70).
- Từ A2 (mốc 2): `ESCROW_CONSTANTS`, `getCode` helper (dùng ở BE-91).

**Đầu ra:**
- `rate-limit.ts` (mốc 1): A4 và A5 dùng.
- `config/env.ts` (mốc 1): có biến `AI_HASH_KEY` cho A5.
- `storage.ts` có `getSignedUrl` (mốc 2): A5 dùng ở BE-58.

---

## 2. Thứ tự làm

1. **Ngày 1, làm đầu tiên:** `rate-limit.ts`. Đẩy lên và báo mốc. Sau đó BUG-9, BUG-6, BUG-1.
2. BE-60 (web) và `.env.example`. Thêm `AI_HASH_KEY`.
3. BE-01, BE-02, BE-07.
4. BE-73, BE-93.
5. BE-50, BE-50a, BE-50b.
6. BE-69, BE-70.
7. BE-05 (BUG-3): seed và CLI.
8. BE-72, BE-71, BE-74.
9. BE-80, BE-84, BE-85, BE-86, BE-87.
10. BE-88, BE-89, BE-90, BE-91.
11. BE-59 (phần server).
12. P2: BE-03, BE-04, BE-08, BE-10, BE-11, BE-50c, BE-92, BE-94.

---

## 3. Task

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BUG-1** (= BE-06) | GitHub OAuth. Đưa `keyBytes()` vào `lib/github/crypto.ts`. Route start và callback dùng cùng hàm này. Route start không còn dùng chuỗi env thô. | Unit test: key hex 64 ký tự và base64url 43 ký tự đều verify được. |
| **BUG-9** | `app/api/auth/nonce` dùng `logger` thay `console.error`. | `grep -rn console.error apps/web/src/app/api` không còn kết quả. |
| **BUG-6** | Xóa `packages/database/apps/**` (file generate lạc chỗ). | Git không còn file đó. |
| **BUG-3** (= BE-05, BE-76 phần admin) | Seed đọc `ADMIN_WALLETS` thay ví `0x…dead`. Thêm CLI `apps/web/scripts/grant-admin.ts <address>`: đặt role ADMIN, ghi `AdminLog`. | Test parse `ADMIN_WALLETS` (khoảng trắng, chữ hoa/thường). Chạy CLI với ví test → role ADMIN. |
| **BE-60** (web) | `lib/config/env.ts` dùng zod. Thiếu biến bắt buộc ở production thì fail-fast với thông báo rõ. Cập nhật `.env.example`: ESCROW_*, CHAIN_ID, RPC, USDC, S3_*, ADMIN_WALLETS, AI_HASH_KEY. Phần worker do A3 làm. | Test schema: thiếu biến → lỗi có tên biến. |
| **BE-01** | Rate limit `/api/auth/nonce` và `/api/auth/login` theo IP và address. | Vượt ngưỡng trả 429 kèm `Retry-After`. |
| **BE-02** | Khi consume nonce bị P2002, trả lỗi replay rõ ràng. Chain và domain đã kiểm rồi. | Test: dùng lại nonce → lỗi replay. |
| **BE-07** | Mutation `unlinkGithub`. Khi link GitHub đã thuộc ví khác, trả `GITHUB_ALREADY_LINKED`. | Test hai trường hợp. |
| **BE-08** (P2) | Callback GitHub không lưu access token nữa. | Không còn ghi `githubAccessTokenEncrypted`. |
| **BE-50** | `lib/storage.ts` đọc `S3_ENDPOINT` và `S3_FORCE_PATH_STYLE`. Bucket private. Tải file qua signed URL. | Test cấu hình. Không gọi mạng trong test. |
| **BE-50a** | Upload có `purpose` (`CHAT`, `ISSUE_IMAGE`, `DELIVERY`, `EVIDENCE`, `AVATAR`). Attachment tạo ở trạng thái `PENDING`. **Lệch QĐ-28:** tính `sha256` ngay khi upload từ bytes đã có, không để worker tính lại. Ghi lý do vào báo cáo. | Test: `sha256` trả về khớp hash của bytes. |
| **BE-50b** | `GET /api/files/[id]`. `DELIVERY` và `EVIDENCE` chỉ cho người tham gia issue. `EVIDENCE` cho thêm admin khi có dispute. Admin xem thì ghi `AdminLog`. | Test bốn vai trò: khách, người ngoài, người tham gia, admin. |
| **BE-11** (P2) | Upload avatar với `purpose = AVATAR`, lưu URL vào User qua `updateProfile`. | Test. |
| **BE-10** (P2) | Thêm `email` vào `updateProfile`: validate định dạng, unique. | Test. |
| **BE-69** | Webhook GitHub: dedupe theo header `X-GitHub-Delivery` (bảng `GithubWebhookDelivery`). Lệch timestamp quá 5 phút thì bỏ. | Gửi lại cùng delivery → không xử lý lần hai. |
| **BE-70** | PR merged chỉ tạo thông báo cho client, qua `createNotificationIdempotent`. Không gọi mutation tiền nào. | Test: không có lệnh gọi nào tới lớp escrow. |
| **BE-72** | `rate-limit.ts` in-memory. Áp cho uploads, auth, và GraphQL theo cost (mutation = 5, query = 1). | Test ngưỡng. |
| **BE-73** | Trong `yoga-guards.ts`: giới hạn depth (10), số alias (10), kích thước body (200 KB). Tắt introspection khi production. POST phải có `content-type: application/json`. Không thêm dependency. | Test từng guard. |
| **BE-93** | `request-context.ts` dùng `AsyncLocalStorage`, đọc hoặc sinh `x-request-id`. Logger thêm `requestId`. Plugin Yoga ghi tên operation, thời gian, lỗi. | Test: log có `requestId`. |
| **BE-74** | `docs/AUTHZ_MATRIX.md`: mỗi mutation × {khách, người ngoài, client, developer, admin, bị khóa}. | Bảng đủ mọi mutation hiện có. Mutation mới của A4 và A5 bổ sung vào cuối. |
| **BE-80** | `vitest.integration.config.ts`, script `test:integration`. Yêu cầu `DATABASE_URL` trỏ DB tạm. Chạy `prisma migrate reset --force --skip-seed` trước. Một test mẫu qua `yoga.fetch`. | Chạy được với Postgres local. |
| **BE-84** | CI chạy các script `apps/web/scripts/e2e-*.ts` không cần chain. Script cần chain thì ghi danh sách, chuyển cho A3. | Danh sách trong báo cáo. |
| **BE-85** | `.github/workflows/ci.yml`: `bun install --frozen-lockfile` → `db:generate` → lint → typecheck → test → build. Service Postgres 16. | File workflow hợp lệ. Nếu chưa chạy được trên GitHub, ghi rõ. |
| **BE-86** | `.github/workflows/contracts.yml`: compile, Hardhat test, forge test (fuzz và invariant), coverage, slither, deploy dry-run. | Như trên. |
| **BE-87** | CI: `prisma migrate diff --exit-code` và gitleaks. | Như trên. |
| **BE-59** (phần server) | `maxHttpBufferSize` (256 KB) khi tạo `SocketIOServer`. Graceful shutdown trong `server.ts`: SIGTERM đóng io, http, prisma. | Test thủ công được ghi trong báo cáo. |
| **BE-88** | `Dockerfile`: CMD web. Worker dùng cùng image với CMD khác. | `docker build` nếu máy có Docker. Không có thì ghi "chưa kiểm". |
| **BE-89** | `railway.json`: hai service. Web healthcheck `/api/health`. Worker healthcheck riêng. `preDeployCommand` chạy `db:migrate:prod`. | Đọc file và ghi `docs/DEPLOY.md`. |
| **BE-90** | Supabase: `DATABASE_URL` là pooled, `DIRECT_URL` dùng cho migrate (A3 thêm `directUrl` vào schema). Bucket private. Service key chỉ ở server. | `docs/DEPLOY.md` mô tả đủ. |
| **BE-91** | Khi boot: kiểm `CHAIN_ID` khớp với manifest, và có bytecode tại `ESCROW_CONTRACT_ADDRESS` (viem `getCode`). Không khớp thì không khởi động. | Test với client giả. |
| **BE-71** | Sửa backlog và tài liệu: bỏ auto-pay (S3-GH-07, US-8.4), sửa AC S1-MKP-08 theo UC-01, S2-DSP-03 (admin chỉ soạn bản nháp), `documentation_bloody-roar.md` §9. | `grep -i "auto-pay"` trong backlog không còn mục đang làm. |
| **BE-03** (P2) | Refresh session, `mySessions`, `revokeSession`. Job dọn session hết hạn qua runtime của A3. | Test. |
| **BE-04** (P2) | Job dọn session. | Test hàm chọn bản ghi. |
| **BE-50c** (P2) | Job xóa upload `PENDING` quá 24h, đăng ký qua `registerJob` của A3. | Test hàm chọn bản ghi. |
| **BE-92** (P2) | `docs/RUNBOOK.md`: rollback = redeploy image trước. Contract không upgrade. | File tồn tại và đủ mục. |
| **BE-94** (P2) | Sentry có lọc PII. **Cần thêm dependency**, dừng và hỏi người điều phối trước. | Chỉ làm khi được duyệt. |

---

## 4. Kiểm tra trước khi báo cáo

- `bun run typecheck`
- `bun run lint`
- `bun run --cwd apps/web test`
- Với BE-80: `bun run --cwd apps/web test:integration` trên DB riêng.

Báo cáo theo mẫu trong `README.md` mục 8, lưu vào `docs/plan/parallel/reports/A1.md`.
