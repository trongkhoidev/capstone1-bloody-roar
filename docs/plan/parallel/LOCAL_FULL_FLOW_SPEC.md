# Đặc tả: backend chạy đủ luồng ở local (29/10/2026)

Đọc cùng `DECISIONS.md` (quyết định đã chốt) và `FIX_LIST.md` (chi tiết từng mục P0, P1, P2). Đọc `HANDOFF_2026-10-28.md` để biết bối cảnh. File này là nguồn chính cho thứ tự làm và kịch bản test.

---

## 0. Định nghĩa xong

Giai đoạn này xong khi tất cả điều sau đúng:

1. `bun run test:e2e:local` xanh. Mọi kịch bản E1 đến E31 pass.
2. Gate xanh, cùng một lần chạy:
   - `bun run typecheck` (web, worker, database, shared)
   - `bun run lint`
   - `bun run --cwd apps/web test`
   - `bun run --cwd apps/worker test`
   - `bun run --cwd packages/database test`
   - `bun run contracts:test` (35/35)
3. Chạy được bằng tay theo `docs/LOCAL_DEV.md`: DB, hardhat, deploy, worker, web ở port 4010. Đăng nhập bằng ví hardhat, tạo bounty, ứng tuyển, chọn người, nạp tiền, giao việc, release, claim.
4. Mọi mục trong `FIX_LIST.md` và mọi mục N trong file này có dòng trong `LOCAL_TEST_MATRIX.md`, kèm file test và trạng thái.
5. `reports/CODEX.md` cập nhật theo từng commit.

Không thuộc phạm vi giai đoạn này: deploy, Docker, Railway, Sentry, GitHub Actions chạy thật, PR, GitGuardian, AI-17, AI-18.

---

## 1. Quy tắc an toàn (bắt buộc)

- **Database:** theo Q1 trong `DECISIONS.md`. Trước mỗi lệnh ghi DB, in tên database (không in mật khẩu) và kiểm tra tên.
- **`.env`:** chỉ sửa `.env` của worktree `integration` theo mục 2.2. Không sửa `.env` của repo chính (`/Users/admin/repos/capstone1`).
- **Dịch vụ thật:** để trống theo D-ENV-3. Lệnh `check-env` (N-14) phải pass trước mọi lần chạy E2E.
- **Process:** chỉ dừng PID đã ghi trong `tests/e2e/.run/`. Không dừng process ở port 4000. Không dùng `pkill` theo tên.
- **Git:** commit theo từng mục. Không push. Không tạo PR. Không commit `.env`, `apps/web/.uploads/`, `apps/contracts/deployments/`, `tests/e2e/.run/`.
- **Tài nguyên:** máy 16 GB, dùng chung với các ứng dụng khác. Không chạy build song song. Không mở quá 3 server cùng lúc (hardhat không tính, nó là process riêng).
- **Test chỉ trên `_test`:** mọi lệnh test và reset đều đi qua `assertTestDatabase`.

---

## 2. Môi trường local

### 2.1 Database

- Cùng server Postgres với `.env` hiện tại (localhost:5433, user và mật khẩu lấy từ `.env`).
- `bloody_codex_local`: DB chạy tay. Đã có.
- `bloody_codex_test`: DB test và E2E. Đã có (migrate đến `escrow_projection` và các migration sau P0-3).
- Không dùng `bloody_roar_local`, `bloody_roar_dev`, `bloody_integration`.

### 2.2 `.env` của worktree (`/Users/admin/repos/capstone1-wt/integration/.env`)

