# Báo cáo Kiểm thử E2E Role Flow (S1–S10) & Sửa lỗi Giao diện

- **Thời điểm thực hiện**: 2026-11-03
- **Nhánh**: `fix/role-flow-e2e` (dựa trên `origin/main` tại commit `e835d65`)
- **Worktree**: `/Users/admin/repos/capstone1-wt/role-flow`
- **Môi trường**: Hardhat local chain `31337`, Postgres `bloodyroar_e2e`, Web port `4100`, Worker port `4101`

---

## 1. Tóm tắt kết quả kiểm thử E2E (S1–S10)

Script kiểm thử tự động: `apps/web/scripts/e2e-role-flows.ts`.
Toàn bộ 10 kịch bản đều **PASS** 100% với luồng tiền on-chain đầy đủ (không mock tx, không bypass indexer).

| # | Kịch bản | Mô tả tóm tắt | Kết quả | Ghi chú & Xác nhận |
|---|---|---|:---:|---|
| **S1** | **Luồng chuẩn** | Client tạo bài → Dev và Dev2 apply → Client reject Dev2 → Select Dev → `submitFundingIntent` → `prepareEscrowDeposit` (approve + deposit) → Dev `createSubmissionDraft` + `prepareSubmitWork` → Client `prepareReleaseFunds` → Dev và fee recipient `prepareClaim` | **PASS** | Issue `COMPLETED`, số dư USDC của Dev tăng đúng 97.5% (97.5 USDC), fee recipient nhận 2.5%, `myClaimable` về 0, nhận đủ 4 loại notification: `DEPOSIT_CONFIRMED`, `WORK_SUBMITTED`, `ESCROW_RESOLVED`, `FUNDS_CLAIMABLE`. |
| **S2** | **Yêu cầu sửa** | Như S1, Client `requestChanges` sau lần nộp đầu, Dev nộp bản giao thứ hai, Client release | **PASS** | Nhận notification `CHANGES_REQUESTED`, lần nộp thứ 2 release thành công và issue chuyển `COMPLETED`. |
| **S3** | **Reservation hết hạn** | Client `selectDeveloper`, cố tình không nạp tiền, hết hạn giữ chỗ | **PASS** | Worker `reservationsJob` tự động hủy reservation (`EXPIRED`), mở lại issue về `OPEN`, Dev nhận notification `RESERVATION_EXPIRED`. |
| **S4** | **Dev trễ hạn** | Nạp tiền thành công, Dev không nộp bài, tua thời gian qua `deliveryDeadline` → Client `prepareClaimMissedDeliveryRefund` | **PASS** | Client claim lại đủ 100% (100 USDC) trên chain, delta số dư bằng 0. |
| **S5** | **Client không duyệt** | Dev nộp bài, tua thời gian qua review window (7 ngày) → Dev `prepareClaimReviewTimeout` | **PASS** | Escrow chuyển `RESOLVED`, Dev nhận đủ 97.5% bounty on-chain (97.5 USDC). |
| **S6** | **Thương lượng** | Client propose settlement 4000 bps → revoke → propose lại 3000 bps → Dev accept settlement | **PASS** | Escrow `RESOLVED`, chia tiền chính xác: Client 30 USDC (3000 bps), Dev 68.25 USDC (net sau 2.5% fee), Platform fee 1.75 USDC. |
| **S7** | **Tranh chấp đủ vòng** | Client `createEvidenceManifest` + `prepareRaiseDispute` → Dev `prepareSubmitCounterpartyEvidence` → Admin `draftRuling` (INITIAL 3000 bps) → Arbiter gửi `postInitialRuling` → Client `prepareChallengeRuling` → Admin `draftRuling` (FINAL 6000 bps) → Arbiter gửi `postFinalRuling` → Tua 24h → Outsider `prepareFinalizeRuling` | **PASS** | Issue & Escrow về trạng thái kết thúc, chia tiền đúng tỷ lệ (Client 60 USDC, Dev 39 USDC net, Fee 1 USDC), Admin truy vấn được evidence manifests và chat trong thời gian tranh chấp. |
| **S8** | **Arbiter không xử lý** | Mở tranh chấp, tua thời gian quá 30 ngày (`ARBITER_STALL_DAYS`) mà Arbiter không ra phán quyết → Outsider `prepareFinalizeArbiterTimeoutSplit` | **PASS** | Phân chia 50/50: Client nhận 50 USDC (5000 bps), Dev nhận 48.75 USDC (50% trừ 2.5% fee). |
| **S9** | **Phân quyền** | Kiểm tra ma trận quyền: Guest không gọi được mutation cần auth (`UNAUTHORIZED`), Outsider không release được bài người khác, Admin không tạo issue (`ADMIN_NOT_ALLOWED`), Client không apply vào bài của mình (`SELF_APPLICATION`), claim ví người khác bị chặn (`FORBIDDEN`), User bị ban mất session ngay lập tức. | **PASS** | Tất cả các vi phạm quyền đều bị từ chối đúng mã lỗi. |
| **S10** | **Rút đơn và sửa bài** | Client tạo bài `OPEN`, sửa bài bằng `updateIssue`. Dev `applyToIssue` rồi `withdrawApplication` (`WITHDRAWN`), sau đó apply lại (`PENDING`). Client chọn Dev → cố tình sửa bài bị chặn (`ISSUE_NOT_EDITABLE`). | **PASS** | Rút đơn và nộp lại thành công; `updateIssue` chỉ cho phép khi bài còn `OPEN`, chặn hoàn toàn khi đã chọn Dev. |

