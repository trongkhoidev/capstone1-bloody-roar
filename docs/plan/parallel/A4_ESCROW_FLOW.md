# A4 — Luồng escrow qua GraphQL: chọn người, cọc, giao hàng, thanh toán, thống kê

**Đọc trước:** [`README.md`](README.md) (đặc biệt mục 5, 6.1, 6.3, 6.4).
**Branch:** `be/a4-escrow-flow` · **Worktree:** `/Users/admin/repos/capstone1-wt/a4`
**Ước lượng:** ~12 ngày công.

A4 là chủ của `schema.ts` và `builder.ts`. Đây là phần lớn nhất về số lượng mutation và cũng là chỗ dễ sai logic tiền nhất. Mọi PR của A4 phải có test cho luồng tiền trước khi merge.

---

## 1. Phạm vi

**Được sửa:**
- `apps/web/src/graphql/modules/escrow/**` (viết lại)
- `apps/web/src/graphql/modules/issue/**` (gồm `issue-comment.module.ts`)
- `apps/web/src/graphql/modules/application/**`
- `apps/web/src/graphql/modules/submission/**`
- `apps/web/src/graphql/modules/analytics/**`
- `apps/web/src/graphql/builder.ts`, `apps/web/src/graphql/schema.ts`
- `apps/web/src/lib/escrow/**`: viết lại. Xóa file legacy sau khi thay thế (xem mục 3, phần "Dọn legacy").
- `apps/web/src/lib/access.ts`
- `apps/web/src/test/escrow-*.test.ts`, `apps/web/src/test/marketplace.test.tsx`, `apps/web/src/test/graphql-schema.test.ts`
- `apps/worker/src/effects/index.ts`, `apps/worker/src/effects/escrow.ts` (mới), `apps/worker/src/jobs/reservations.ts` (mới)

**Không sửa:** schema Prisma (A3), `packages/shared/**` (A2), dispute module (A5), notification module (A5), socket (A5), user module (A1).

**Phụ thuộc:**
- A2 (mốc 1): `parseTokenAmount`, `formatTokenAmount`, `computeTermsHash`, `computeDeliveryHash`, `keccakUtf8`, `recoverFundingIntentSigner`, `encodeEscrowCall`, `checkDepositAgainstReservation`, `ESCROW_CONSTANTS`.
- A2 (mốc 2): `foldEscrowEvent` đầy đủ, dùng trong effects.
- A3 (mốc 1): schema.
- A3 (mốc 2): `registerJob`, runtime worker.
- A5 (mốc 1): `createNotificationIdempotent`. Dùng để gửi thông báo trong effects.
- A5 (sau khi xong BE-12): `recalcReputation`.
- A1 (mốc 1): `rateLimit`.

**Đầu ra:**
- `lib/escrow/prepare.ts` (mốc 1, làm ngay đầu tiên): A5 dùng cho BE-53, BE-55.
- `effects/index.ts` (mốc 1): A5 thêm nhánh dispute, A3 thêm nhánh config.

---

## 2. Thứ tự làm

**Nhóm 0 (mốc 1, làm đầu tiên):**
1. `lib/escrow/prepare.ts`: `createPreparedCall` (README mục 6.4). Ghi `TransactionIntent` và encode bằng A2.
2. `effects/index.ts`: skeleton `applyFoldEffects` với các nhánh rỗng, có comment chỗ A3 và A5 sẽ thêm.
3. Scalar `TokenAmount` trong `builder.ts` (BUG-4, BE-17). Đẩy và báo mốc 1.

**Nhóm A (issue và chọn người):** BUG-7, BUG-8, BE-09, BE-14 (GraphQL), BE-16, BE-20, BE-23, BE-31 (mutation), BE-38, BE-41f (sinh key), BE-37, BE-21 (P2), BE-18 (P2), BE-19 (P2).

**Nhóm B (cọc, UC-01):** BE-32 (mutation), BE-34, BE-33 (GraphQL type), BE-35 (mutation), BE-36, BE-66c (trong effects).

**Nhóm C (giao hàng, thanh toán, UC-02..04):** BE-39 (GraphQL), BE-39a, BE-39b, BE-43, BE-42, BE-44, BE-45, BE-46, BE-48, BE-49, BE-49a, BE-62.