Đặt các biến sau. Giá trị không được in ra output.

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | cùng trỏ `bloody_codex_local` | cũng sửa `packages/database/.env` |
| `PORT` | `4010` | D-DEV-1 |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:4010` | |
| `ADMIN_WALLETS` | địa chỉ hardhat #1 | D-ACC-1 |
| `AUTH_PRIVATE_KEY` | giữ nguyên | đã có |
| `THIRDWEB_SECRET_KEY`, `THIRDWEB_CLIENT_ID` | giữ nguyên | không dùng khi chạy local |
| `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | **để trống** | D-ENV-3 |
| `AI_BASE_URL`, `AI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | **để trống** | D-ENV-3 |
| `AI_EXTERNAL_GUARD` | `false` | D-AI-1 |
| `RPC_URL` | `http://127.0.0.1:8545` | D-ENV-1 |
| `CHAIN_ID` | `31337` | D-ENV-2 |
| `ESCROW_ADDRESS` | lấy từ manifest sau khi deploy | mục 2.3 |
| `ESCROW_DEPLOY_BLOCK` | lấy từ manifest sau khi deploy | |
| `FINALITY` | `latest` | D-FIN-1 |
| `WORKER_PORT` | `4011` | |
| `ALERT_WEBHOOK_URL` | để trống | |

Xóa các biến đã bỏ theo D-ENV-1: `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, `ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA`, `ESCROW_CHAIN_ID`, `BASE_SEPOLIA_RPC_URL`, `ALCHEMY_RPC_URL_*`, `INFURA_RPC_URL_*`, `AWS_S3_BUCKET` (đã để trống ở trên).

### 2.3 Hardhat và deploy

1. Hardhat node: `bun run --cwd apps/contracts node`, cổng 8545. Nếu cổng 8545 đang bị process khác dùng, dừng và báo lỗi, không kill process đó.
2. Deploy: `bun run --cwd apps/contracts deploy:local`. Lệnh này deploy MockUSDC, tạo owner, arbiter và fee recipient từ 4 signer hardhat khác nhau, và ghi `apps/contracts/deployments/localhost.json`.
3. Đọc từ manifest: `token`, `escrow`, `arbiter`, `feeRecipient`, `deployBlock`. Nếu tên trường khác, dùng tên thật và ghi vào `LOCAL_DEV.md`.
4. Ghi `ESCROW_ADDRESS` và `ESCROW_DEPLOY_BLOCK` vào `.env` theo mục 2.2.

### 2.4 Worker

- Chạy: `bun run --cwd apps/worker start`. Đọc env theo mục 2.2.
- Kiểm tra: `curl -s http://localhost:4011/health` trả JSON có `lastSafeBlock`, `checkpointAgeSec`, `rpcLatencyMs`, `projectionLagBlocks`.

### 2.5 Web

- **Không** dùng `bun run dev` cho đến khi N-5 xong, vì script đang hardcode 4000.
- Chạy: `cd apps/web && PORT=4010 bun run server.ts`. Không đặt `NODE_ENV=production` khi chạy local. Storage local chỉ bật khi không ở production.
- Kiểm tra: `curl -s http://localhost:4010/api/health` trả `{"status":"ok","database":"connected",...}`.

### 2.6 Seed

- **Cho E2E:** harness tự seed (N-9). Chỉ tạo token MockUSDC với `chainId = CHAIN_ID` (31337), `address = token` trong manifest, `decimals = 6`, `isActive = true`. Không seed user demo.
- **Cho xem giao diện bằng tay:** `ADMIN_WALLETS=<hardhat #1> bun run --cwd packages/database db:seed` trên `bloody_codex_local`. Seed hiện ghi token USDC `chainId = 84532`. Sửa để lấy `chainId` từ `CHAIN_ID` (N-3). Seed chỉ dùng `upsert`, không xóa dữ liệu.

---

## 3. Biến môi trường cho test

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `TEST_DATABASE_URL` | `…/bloody_codex_test` | bắt buộc, tên phải kết thúc `_test` |
| `RPC_URL` | `http://127.0.0.1:8545` | |
| `CHAIN_ID` | `31337` | |
| `ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK` | từ manifest | harness ghi vào process env |
| `FINALITY` | `latest` | |
| `AI_BASE_URL` | `http://127.0.0.1:4019` | mock AI của N-7 |
| `AI_EXTERNAL_GUARD` | `false` | |
| `ADMIN_WALLETS` | địa chỉ hardhat #1 | |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:4012` | port server E2E |
| `AWS_S3_BUCKET` | rỗng | |

