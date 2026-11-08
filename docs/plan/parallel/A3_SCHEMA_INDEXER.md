# A3 — Schema Prisma, indexer, worker runtime, reconciler, E2E cuối

**Đọc trước:** [`README.md`](README.md) (đặc biệt mục 5: hợp đồng schema, mục 6.3: runtime worker).
**Branch:** `be/a3-indexer` · **Worktree:** `/Users/admin/repos/capstone1-wt/a3`
**Ước lượng:** ~12 ngày công.

A3 làm việc theo hai đợt. **Đợt 1** là schema, phải xong trong vài giờ đầu vì A4 và A5 cần tên model. **Đợt 2** là worker. Phần E2E và dọn dẹp là đợt cuối, chạy sau khi A4 và A5 đã merge.

---

## 1. Phạm vi

**Được sửa:**
- `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/**`
- `packages/database/src/index.ts`
- `apps/worker/**` (mới): toàn bộ worker
- `apps/web/src/lib/realtime/escrow-bridge.ts` (mới)
- `apps/web/server.ts`: đúng một dòng (xem README mục 4)
- `package.json` gốc: chỉ script `worker:*`
- `apps/worker/e2e/**` (mới)

**Dependency được phép thêm:** `pg` và `@types/pg` (cho LISTEN/NOTIFY, ở web và worker). Ghi phiên bản đã phát hành ít nhất 2 tuần vào báo cáo.

**Không sửa:** GraphQL, `lib/escrow/**` ở web (thuộc A4), `packages/shared/**` (thuộc A2).

**Phụ thuộc:**
- Từ A2: `decodeEscrowLog`, `foldEscrowEvent`, `compareProjectionWithChain`, `ESCROW_ABI`. Mốc 1 của A2 có chữ ký. Mốc 2 mới có logic.
- Từ A4: `applyFoldEffects` trong `apps/worker/src/effects/index.ts`. A3 chỉ gọi, không viết. Nếu A4 chưa có, A3 dùng hàm rỗng do A3 tạo, ghi rõ trong báo cáo.

---

## 2. Thứ tự làm

### Đợt 1: schema (làm đầu tiên)

1. BE-75: thay header "FROZEN" bằng ghi chú phiên bản mới.
2. BE-41, BE-31 (model), BE-35 (model), BE-41f (cột), BE-14 (schema), BE-39 (schema), BE-50a (schema), BE-51 (schema), BE-61 (enum và `dedupeKey`), `Message.afterDispute`, BE-77, BE-90 (`directUrl`), `GithubWebhookDelivery` (cho A1). Đúng theo mục 5 của README.
3. Viết migration cho mọi thay đổi. Map dữ liệu cũ của `SubmissionStatus` và `DisputeStatus` (nếu có). Tên migration: `escrow_projection`.
4. Chạy `prisma migrate dev` trên DB `bloody_a3`. Chạy `db:generate`.
5. Đẩy branch và báo **mốc 1**.

### Đợt 2: worker

6. BE-40: skeleton `apps/worker` (xem mục 3).
7. BE-41a: scanner.
8. BE-41c: reorg.
9. BE-41d: replay.
10. BE-59b: NOTIFY và escrow-bridge.
11. BE-66: reconciler chuỗi.
12. BE-66b: reconciler intent.
13. BE-47: job deadline.
14. BE-41e: harness hardhat.
15. BE-95 (P1), BE-76 phần demo chain (P1).

### Đợt cuối: sau khi A4 và A5 đã merge

16. BE-83: E2E lifecycle.
17. BE-41-final: migration dọn dẹp.

---

## 3. Task

### Đợt 1: schema

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-75** | Thay header "FROZEN 24/8" bằng ghi chú v2. | Header đổi. |
| **BE-41** | Thêm 12 model trong README mục 5. Giữ `Escrow`, `Transaction` (legacy). | `prisma validate` pass. Migration chạy sạch trên DB trống. |
| **BE-31** (model) | `FundingReservation` có partial unique index: một reservation active mỗi issue. Viết bằng raw SQL trong migration. | Test: tạo hai reservation active cho một issue → lỗi. |
| **BE-35** (model) | `TransactionIntent` và `IntentStatus`. | Migration pass. |
| **BE-41f** (cột) | `escrowKey` và `escrowIdHash` là unique trên `FundingReservation`. | Migration pass. |
| **BE-14** (schema) | Thêm cột `Issue` và giá trị `AWAITING_FUNDING`. | Migration pass. |
| **BE-39** (schema) | Cột `Submission` và enum mới, map dữ liệu cũ. | Migration chạy trên DB có dữ liệu cũ (tạo vài dòng để thử). |
| **BE-50a** (schema) | Cột `Attachment`. | Migration pass. |
| **BE-51** (schema) | Cột `Dispute` mới. Giữ cột Decimal cũ. | Migration pass. |
| **BE-61** (enum) | Thêm giá trị `NotificationType` (xem README mục 5 và BE-61 trong `BACKEND_REMAINING_TASKS.md`). `Notification.dedupeKey @unique`. | Migration pass. |
| **BE-77** | `Decimal(78,0)` cho cột raw của projection. `Issue.bountyAmount` là `Decimal(20,6)`. | Migration pass. |
| **BE-90** (schema) | `directUrl = env("DIRECT_URL")` trong datasource. | `prisma validate` pass. |
| **GithubWebhookDelivery** | Model `deliveryId @id`, `receivedAt`. Cho A1 (BE-69). | Migration pass. |