**Nhóm D (thống kê, dọn legacy):** BE-67, BE-68, dọn legacy, BE-81 (phần của A4).

---

## 3. Task

### Nhóm 0

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **Prepare** | `lib/escrow/prepare.ts` (`createPreparedCall`). Input: method, args, userId, issueId, escrowKey. Tạo `TransactionIntent` `AWAITING_SIGNATURE`, `expiresAt` = 30 phút. Trả `PreparedCall`. Hàm này không kiểm điều kiện nghiệp vụ; người gọi tự kiểm trước. | Test: trả `data` khớp `encodeEscrowCall`. |
| **Skeleton effects** | `apps/worker/src/effects/index.ts`: `applyFoldEffects` dispatch theo `kind`. Nhánh `ESCROW_RESOLVED`, `FUNDED`, `WORK_SUBMITTED`, `SETTLEMENT_*`, `CLAIMED` do A4 viết. Các nhánh khác để trống. | Typecheck pass. |
| **BUG-4** (phần A4) | Scalar `TokenAmount {raw, decimals, symbol, formatted}` trong `builder.ts`. Input tiền là chuỗi thập phân, parse bằng `parseTokenAmount`. Bỏ `Float` trong `issue`, `escrow`, `analytics`. Phần `dispute` do A5 làm sau khi scalar đã merge. | `grep -rn "t.float(" apps/web/src/graphql/modules/{issue,escrow,analytics}` không còn kết quả. |
| **BE-17** | Như BUG-4. Thêm `bountyAmountRaw` trong output. | Test. |

### Nhóm A: issue và chọn người

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BUG-7** | Bỏ tăng `viewCount` khỏi query `issue(id)`. Thêm mutation `recordIssueView(issueId)`, dedupe theo user trong 1 giờ. | Gọi query nhiều lần không đổi `viewCount`. |
| **BUG-8** | Sort `DEADLINE` áp dụng đúng `sortOrder`. | Test hai chiều. |
| **BE-09** | Bỏ check `role === CLIENT` (trong `createIssue`) và `role === DEVELOPER` (trong `applyToIssue`). Chặn ADMIN đăng bài và ứng tuyển. Chặn ứng tuyển bài của chính mình. Chặn user bị ban. | Test: một user vừa đăng bài vừa ứng tuyển bài khác được. Admin bị chặn. |
| **BE-14** (GraphQL) | `createIssue` và `updateIssue` nhận `deliveryDeadline`. Không quá 180 ngày (QĐ-19). `termsVersion = 1` khi tạo. | Test. |
| **BE-16** | `updateIssue` là "sửa thực chất" nếu đổi amount, token, deadline, tiêu chí đã approve, hoặc githubRepo. Sửa thực chất thì `termsVersion += 1`. Từ chối khi có reservation active. | Test hai nhánh. |
| **BE-20** | `viewerCapabilities` (`canApply`, `canSelect`, `canFund`, `canSubmit`, `canRelease`, `canDispute`, ...). `IssueRef.escrow`, `reservation`, `latestSubmission`. `escrow/availability.ts` (hàm thuần) tính `availableActions` từ projection và thời gian hiện tại. | Test: mỗi phase cho ra tập action đúng. |
| **BE-23** | Thay `assignDeveloper` bằng `selectDeveloper(issueId, applicationId, deliveryDeadline)`. Tạo reservation `AWAITING_FUNDING`, hết hạn sau 24h. Các application khác giữ `PENDING`. Issue sang `AWAITING_FUNDING`. Gửi `FUNDING_REQUIRED` cho developer. Kiểm: `deliveryDeadline` ≥ hết hạn reservation + 48h và ≤ 180 ngày (QĐ-19). Có ít nhất một tiêu chí đã approve (QĐ-20). Tính `termsHash` (A2). **Xóa `assignDeveloper`.** | Test: chọn hai người song song chỉ có một thắng (race). |
| **BE-31** (mutation) | `reservation(issueId)` và `myReservations`. Dựa vào unique index của A3. | Test. |
| **BE-38** | `cancelReservation(reservationId)` của client. Reservation → `CANCELLED`, Issue về `OPEN`. | Test. |
| **BE-41f** (sinh key) | Khi tạo reservation: `escrowKey = br_<issueId>_<n>` (ASCII, ≤ 64 ký tự). `escrowIdHash = keccak256(utf8(escrowKey))` (A2). | Test: key hợp lệ, hash khớp. |
| **BE-37** | `apps/worker/src/jobs/reservations.ts` (đăng ký qua `registerJob` của A3): reservation quá hạn → `EXPIRED`, Issue về `OPEN`, gửi `RESERVATION_EXPIRED`. Deposit đến sau hạn: nếu Issue vẫn `OPEN` và không có reservation khác thì chấp nhận; ngược lại `MISMATCHED` (QĐ-17). | Test: mốc thời gian. |
| **BE-21** (P2) | Cursor pagination cho `issues`, `myIssues`, `applications`. | Test. |
| **BE-18** (P2) | Bỏ `isDraft` khỏi API. | Test. |
| **BE-19** (P2) | `attachIssueFile(issueId, attachmentId)`: kiểm Attachment đã `ATTACHED`, đúng `purpose = ISSUE_IMAGE`. Dùng API upload của A1. | Test. |