Code test phải gán `process.env.DATABASE_URL = TEST_DATABASE_URL` và `DIRECT_URL` giống vậy, trước mọi import Prisma (N-1).

---

## 4. Việc mới (mục N)

**N-1. Guard database test.**
- Thêm `packages/database/src/test-guard.ts` với `assertTestDatabase(url)`. Nó lấy tên DB từ URL, throw nếu tên không kết thúc bằng `_test`, và throw ngay nếu tên thuộc danh sách cấm (`bloody_roar_local`, `bloody_roar_dev`, `bloody_integration`, `bloody_codex_local`).
- Gọi từ: `apps/web/src/test/setup.ts`, `apps/worker/test/preload.ts` (thêm `[test] preload` vào `apps/worker/bunfig.toml`), và đầu mọi test của `packages/database/test/`.
- Test của chính guard: tên hợp lệ pass, tên `bloody_roar_local` và tên không có `_test` đều throw.

**N-2. Tên biến môi trường thống nhất (D-ENV-1).**
- Sửa `apps/web/src/lib/escrow/*`, các module escrow GraphQL, `apps/worker/src/config.ts`, `.env.example`, `docs/DEPLOY.md`.
- Test: config đọc đủ `RPC_URL`, `CHAIN_ID`, `ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK`. Thiếu biến thì báo đúng tên biến.

**N-3. Chain ID (D-ENV-2).**
- `packages/shared/src/constants/index.ts`: `ACTIVE_CHAIN_ID` trên server đọc `CHAIN_ID`, mặc định 84532. Phía client giữ 84532, có comment.
- Sửa 12 chỗ dùng `84532` (`grep -rn 84532 apps packages --include=*.ts` để tìm, bỏ qua test fixture).
- Sửa seed (mục 2.6).
- Test: token có `chainId` khác `CHAIN_ID` thì `createIssue` và `selectDeveloper` từ chối.

**N-4. Finality (D-FIN-1).**
- Worker đọc `FINALITY`. `safe` gọi `eth_getBlockByNumber("safe")`. `latest` dùng block mới nhất.
- Test: `FINALITY=latest` không gọi tag `safe`.

**N-5. Script dev theo PORT (D-DEV-1).**
- `package.json` gốc và `apps/web/package.json`: `dev` đổi `PORT=4000` thành `PORT=${PORT:-4000}`. Thêm script `serve:local` ở `apps/web`: `PORT=${PORT:-4010} bun run server.ts`.
- Test: `PORT=4012 bun run serve:local` lắng nghe 4012 (smoke, không cần chạy lâu).

**N-6. Storage local.**
- Xác nhận upload và tải file dùng `apps/web/.uploads/` khi không có S3 và không ở production. Bảo đảm `.uploads/` có trong `.gitignore`.
- Test: upload rồi tải lại, `sha256` khớp. Ở production (`NODE_ENV=production`) route trả 503 khi không có S3.

**N-7. AI giả.**
- `tests/e2e/mocks/ai-server.ts`: HTTP server ở `127.0.0.1:4019`. Trả JSON cố định đúng schema cho sinh test case, phân tích dispute (có citation), và pass LLM của guard.
- Test: `AI_BASE_URL` trỏ đến mock. Không có lời gọi ra mạng ngoài. Đếm số lời gọi để kiểm tra.

**N-8. Harness E2E.**
- `tests/e2e/run-local.ts` làm đúng trình tự mục 5. Thêm script gốc `test:e2e:local`.

**N-9. Seed E2E.**
- `tests/e2e/harness/seed.ts`: tạo token MockUSDC theo manifest, không tạo user nào.

**N-10. Ma trận test.**
- `docs/plan/parallel/LOCAL_TEST_MATRIX.md`: mỗi dòng là một mã (mục trong FIX_LIST, N-x, hoặc E-x), cột "file test", cột "lệnh", cột "trạng thái".

