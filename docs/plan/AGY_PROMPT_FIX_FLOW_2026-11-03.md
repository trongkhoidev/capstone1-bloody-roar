# Prompt cho AGY: chạy đủ luồng on-chain theo từng role trên `main` và vá lỗi

Ngày: 2026-11-03. Đọc hết trước khi bắt đầu. Làm đúng thứ tự.

---

## 0. Bối cảnh

- **Làm trên `main` mới nhất** (`origin/main`, đầu nhánh `e835d65`, đã merge PR #20 `be/integration`).
  - Không làm trên `feat/ledger-palette-copy`. Nhánh đó chậm 287 commit, còn API escrow cũ (`depositToEscrow`, `releaseFunds`).
  - File `docs/plan/FLOW_AUDIT_2026-11-03.md` được viết khi audit nhánh cũ đó. Chỉ dùng để tham khảo, đa số lỗi trong file đã được sửa trên `main`.
- Tạo worktree riêng:
  ```bash
  git -C /Users/admin/repos/capstone1 fetch origin
  git -C /Users/admin/repos/capstone1 worktree add -b fix/role-flow-e2e /Users/admin/repos/capstone1-wt/role-flow origin/main
  ```
  Chỉ sửa trong `/Users/admin/repos/capstone1-wt/role-flow`. Thư mục `/Users/admin/repos/capstone1` có thay đổi chưa commit, chỉ được đọc.
- Quy tắc dự án: `AGENTS.md`, `CLAUDE.md`.
  - Chỉ dùng `bun`.
  - Diff tối giản. Không thêm abstraction, option hay tính năng ngoài danh sách.
  - Kiểm tra bằng CLI: script Node/Bun, `curl`, Vitest, Playwright chạy headless từ dòng lệnh. Không điều khiển trình duyệt bằng tay hay qua screenshot.
- Tài liệu nên đọc trước: `docs/LOCAL_DEV.md`, `docs/ESCROW_INTEGRATION.md`, `docs/AUTHZ_MATRIX.md`, `docs/PRODUCT_FLOW.md`.

## 1. Quyết định đã chốt (không hỏi lại)

- Q1: tiền đi **on-chain đầy đủ**. Mọi bước liên quan tiền (deposit, submitWork, release, claim, dispute, ruling, settlement, timeout) đều theo mẫu: mutation `prepareX` → ví ký và gửi tx → `recordTransactionSubmitted` → worker/indexer cập nhật trạng thái. Không thêm đường off-chain nào cho tiền.
- Q2: chạy local trên Hardhat (chain `31337`). Base Sepolia làm sau, không nằm trong việc này.
- Q3: **không đụng vào DB và server hiện có.**
  - Server đang chạy ở port `4000` là của nhánh cũ. Không dừng, không restart.
  - DB trong `DATABASE_URL` hiện tại dùng schema cũ. Không chạy `migrate`, `db:push` hay seed trên DB đó.
  - Tạo database riêng tên `bloodyroar_e2e` trên cùng Postgres, migrate và seed trên DB này. Chạy web ở port `4100`.
  - Đặt env cho phiên này qua biến shell hoặc file `.env.e2e` (đã gitignore). Không sửa file `.env` gốc.
- Q4: ví thử dùng tài khoản Hardhat lấy từ mnemonic mặc định `test test … junk`. Vai trò: client, dev, dev2, admin/arbiter. Lấy theo cấu hình trong `apps/contracts/scripts/deploy.ts`. Không dùng private key thật.

## 2. Dựng môi trường local

1. Chạy `bun install` trong worktree. Chạy `bun run --cwd apps/contracts node` ở nền.
2. Deploy contract và mock USDC: `bun run contracts:deploy`. Ghi lại địa chỉ escrow, token và deploy block.
3. Tạo DB `bloodyroar_e2e`, rồi `db:migrate` và `db:seed:local` với `DATABASE_URL`/`DIRECT_URL` trỏ sang DB mới.
4. Đặt env theo `docs/LOCAL_DEV.md`: `CHAIN_ID=31337`, `NEXT_PUBLIC_CHAIN_ID=31337`, `RPC_URL`, `ESCROW_ADDRESS`, `ADMIN_WALLETS`. Chạy web ở port 4100 và chạy `bun run worker:start`.
5. Kiểm `curl localhost:4100/api/health` và query `indexerStatus` phải trả về bình thường.

Nếu bước nào không làm được theo `docs/LOCAL_DEV.md`, dừng lại và báo bước đó cùng lỗi. Không tự đổi cách deploy.

## 3. Viết script E2E theo role: `apps/web/scripts/e2e-role-flows.ts`

Script gọi API thật ở `BASE_URL` (mặc định `http://localhost:4100`). Ký tx bằng `ethers` với ví Hardhat, thay cho ví trình duyệt. Dùng lại cách login trong `scripts/smoke-roles.ts`. Chờ indexer bằng cách poll trạng thái, có timeout. Dùng `evm_increaseTime` và `evm_mine` để vượt các mốc thời gian.

In mỗi bước một dòng `PASS`/`FAIL` kèm lý do. Script exit khác 0 nếu có bước fail.

Các kịch bản cần chạy:

| # | Kịch bản | Bước chính | Kết quả phải đạt |
|---|---|---|---|
| S1 | Luồng chuẩn | client tạo bài → dev và dev2 apply → client `rejectApplication` dev2 → `selectDeveloper` dev → `submitFundingIntent` → `prepareEscrowDeposit` (approve + deposit) → dev `createSubmissionDraft` + `prepareSubmitWork` → client `prepareReleaseFunds` → dev và fee recipient `prepareClaim` | Issue `COMPLETED`, số dư USDC on-chain của dev bằng 97.5% bounty, `myClaimable` về 0, có notification `DEPOSIT_CONFIRMED`, `WORK_SUBMITTED`, `ESCROW_RESOLVED`, `FUNDS_CLAIMABLE` |
| S2 | Yêu cầu sửa | như S1, client `requestChanges` rồi dev nộp lại | Có `CHANGES_REQUESTED`, lần nộp thứ hai release được |
| S3 | Reservation hết hạn | `selectDeveloper` rồi không nạp tiền, tua thời gian | Có `RESERVATION_EXPIRED`, issue mở lại hoặc đúng trạng thái theo `PRODUCT_FLOW.md` |
| S4 | Dev trễ hạn | deposit, không nộp, tua qua `deliveryDeadline` → client `prepareClaimMissedDeliveryRefund` | Client claim lại đủ 100% |
| S5 | Client không duyệt | dev nộp, tua qua review window → dev `prepareClaimReviewTimeout` | Dev nhận 97.5% |
| S6 | Thương lượng | propose settlement → revoke → propose lại → bên kia accept | Chia tiền đúng `clientBps` |
| S7 | Tranh chấp đủ vòng | `createEvidenceManifest` + `prepareRaiseDispute` → bên kia `prepareSubmitCounterpartyEvidence` → admin `draftRuling` → arbiter gửi `postInitialRuling` → một bên `prepareChallengeRuling` → arbiter `postFinalRuling` → tua 24h → `prepareFinalizeRuling` | Issue và escrow về trạng thái kết thúc, chia tiền đúng bps, admin đọc được chat và evidence |
| S8 | Arbiter không xử lý | raise dispute, tua qua `ARBITER_STALL_DAYS` → `prepareFinalizeArbiterTimeoutSplit` | Chia 50/50 |
| S9 | Phân quyền | với từng mutation `prepareX`: người không đúng vai trò gọi thì bị từ chối (đối chiếu `docs/AUTHZ_MATRIX.md`). Guest không gọi được API cần đăng nhập. User bị ban mất session | Không bước sai quyền nào lọt qua |
| S10 | Rút đơn và sửa bài | dev `withdrawApplication` rồi apply lại. Client `updateIssue` khi bài còn `OPEN`, bị chặn sau khi đã chọn dev | Đúng như mô tả |

Arbiter on-chain (`postInitialRuling`, `postFinalRuling`): ở local, gửi tx trực tiếp từ ví arbiter mà `deploy.ts` cấu hình, rồi `recordTransactionSubmitted` nếu có intent tương ứng. Nếu backend không có cách ghi nhận ruling local, ghi lại thành lỗi, không tự chế đường đi khác.

## 4. Lỗi đã biết trên `main` (sửa luôn)

Tìm được bằng đọc code và so FE với schema. Validate schema: 53/53 query của FE hợp lệ.

- K1. FE không có nút từ chối ứng viên. `rejectApplication` có ở backend nhưng không component nào gọi (`components/marketplace/issue-detail-view.tsx`, khu vực danh sách ứng viên).
- K2. Dev không thấy mình đã ứng tuyển và không rút đơn được. `withdrawApplication` không có FE. Thêm trạng thái "đã ứng tuyển" và nút rút đơn ở trang chi tiết. Lấy dữ liệu từ field có sẵn (ví dụ `canApply` hoặc `myApplications`), không thêm query mới nếu đã có field dùng được.
- K3. Badge `{applications.length} pending` (`issue-detail-view.tsx:551`) đếm cả đơn `REJECTED` và `WITHDRAWN`. Chỉ đếm `PENDING`.
- K4. Không có màn sửa bài. `updateIssue` chưa có FE. Thêm cách sửa đơn giản nhất cho chủ bài khi bài còn `OPEN`, dùng lại form tạo bài nếu được.

Các query và mutation khác chưa có FE (`setUserRole`, `revokeSession`, `mySessions`, `myTransactions`, `adminLogs`, `aiLogs`, `editMessage`, `deleteMessage`, `createTestCase`, `deleteTestCase`, `unlinkGithub`): **không làm** trong việc này, chỉ liệt kê trong báo cáo.

## 5. Vá lỗi E2E tìm ra

- Mỗi lỗi: tìm nguyên nhân gốc trong code dùng chung, sửa một lần. Trước khi sửa một hàm, grep tất cả caller của nó.
- Lỗi do contract (`apps/contracts/contracts/BloodyRoarEscrow.sol`): **không sửa contract**, dừng lại và báo.
- Lỗi cần migration hoặc sửa `schema.prisma`: dừng lại và báo trước khi làm.
- Sửa logic có rẽ nhánh thì thêm một test nhỏ (Vitest) cạnh test có sẵn ở `apps/web/src/test`.
- Sau mỗi lần sửa, chạy lại kịch bản liên quan cho tới khi pass.

## 6. Kiểm tra trước khi commit

```bash
bun run typecheck
bun run lint
bun run --cwd apps/web test
bun run contracts:test
BASE_URL=http://localhost:4100 bun run --cwd apps/web scripts/e2e-role-flows.ts
```

Tất cả phải pass. Kịch bản nào vẫn fail thì không được giấu: ghi rõ trong báo cáo.

## 7. Commit, PR và báo cáo

- Commit nhỏ theo nhóm: `test(e2e): role flow script`, `fix(...)` cho từng lỗi, `feat(ui): reject/withdraw/edit` cho K1 đến K4.
- Push nhánh `fix/role-flow-e2e` và mở PR vào `main`.
- Ghi báo cáo `docs/plan/ROLE_FLOW_E2E_2026-11-03.md` trong worktree, gồm:
  - bảng S1 đến S10 với PASS/FAIL và lỗi đã sửa
  - những gì phải dừng lại và báo (contract, migration, môi trường)
  - danh sách API chưa có FE (mục 4)
  - lệnh để chạy lại script E2E
- Không xoá worktree, nhánh hay database `bloodyroar_e2e` khi xong. Dừng node Hardhat, web và worker mà mình đã bật.