### Nhóm B: cọc (UC-01)

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-32** (mutation) | `submitFundingIntent(reservationId, signature, nonce, intentExpiry)`. Dùng `recoverFundingIntentSigner` (A2). Kiểm: người ký là client, các trường khớp reservation, `intentExpiry` ≤ 30 phút từ bây giờ, `nonce` chưa dùng (`intentNonce @unique`). Lưu chữ ký. | Test: chữ ký sai, nonce trùng, hết hạn đều bị từ chối. |
| **BE-34** | `prepareEscrowDeposit(reservationId)` trả `steps: [PreparedCall]`. Gồm `approve` nếu allowance thiếu, rồi `deposit`. Pre-check: reservation active, intent hợp lệ, số dư đủ (viem `readContract`), contract không paused (đọc `ContractConfig`), deadline trong tương lai. | Test từng pre-check. Test thứ tự hai bước. |
| **BE-33** (GraphQL) | Type `PreparedCall`, `TransactionIntent`, `EscrowProjection`, `FundingReservation`. | Typecheck pass. |
| **BE-35** (mutation) | `recordTransactionSubmitted(intentId, txHash)`: intent → `SUBMITTED`. Kiểm định dạng `txHash`. **Không đặt `CONFIRMED`.** Query `myTransactions`. | Test: không có đường nào đặt `CONFIRMED` ngoài applier. |
| **BE-36** (effect `FUNDED`) | Effect `FUNDED`: gọi `checkDepositAgainstReservation`. Khớp thì: Issue `IN_PROGRESS`, `developerId`, application được chọn `ACCEPTED`, các application khác `REJECTED`, reservation `FUNDED`, `EscrowProjection` gắn `issueId` và `reservationId`, gửi `DEPOSIT_CONFIRMED`. Intent gắn `CONFIRMED` (đây là chỗ duy nhất được phép). | Test: effect với deposit khớp và deposit lệch. |
| **BE-66c** (effect) | Lệch thì: reservation `MISMATCHED`, không gán developer, gửi thông báo cho hai bên và admin. | Test. |