**N-11. Tài liệu chạy local.**
- `docs/LOCAL_DEV.md`: các lệnh trong mục 2, kèm kết quả kiểm chạy được. Ghi tên thật của trường trong manifest.

**N-12. Chuyển reorg e2e.**
- `apps/worker/e2e/reorg.e2e.ts` thành kịch bản E22 trong `tests/e2e/`. Giữ nội dung kiểm tra.

**N-13. Dependency mới (D-DEP-1).**
- `socket.io-client` (devDependency gốc), `pino` (worker, cùng phiên bản với web). Ghi phiên bản và ngày phát hành (phải cũ ít nhất 2 tuần).

**N-14. Kiểm tra môi trường.**
- `tests/e2e/check-env.ts`: fail nếu `AWS_S3_BUCKET`, `AI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` có giá trị, hoặc `AI_BASE_URL` không bắt đầu bằng `http://127.0.0.1` hoặc `http://localhost`, hoặc `TEST_DATABASE_URL` không kết thúc bằng `_test`.
- Test: chạy với từng vi phạm, mỗi lần phải fail đúng.

**D-NOTI-1. Thông báo (thay P0-1 và P1-29).**
- Nội dung viết tại nơi tạo, không có bản đồ chung.
- Mỗi giá trị `NotificationType` phải có ít nhất một nơi tạo thật. Giá trị nào không có nơi tạo sau khi làm xong thì xóa khỏi enum bằng migration, và ghi vào `DECISIONS.md`.
- Bảng nơi tạo (xem mục 6.2).

---

## 5. Trình tự harness (N-8)

1. `check-env` (N-14). Kiểm `TEST_DATABASE_URL` và `assertTestDatabase`.
2. Kiểm cổng 8545 trống. Nếu không trống thì dừng. Khởi động `hardhat node`, ghi PID vào `tests/e2e/.run/hardhat.pid`.
3. Compile và `deploy:local`. Đọc manifest.
4. Reset DB test: `DATABASE_URL=$TEST_DATABASE_URL bun run --cwd packages/database prisma migrate reset --force --skip-seed`. Chỉ được chạy sau khi `assertTestDatabase` pass.
5. Seed E2E (N-9).
6. Khởi động worker với env test, ghi PID vào `.run/worker.pid`. Chờ `/health` trả OK, tối đa 60 giây.
7. Khởi động web ở port 4012, ghi PID vào `.run/web.pid`. Chờ `/api/health`, tối đa 300 giây (compile lần đầu có thể lâu).
8. Chạy `bun test tests/e2e`. Test dùng `yoga.fetch` cho GraphQL, ví hardhat cho ký và gửi tx, mock AI (N-7), và socket client cho E19.
9. Teardown: dừng worker, web, hardhat theo PID đã ghi. Xóa `.run/`. **Giữ DB test** để điều tra.
10. Ghi tóm tắt vào `tests/e2e/.run/last-run.txt` và in ra màn hình.

**Chờ kết quả:** không dùng `sleep` cố định. Dùng vòng lặp kiểm tra projection, tối đa 60 giây cho mỗi điều kiện.

**Thời gian trên chain:** dùng `evm_increaseTime` và `evm_mine`. Thời gian trong DB: sửa cột về quá khứ rồi gọi job (D-TIME-1).

---

## 6. Kịch bản E2E

Mỗi kịch bản là một hoặc nhiều test. Số tiền dùng đơn vị USDC 6 số thập phân.

**Phí:** 2,5% chỉ tính trên phần Developer (QĐ-02). Với bounty 100 USDC:
- Release: Developer 97,5 USDC, fee recipient 2,5 USDC.
- Settlement 3000 bps (client 30%): client 30, Developer 68,25, fee 1,75.
- Ruling 5000 bps: client 50, Developer 48,75, fee 1,25.
- Ruling 7000 bps: client 70, Developer 29,25, fee 0,75.
- Arbiter timeout split: client 50, Developer 48,75, fee 1,25.
- Missed delivery refund: client 100, không phí.
- Review timeout: giống release.

### 6.1 Kịch bản