---

## 2. Các thay đổi đã thực hiện (Commits)

1. **`feat(ui): reject/withdraw/edit (K1-K4)`** (Commit: `049fd11`):
   - **K1**: Thêm nút và mutation `rejectApplication` trong danh sách ứng viên (dành cho Client).
   - **K2**: Hiển thị trạng thái đã ứng tuyển và nút `withdrawApplication` cho Developer (dựa trên query `myApplications`).
   - **K3**: Sửa badge số lượng ứng viên chờ duyệt, chỉ đếm các đơn có `status === "PENDING"`.
   - **K4**: Thêm nút sửa và form chỉnh sửa bài toán khi trạng thái còn `OPEN`, gọi mutation `updateIssue`.

2. **`test(e2e): role flow script for scenarios S1-S10`** (Commit: `5284044`):
   - Thêm script `apps/web/scripts/e2e-role-flows.ts`.
   - Chạy 10 kịch bản S1–S10 tương tác trực tiếp với API GraphQL và Hardhat RPC `31337`.
   - Xử lý đồng bộ mốc thời gian EVM (`getChainTimestamp`) cho các deadline on-chain.
   - Xử lý thu hồi số dư chờ rút (`claimable`) sạch sẽ giữa các kịch bản.

---

## 3. Các mục chỉ báo cáo theo yêu cầu (không sửa code)

1. **Smart Contracts (`BloodyRoarEscrow.sol`)**:
   - Giữ nguyên vẹn, không sửa đổi.
   - Toàn bộ 35 unit test contracts (`bun run contracts:test`) đều PASS.
   - Hợp đồng tuân thủ đầy đủ logic 2-step role management, non-reentrant, accounting invariants và liveness timeout.

2. **Database Schema (`schema.prisma`)**:
   - Giữ nguyên 13 migration hiện có trên `main`.
   - Không thêm trường hay bảng mới ngoài thiết kế.

3. **Danh sách các API / Mutation chưa có giao diện Frontend**:
   Các mutation dưới đây đã hoạt động hoàn chỉnh ở Backend / GraphQL API (được xác thực bởi S1–S10), nhưng hiện tại FE chưa có component UI tương ứng:
   - **Thương lượng (Settlement)**: `prepareProposeSettlement`, `prepareRevokeSettlement`, `prepareAcceptSettlement`. *(Khuyến nghị: Mở issue/PR FE thêm modal đề xuất và chấp thuận phân chia tỷ lệ trên trang chi tiết)*.
   - **Tranh chấp (Dispute & Evidence)**: `prepareRaiseDispute`, `createEvidenceManifest`, `prepareSubmitCounterpartyEvidence`. *(Khuyến nghị: Mở issue/PR FE thêm form nộp lý do và đính kèm bằng chứng tranh chấp)*.
   - **Phán quyết Arbiter & Kháng cáo**: `draftRuling`, `prepareChallengeRuling`, `prepareFinalizeRuling`, `prepareFinalizeArbiterTimeoutSplit`. *(Khuyến nghị: Mở issue/PR FE xây dựng trang quản trị phán quyết dành riêng cho Arbiter và Admin)*.
   - **Rút tiền do quá hạn**: `prepareClaimMissedDeliveryRefund` (Client claim lại khi dev trễ hẹn), `prepareClaimReviewTimeout` (Dev claim khi client ngâm review). *(Khuyến nghị: Mở issue/PR FE hiển thị nút claim tương ứng khi timeline quá hạn)*.

---

## 4. Hướng dẫn chạy lại toàn bộ kiểm thử E2E

### Bước 1: Dựng môi trường local
```bash
# 1. Chạy Hardhat node
bun run --cwd apps/contracts node

# 2. Deploy contracts và MockUSDC
bun run --cwd apps/contracts deploy:local

# 3. Tạo database bloodyroar_e2e, migrate và seed
# (DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bloodyroar_e2e?schema=public)
bun run --cwd packages/database db:migrate
bun run --cwd packages/database db:seed:local

# 4. Khởi động worker và web server (port 4100)
set -a && source .env.e2e && set +a
bun run worker:start &
cd apps/web && bun run server.ts &
```

### Bước 2: Chạy script E2E Role Flows
```bash
set -a && source .env.e2e && set +a
BASE_URL=http://localhost:4100 bun run --cwd apps/web scripts/e2e-role-flows.ts
```

### Bước 3: Chạy toàn bộ Verification Gates
```bash
bun run typecheck
bun run lint
bun run --cwd apps/web test
bun run contracts:test
```