### Nhóm C: giao hàng, thanh toán

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-39** (GraphQL) | `createSubmissionDraft(issueId, description, prUrl, commitSha, attachmentIds)`: tạo manifest (A2 `computeDeliveryHash`), `status = DRAFT`. Cho phép thay bản nháp đến hết deadline. | Test. |
| **BE-39a** | `submitWork(submissionId)` → `prepareSubmitWork` (`PreparedCall`). Pre-check: `FUNDED`, `now ≤ deadline`. Khi bản mới được xác nhận, bản cũ thành `SUPERSEDED`. | Test: sau deadline bị chặn. |
| **BE-39b** (effect `WORK_SUBMITTED`) | Khớp `deliveryHash` với Submission → `SUBMITTED`. Hash lạ → cờ `externalDelivery`. Gửi `WORK_SUBMITTED` cho client. | Test. |
| **BE-43** | `requestChanges(submissionId, note)`: ghi chú off-chain, gửi `CHANGES_REQUESTED`. Thay `reviewSubmission`. | Test. |
| **BE-42** | `prepareReleaseFunds(issueId)`: client, `FUNDED`, có `deliveryHash` trên chain. | Test. |
| **BE-44** (effect `ESCROW_RESOLVED`) | Terminal → Issue `COMPLETED` với `outcome` = `resolutionKind`. Số tiền lấy từ event. `ClaimableBalance` cộng theo event (A3 table). Gửi `ESCROW_RESOLVED` và `FUNDS_CLAIMABLE`. Gọi `recalcReputation` (A5). | Test từng `resolutionKind`. |
| **BE-45** | `prepareClaimMissedDeliveryRefund(issueId)`: `FUNDED`, không có delivery, quá deadline. | Test. |
| **BE-46** | `prepareClaimReviewTimeout(issueId)`: `FUNDED`, có delivery, `now ≥ deadline + 7 ngày`. | Test. |
| **BE-48** | `prepareClaim(recipient)` và query `myClaimable`. Effect `CLAIMED` trừ `ClaimableBalance`. | Test: cộng rồi trừ, không âm. |
| **BE-49** | `prepareProposeSettlement(issueId, clientBps)` (0..10000), `prepareRevokeSettlement`, `prepareAcceptSettlement`. Pre-check: người gọi là participant, phase ≠ `RESOLVED`, chỉ một proposal đang mở, người accept là bên kia. | Test từng pre-check. |
| **BE-49a** | Model `SettlementProposal` (lịch sử). Effect `SETTLEMENT_PROPOSED` và `SETTLEMENT_REVOKED` ghi lịch sử. Khi `ESCROW_RESOLVED` với `SETTLEMENT`, đánh dấu `ACCEPTED`. Gửi thông báo cho bên kia. | Test. |
| **BE-62** | Mọi thông báo trong effects dùng `createNotificationIdempotent` với `dedupeKey = {chainEventId}:{userId}:{type}`. Replay không tạo thông báo trùng. | Test: chạy effect hai lần → một thông báo. |

### Nhóm D: thống kê, dọn legacy

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-67** | Thống kê tiền tính từ `EscrowProjection` và `ClaimableBalance`. Tổng là chuỗi thập phân nguyên. | Test. |
| **BE-68** | `userStats(userId)` public. `adminStats` thêm: tỉ lệ dispute, thời gian giải quyết, phí thu, user theo tuần. | Test. Phần extra của `adminStats` có thể để P2. |
| **Dọn legacy** | Xóa mutation `depositToEscrow`, `confirmEscrowTransaction`, `releaseFunds`, `cancelEscrow` khỏi `escrow.module.ts`. Xóa `lib/escrow/confirmation.ts`, `projection.ts`, `chain.ts`, `integration.ts` sau khi thay bằng code mới. Thay các test `escrow-*.test.ts` cũ. Giữ `lib/escrow/access.ts` nếu còn dùng. | `grep -rn "depositToEscrow\|confirmEscrowTransaction\|cancelEscrow" apps/web/src` không còn kết quả. Dispute module (của A5) có thể còn import file legacy: A4 báo cho A5 trong báo cáo. |
| **BE-81** (phần A4) | Test resolver Issue, Application, Submission. Có test race: apply và select song song. | Test pass. |
| **PLATFORM_FEE_PERCENT** | Xóa khi không còn import. Dùng `ESCROW_CONSTANTS.FEE_BPS`. | `grep` không còn kết quả trong `apps/web` và `apps/worker`. |

---

## 4. Quy tắc riêng cho luồng tiền

- Không mutation nào đặt trạng thái tiền dựa trên `txHash` do client gửi. Chỉ applier (fold → effects) đổi `EscrowProjection`. `prepare*` chỉ ghi `TransactionIntent` và trả calldata.
- Số tiền luôn dùng `bigint` bên trong, chuỗi thập phân ở GraphQL.
- Mọi mutation `prepare*` có pre-check đầy đủ, kể cả khi chain đã làm kiểm tra. Pre-check trên chain đọc ở block `safe`.
- Ghi vào báo cáo mọi chỗ không chắc theo QĐ trong BACKEND_EXECUTION_PLAN.md.

---

## 5. Kiểm tra trước khi báo cáo

- `bun run --cwd packages/database db:generate` (sau khi A3 merge)
- `bun run typecheck`, `bun run lint`
- `bun run --cwd apps/web test`
- `bun run --cwd apps/worker test`

Báo cáo theo mẫu trong `README.md` mục 8, lưu vào `docs/plan/parallel/reports/A4.md`. Ghi danh sách operation GraphQL đã đổi.