- **E1. Đăng nhập.** Nonce, ký `personal_sign` bằng ví hardhat, login, `me`, logout. Ví admin có role ADMIN. Ví user 8 (đã ban) không đăng nhập được.
- **E2. Marketplace.** Client tạo issue (100 USDC, deadline +30 ngày). Người ngoài (7) thấy issue trong danh sách. `recordIssueView` dedupe 1 giờ (xem BUG-7).
- **E3. Tiêu chí.** Client sinh test case bằng AI mock, approve một tiêu chí, tạo rồi xóa một test case thủ công. Sửa tiêu chí đã approve thì `termsVersion` tăng (P1-13).
- **E4. Ứng tuyển và chọn.** Dev1 và dev2 ứng tuyển. Client không ứng tuyển được issue của mình. Client chọn dev1 với deliveryDeadline +5 ngày. Kết quả: reservation `AWAITING_FUNDING`, issue `AWAITING_FUNDING`, application dev2 `PENDING`. Thông báo `NEW_APPLICANT` (client), `FUNDING_REQUIRED` (dev1). Hai `selectDeveloper` song song: đúng một thắng.
- **E5. Nạp tiền.** Client ký FundingIntent bằng `eth_signTypedData_v4`. `submitFundingIntent` pass. `prepareEscrowDeposit` trả các bước. Gửi từng bước bằng `eth_sendTransaction` theo đúng thứ tự, `recordTransactionSubmitted`. Chờ worker. Kết quả: projection `FUNDED`, issue `IN_PROGRESS`, dev1 `ACCEPTED`, dev2 `REJECTED`, reservation `FUNDED`, intent `CONFIRMED` (chỉ sau khi event được fold). Thông báo `APPLICATION_ACCEPTED` và `TASK_ASSIGNED` (dev1), `APPLICATION_REJECTED` (dev2), `DEPOSIT_CONFIRMED` (client). Số dư contract = 100 USDC.
- **E6. Nạp lệch.** Deposit với amount khác, rồi với developer khác. Kết quả: reservation `MISMATCHED`, issue không `IN_PROGRESS`. Thông báo `DEPOSIT_MISMATCHED` cho client, dev1 và admin.
- **E7. Reservation hết hạn.** Sửa `expiresAt` về quá khứ, chạy job. Kết quả: `EXPIRED`, issue `OPEN`, thông báo `RESERVATION_EXPIRED` (dev1). Hai case thêm: deposit đến sau hết hạn khi issue còn `OPEN` thì được nhận. Deposit đến sau khi issue đã chọn người khác thì `MISMATCHED`.
- **E8. Hủy reservation.** Client `cancelReservation` trước khi nạp. Kết quả: `CANCELLED`, issue `OPEN`.
- **E9. Giao việc và yêu cầu sửa.** Dev1 `createSubmissionDraft`, `prepareSubmitWork`, gửi tx. Chờ fold `WorkSubmitted`. Kết quả: submission `SUBMITTED`, `deliveryHash` khớp. Thông báo `WORK_SUBMITTED` (client). Client `requestChanges`: thông báo `CHANGES_REQUESTED` (dev1). Dev1 nộp lại: bản cũ `SUPERSEDED`. Nộp sau deadline: từ chối.
- **E10. Release và claim.** Client `prepareReleaseFunds`, gửi `releaseFunds`. Kết quả: `ESCROW_RESOLVED` kind `RELEASE`, issue `COMPLETED`, outcome `RELEASE`. `ClaimableBalance` dev1 = 97,5 khớp `claimable()` on-chain. Fee recipient = 2,5. Dev1 `prepareClaim`, gửi `claim`. Kết quả: `Claimed`, balance dev1 về 0, số dư ví dev1 tăng 97,5 (đo bằng `balanceOf`). Thông báo `ESCROW_RESOLVED` (cả hai), `FUNDS_CLAIMABLE` (dev1, fee recipient), `PAYMENT_RECEIVED` (dev1 khi claim).
- **E11. Quyền claim.** Người ngoài (7) gọi `prepareClaim` với recipient là người khác: bị từ chối. Người có balance 0: bị từ chối.
- **E12. Hoàn tiền khi không giao.** Escrow mới, không có submission. Trước deadline: `prepareClaimMissedDeliveryRefund` bị từ chối. Sau deadline (`evm_increaseTime`): người ngoài (7) gọi được (P0-6). Gửi tx. Client có claimable 100. Client claim.
- **E13. Review timeout.** Escrow mới có submission. Trước deadline + 7 ngày: từ chối. Sau mốc: dev1 `prepareClaimReviewTimeout` được. Dev1 nhận 97,5, fee 2,5.
- **E14. Thỏa thuận.** Escrow mới đang `FUNDED`. Client `proposeSettlement(3000)`. Dev1 tự accept đề xuất của mình: từ chối. Dev1 accept: `SETTLEMENT`, client 30, dev1 68,25, fee 1,75. Nhánh revoke: đề xuất rồi thu hồi, thông báo `SETTLEMENT_REVOKED`, không còn pending. Thông báo `SETTLEMENT_PROPOSED` (đối phương).
- **E15. Tranh chấp, không kháng cáo.** Escrow mới có submission. Client `raiseDispute` với manifest (file `EVIDENCE` upload local, `sha256` khớp). Thông báo `DISPUTE_RAISED` cho dev1 và admin. Dev1 nộp bằng chứng trong 72 giờ, thông báo `EVIDENCE_SUBMITTED` (client). Arbiter (account 5) `postInitialRuling(5000, decisionHash)` sau 72 giờ, thông báo `RULING_POSTED`. Qua 7 ngày, `finalizeRuling`: kết quả 50/48,75/1,25, thông báo `DISPUTE_RESOLVED` (cả hai). Admin `draftRuling(5000)` trả JSON Safe. Giải mã `data` trong JSON và so với calldata của `postInitialRuling`.
- **E16. Tranh chấp, có kháng cáo.** Arbiter `postInitialRuling(3000)`. Client `challengeRuling` (client nhận ít hơn toàn bộ nên được phép). Thông báo `RULING_CHALLENGED`. Dev1 challenge sau đó: từ chối (đã có challenge). Arbiter `postFinalRuling(7000)`. Chờ 24 giờ, `finalizeRuling`: 70/29,25/0,75. Challenge sau 7 ngày: từ chối.
- **E17. Arbiter không phán.** Escrow `DISPUTED`. Trước 30 ngày: `finalizeArbiterTimeoutSplit` bị từ chối. Sau 30 ngày: người ngoài gọi được, kết quả 50/48,75/1,25, thông báo `DISPUTE_RESOLVED`. Nhánh `CHALLENGED`: tính 30 ngày từ lúc challenge.
- **E18. Chat.** Client và dev1 nhắn trong room issue (`IN_PROGRESS`). Người ngoài bị từ chối. Sau `COMPLETED`: chỉ đọc. Khi `DISPUTED`: admin chỉ đọc. Tin gửi sau mốc dispute có `afterDispute = true`. Số giả kiểu private key bị che bởi guard. Tin nhắn mới gửi thông báo `MESSAGE_RECEIVED` cho người kia.
- **E19. Realtime.** Socket client vào room. Sau deposit nhận `escrow:invalidate`. Khi có thông báo nhận `notification:new`. Sau khi bị ban, socket bị ngắt. Session hết hạn thì gửi tin bị từ chối (BUG-12).
- **E20. Thông báo.** `notifications` có cursor. `unreadCount`. `markNotificationRead`. `markAllNotificationsRead`.
- **E21. Admin.** `adminStats` khớp projection. `adminLogs` có các hành động `grant_admin`, `hide_issue`, `ban_user`. `banUser`: issue `OPEN` của user bị hủy, application `PENDING` bị từ chối (BE-13). `setUserRole` không cho tự hạ quyền (BE-66a). `adminHideIssue`: issue ẩn không hiện trong marketplace (BE-64). `indexerStatus`, `reconciliationFindings`, `contractConfig` trả đúng.
- **E22. Reorg.** Snapshot, deposit A, `evm_revert`, deposit B khác. Projection theo B. Event A `canonical = false`, event B `canonical = true`. (Đã có trong `apps/worker/e2e/reorg.e2e.ts`.)
- **E23. Reconciler.** Chain khỏe: không có finding. Sửa tay projection: có finding. Sửa lại: finding đóng.
- **E24. Replay.** `replay --from <block>` dựng lại projection, trạng thái giống lần chạy đầu.
- **E25. Upload và quyền file.** Upload `DELIVERY` (local). Người tham gia tải được. Người ngoài nhận 403. `EVIDENCE`: admin tải được khi có dispute, ghi `AdminLog`. `sha256` khớp.
- **E26. Webhook GitHub.** Payload PR merged có chữ ký (secret test). Client nhận thông báo. Gửi lại cùng delivery id: không xử lý lần hai. Không gửi tx nào.
- **E27. Rate limit.** Nonce lần thứ 11 cùng địa chỉ: 429 kèm `Retry-After`. GraphQL vượt điểm: lỗi.
- **E28. Ma trận quyền.** Mỗi mutation trong `AUTHZ_MATRIX.md` có ít nhất một test cho các vai trò: khách, người ngoài, người tham gia, admin, bị khóa.
- **E29. Kiểm tra cấu hình.** Web và worker không khởi động khi `ESCROW_ADDRESS` không có bytecode, hoặc `CHAIN_ID` khác manifest (P1-32).
- **E30. Thông báo deadline.** Job tạo `DEADLINE_APPROACHING` đúng một lần cho mỗi mốc (dedupeKey).
- **E31. Luồng liên tục.** Chạy E5 đến E10 nối tiếp trên một issue, kiểm số dư ở cuối.