### Đợt 2: worker

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-40** | `apps/worker`: `package.json` (`name: @bloody-roar/worker`, script `start`, `test`), `src/index.ts`, `src/config.ts` (zod, phần worker của BE-60), `/health` trả last safe head, tuổi checkpoint, độ trễ RPC, lag projection. Tắt êm khi nhận SIGTERM. Advisory lock Postgres để chỉ một instance chạy. `src/runtime/scheduler.ts` có `registerJob` (xem README mục 6.3). | `/health` trả JSON đủ field. Chạy hai instance → instance thứ hai thoát. |
| **BE-41a** | `src/indexer/scanner.ts`: `getBlock({blockTag: "safe"})`. `getLogs` theo khoảng, mặc định 2000 block, chia đôi khi RPC báo lỗi giới hạn. Sort theo `(block, txIndex, logIndex)`. Insert `ChainEvent` với `ON CONFLICT DO NOTHING`. Trong **cùng một transaction**: decode (A2), fold (A2), `applyFoldEffects` (A4), ghi projection và tăng `projectionVersion`, cập nhật checkpoint. Sau commit: `pg_notify`. | Test với hardhat node (BE-41e): deposit → một projection `FUNDED`. |
| **BE-41c** | `src/indexer/reorg.ts`: mỗi vòng so `lastCanonicalBlockHash` với hash RPC tại `lastSafeBlock`. Lệch thì đánh dấu event trong nhánh bỏ là `canonical = false`, dựng lại projection từ event canonical, quét lại. | Test: snapshot, deposit, `evm_revert`, deposit khác → projection đúng. |
| **BE-41d** | CLI `bun run --cwd apps/worker replay --from <block>`. Đánh dấu projection cần dựng lại. | Test: replay cho kết quả giống lần chạy đầu. |
| **BE-59b** | Worker: `pg_notify("projection_changed", {escrowId, issueId, projectionVersion})` và `pg_notify("notification_created", {userId, id})`. Web: `lib/realtime/escrow-bridge.ts` LISTEN bằng `pg`, emit `escrow:invalidate` tới `task:{issueId}` và `notification:new` tới `user:{userId}`. Thêm đúng một dòng `startEscrowBridge(io)` vào `server.ts`. | Test: NOTIFY → socket client nhận sự kiện. |
| **BE-66** | `src/reconciler/chain-reconciler.ts`: định kỳ, với escrow active, đọc `getEscrow`, `getDispute`, `getSettlement`, `claimable` tại safe block. So bằng `compareProjectionWithChain` (A2). Ghi `ReconciliationFinding`, đóng khi khớp. Kiểm `isSolvent()`. | Test: projection bị sửa tay → có finding. |
| **BE-66b** | `src/reconciler/intents.ts`: `SUBMITTED` có receipt với status 0 → `FAILED`, giải mã custom error bằng ABI. Quá N block không có receipt → `DROPPED`. `AWAITING_SIGNATURE` quá `expiresAt` → `EXPIRED`. **Không đặt `CONFIRMED` từ receipt.** `CONFIRMED` chỉ đặt bởi applier khi event khớp được fold (A4). | Test: ba trường hợp, không có trường hợp nào `CONFIRMED` từ receipt. |
| **BE-47** | `src/jobs/deadlines.ts`: thông báo khi một exit mở: missed delivery, review timeout, hết challenge, hết final notice, arbiter stall, sắp hết evidence. Dùng `createNotificationIdempotent` với `dedupeKey = deadline:{escrowId}:{kind}`. (File này do A3 viết, vì nó chỉ là job chạy định kỳ.) | Test: mốc thời gian → một thông báo, chạy lại → không tạo thêm. |
| **BE-41e** | `apps/worker/e2e/harness.ts`: khởi động `hardhat node` (lấy từ `apps/contracts`), deploy kèm MockUSDC, cấp tiền cho ví test. Hàm trợ giúp cho từng bước. Mô phỏng reorg bằng `evm_snapshot` và `evm_revert`. | Chạy được một kịch bản deposit. |
| **BE-95** (P1) | Metrics của worker ghi log có cấu trúc. Cảnh báo khi lag > 5 phút hoặc lỗi RPC liên tiếp. Gửi tới `ALERT_WEBHOOK_URL` nếu có. | Test hàm đánh giá ngưỡng. |
| **BE-76** (phần demo chain, P1) | `apps/worker/scripts/demo-chain.ts`: chạy lifecycle trên hardhat để có dữ liệu mọi phase. Làm sau khi A4 có luồng. | Chạy được. |

### Đợt cuối

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-83** | E2E trong `apps/worker/e2e/`. Các nhánh: `RELEASE`, `MISSED_DELIVERY_REFUND`, `REVIEW_TIMEOUT`, `SETTLEMENT`, `RULING` (không challenge, và có challenge + final ruling), `ARBITER_TIMEOUT_SPLIT` (từ `DISPUTED` và từ `CHALLENGED`). Dùng `evm_increaseTime` cho các mốc. Mỗi nhánh kết thúc bằng `claim` và kiểm số dư khớp projection. | Tất cả nhánh pass trên `be/integration`. |
| **BE-41-final** | Migration xóa `Escrow`, `Transaction`, enum và cột legacy. Chỉ làm khi `grep` không còn code dùng. | `grep` không còn tham chiếu, migration pass. |

---

## 4. Kiểm tra trước khi báo cáo

- `bun run --cwd packages/database db:generate`
- `bun run typecheck`, `bun run lint`
- `bun run --cwd apps/web test`
- `bun run --cwd apps/worker test`
- Đợt cuối: `bun run --cwd apps/worker test:e2e` trên hardhat

Báo cáo theo mẫu trong `README.md` mục 8, lưu vào `docs/plan/parallel/reports/A3.md`. Ghi số lượng migration đã có và tên của từng migration.