### 6.2 Nơi tạo thông báo (D-NOTI-1)

| Loại | Nơi tạo | Người nhận | Kịch bản |
|---|---|---|---|
| NEW_APPLICANT | `applyToIssue` | client | E4 |
| APPLICATION_ACCEPTED | effect FUNDED | developer được chọn | E5 |
| APPLICATION_REJECTED | effect FUNDED | các developer khác | E5 |
| TASK_ASSIGNED | effect FUNDED | developer được chọn | E5 |
| PAYMENT_RECEIVED | effect CLAIMED | người nhận | E10 |
| DISPUTE_RAISED | `raiseDispute` | đối phương, admin | E15 |
| DISPUTE_RESOLVED | effect RULING và ARBITER_TIMEOUT_SPLIT | cả hai | E15, E17 |
| MESSAGE_RECEIVED | chat | người còn lại trong room | E18 |
| FUNDING_REQUIRED | `selectDeveloper` | developer | E4 |
| RESERVATION_EXPIRED | job reservation | developer | E7 |
| DEPOSIT_CONFIRMED | effect FUNDED | client | E5 |
| DEPOSIT_MISMATCHED | effect FUNDED khi lệch | cả hai, admin | E6 |
| WORK_SUBMITTED | effect WORK_SUBMITTED | client | E9 |
| CHANGES_REQUESTED | `requestChanges` | developer | E9 |
| SETTLEMENT_PROPOSED | effect SETTLEMENT_PROPOSED | đối phương | E14 |
| SETTLEMENT_REVOKED | effect SETTLEMENT_REVOKED | đối phương | E14 |
| EVIDENCE_SUBMITTED | effect COUNTERPARTY_EVIDENCE | bên nộp đầu | E15 |
| RULING_POSTED | effect INITIAL và FINAL RULING | cả hai | E15, E16 |
| RULING_CHALLENGED | effect RULING_CHALLENGED | cả hai, admin | E16 |
| ESCROW_RESOLVED | effect RELEASE, MISSED, REVIEW_TIMEOUT, SETTLEMENT | cả hai | E10, E12, E13, E14 |
| FUNDS_CLAIMABLE | effect ESCROW_RESOLVED | người có balance > 0 | E10 |
| DEADLINE_APPROACHING | job deadline | người liên quan | E30 |

Quy tắc: RULING và ARBITER_TIMEOUT_SPLIT chỉ gửi `DISPUTE_RESOLVED`, không gửi `ESCROW_RESOLVED`. Các kind còn lại gửi `ESCROW_RESOLVED`.

Nếu sau khi làm xong một loại không có nơi tạo, xóa loại đó khỏi enum bằng migration (D-NOTI-1).

---

## 7. Thứ tự làm

Làm theo thứ tự. Mỗi mục một commit. Mỗi phase kết thúc bằng gate và các E-test của phase đó.

**Phase A. Chặn và an toàn (làm đầu tiên)**
N-1, N-2, N-3, N-5, N-7, N-14, P0-9, P0-1 (xóa template theo D-NOTI-1), P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P0-8.
- Đưa N-7 (AI giả) và N-14 (check-env) lên sớm, vì mọi E-test cần chúng.

**Phase B. Indexer đầy đủ**
N-4, P1-6, P1-7, P1-1, P1-2, P1-3, P1-4, P1-5.
- Kết thúc phase: E22, E23, E24 pass. E5 chạy được phần deposit.

**Phase C. Luồng escrow**
P1-8, P1-9, P1-10, P1-11, P1-12, P1-13, P1-14, P1-15, P1-36, P1-37, D5 (bỏ `isDraft`), D4 (BE-10).
- Kết thúc phase: E3 đến E14, E31 pass.

**Phase D. Tranh chấp**
P1-16, P1-17, P1-18, P1-28, N-6.
- Kết thúc phase: E15, E16, E17 pass.

**Phase E. Chat, thông báo, admin, AI**
P1-19, P1-20, P1-21, P1-22, P1-23, P1-24, P1-25, P1-26, P1-27 (AI-16 eval).
- Kết thúc phase: E18, E19, E20, E21 pass.

**Phase F. Nền tảng**
P1-30, P1-31, P1-32, P1-35.
- Kết thúc phase: E25, E26, E27, E28, E29 pass.
- **Hoãn sang giai đoạn deploy:** P1-33, P1-34, BE-88, BE-89, BE-94.

**Phase G. Harness và kịch bản**
N-8, N-9, N-10, N-11, N-12, N-13, và E1 đến E31 còn lại.
- Kết thúc phase: `bun run test:e2e:local` xanh.

**Phase H. Standards**
S-1 đến S-5 (`FIX_LIST.md` mục 3). Chỉ làm sau khi E-test xanh, để không đổi hành vi mà không có test bảo vệ.

**Phase I. Báo cáo**
Cập nhật `reports/CODEX.md` và `LOCAL_TEST_MATRIX.md`. Ghi kết quả `test:e2e:local` và gate cuối.

---

## 8. Báo cáo và tiếp tục giữa các phiên

- `reports/CODEX.md`: bảng theo mã (FIX_LIST, N-x, E-x), trạng thái (xong, dở, chưa làm), commit hash, lệnh đã chạy kèm kết quả.
- Khi sắp hết context: commit điểm dừng, ghi dòng `ĐANG DỞ: <mã>. Bước tiếp theo: <việc cụ thể>` ở đầu `CODEX.md`, rồi dừng.
- Phiên mới bắt đầu bằng cách đọc `DECISIONS.md`, file này, rồi `CODEX.md`.

---

## 9. Ngoài phạm vi (không làm trong giai đoạn này)

- Deploy: Railway, domain, Docker build (BE-88, BE-89).
- Sentry (BE-94).
- GitHub Actions chạy thật trên GitHub. File workflow vẫn phải hợp lệ về cú pháp.
- PR, push, GitGuardian.
- AI-17 (multi-agent debate), AI-18 (chấm mức hoàn thành submission).
- Production Safe (owner, arbiter, fee recipient là Safe thật).
- Frontend (`components/`, các trang UI), trừ khi lỗi build bắt buộc.
