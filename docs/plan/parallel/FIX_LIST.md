# Danh sách lỗi cần sửa, để Codex làm (29/10/2026)

Nguồn: `HANDOFF_2026-10-28.md` (bàn giao), review hai trục Standards và Spec trên 5 nhánh (29/10), và kiểm tra CI của PR #16, #17.
Làm việc trên nhánh `be/integration`, worktree `/Users/admin/repos/capstone1-wt/integration`. HEAD lúc viết file: `0d24826`.

---

## 0. Quy tắc bắt buộc

**Database**
- Chỉ dùng database `bloody_codex` (tạo nếu chưa có) cho migrate, seed và test. Tạo bằng `pg` (đã có trong `apps/worker`).
- CẤM ghi vào `bloody_roar_local` và `bloody_roar_dev`. Đây là database dev của người dùng.
- Không sửa `.env` của worktree. Khi chạy lệnh cần DB, `export DATABASE_URL=…/bloody_codex` và `DIRECT_URL` cùng giá trị.
- Không chạy `prisma migrate reset`, không chạy `db:seed` trên DB nào khác `bloody_codex`.

**Server đang chạy (không được kill)**
- Port 4000, 4002, 4003, 4004, 4006: dev server đang chạy. Không dừng, không khởi động lại.
- Port 4001: project khác của người dùng (PayBridge). Không đụng vào.
- Không mở thêm dev server nếu không cần. Nếu cần, dùng port 4010 trở lên.

**Git**
- Không push, không mở PR, không đóng PR, không force push, không viết lại lịch sử.
- Mỗi nhóm việc một commit, message dạng `fix(…):` hoặc `feat(…):`.
- Không commit `.env` hay secret. Không in giá trị trong `.env` ra output.

**Code**
- Chỉ dùng `bun`. Không dùng npm, yarn, pnpm.
- Tiền dùng `bigint` hoặc chuỗi thập phân. Không dùng `Float`.
- Dependency được phép: `viem`, `canonicalize` (đã có trong `packages/shared`), `pg` (web, worker), `@scure/bip39` (web). Cần dependency khác thì ghi vào `DECISIONS.md` và làm cách không cần nó.
- Không sửa frontend (`components/`, các trang UI), trừ khi lỗi build bắt buộc.
- Test phải chạy trên DB có tên chứa `test` (xem P0-9).

**Quyết định**
- Khi gặp việc cần người dùng quyết, ghi vào `docs/plan/parallel/DECISIONS.md`: câu hỏi, mặc định đã chọn, lý do. Sau đó làm tiếp với mặc định. Không dừng.

**Gate (chạy sau mỗi nhóm việc và trước khi báo cáo xong)**
```
bun install                      # khi lockfile đổi
bun run --cwd packages/database db:generate    # khi schema đổi
bun run typecheck
bun run lint
bun run --cwd apps/web test
bun run --cwd apps/worker test
bun run --cwd packages/database test
bun run contracts:test           # 35/35
```

---

## 1. P0: chặn build và an toàn tiền (làm trước, theo thứ tự)

**P0-1. Thiếu template thông báo (A5, BE-61).**
- File: `apps/web/src/lib/notifications/templates.ts` có 8 loại. Enum `NotificationType` có 21.
- Thêm template tiếng Việt cho 13 loại còn thiếu, kèm link: `FUNDING_REQUIRED`, `RESERVATION_EXPIRED`, `DEPOSIT_CONFIRMED`, `DEPOSIT_MISMATCHED`, `WORK_SUBMITTED`, `CHANGES_REQUESTED`, `SETTLEMENT_PROPOSED`, `SETTLEMENT_REVOKED`, `EVIDENCE_SUBMITTED`, `RULING_POSTED`, `RULING_CHALLENGED`, `ESCROW_RESOLVED`, `FUNDS_CLAIMABLE`, `DEADLINE_APPROACHING`.
- Nghiệm thu: `notification-templates.test.ts` pass. Có test so khớp mọi giá trị enum với template.

**P0-2. Worker thiếu dependency `@bloody-roar/shared` (A3).**
- File: `apps/worker/package.json`. Thêm `"@bloody-roar/shared": "workspace:*"` vào `dependencies`.
- Chạy `bun install`, commit `bun.lock`.
- Nghiệm thu: `apps/worker` typecheck không còn lỗi `Cannot find module '@bloody-roar/shared/escrow'`.

**P0-3. Schema thiếu các yêu cầu từ `SCHEMA_REQUESTS.md` (A3).**
- Thêm trong `packages/database/prisma/schema.prisma` và một migration mới:
  - Giá trị `DEPOSIT_MISMATCHED` trong `NotificationType`.
  - Model `IssueView` (`id`, `issueId`, `userId`, `viewedAt`, `@@unique([issueId, userId])`, `@@index([issueId])`). Dùng cho BUG-7.
  - `Issue.hiddenAt DateTime?` (BE-64).
  - `Dispute.raisedAt DateTime?` (BE-53, BE-55, BE-56).
- Nghiệm thu: `prisma migrate deploy` trên `bloody_codex` thành công. `db:generate` chạy được. Worker typecheck pass.

**P0-4. Mutation escrow cũ dựa trên txHash (A4).**
- Xóa khỏi `apps/web/src/graphql/modules/escrow/escrow.module.ts`: `depositToEscrow`, `confirmEscrowTransaction`, `releaseFunds`, `cancelEscrow`.
- Xóa `apps/web/src/lib/escrow/confirmation.ts`, `projection.ts`, `chain.ts`, `integration.ts`.
- Xóa các test `apps/web/src/test/escrow-*.test.ts` chỉ test code đã xóa. Giữ test của `reservation`, `intent`, `release`, `prepare`.
- `dispute.module.ts` đang import các file này. Bỏ import trước (xem P1-17), hoặc làm P1-17 trong cùng commit.
- Giữ `lib/escrow/access.ts`, `amounts.ts`, `prepare.ts` nếu đang dùng.
- Nghiệm thu: `grep -rn "depositToEscrow\|confirmEscrowTransaction\|cancelEscrow" apps/web/src` không còn kết quả. Typecheck pass.

**P0-5. Kiểm token không bao giờ fail (A4).**
- File: `apps/worker/src/effects/escrow.ts`, hàm `applyFunded`. Dòng ~69–70: `token` của reservation được truyền vào cả hai phía của `checkDepositAgainstReservation`, nên kiểm này luôn qua.
- Contract chỉ nhận một token. Sửa ở chỗ tạo reservation (`apps/web/src/graphql/modules/escrow/reservation.module.ts`, `selectDeveloper`): đọc `token()` của contract qua RPC, tính selector bằng `toFunctionSelector('token()')` của viem (không hardcode), và từ chối nếu `issue.token.address` khác token của contract.
- Trong `applyFunded`, bỏ phép so sánh tự-so, hoặc so với giá trị lưu trong `ContractConfig` nếu có.
- Nghiệm thu: test reservation với token khác bị từ chối. Test dùng hàm đọc token được inject, không gọi mạng.

**P0-6. Quyền gọi claim khác contract (A4).**
- File: `apps/web/src/graphql/modules/escrow/release.module.ts`. `prepareClaimMissedDeliveryRefund` (dòng ~92) chỉ cho client. `prepareClaimReviewTimeout` (dòng ~119) chỉ cho developer. Contract cho ai cũng gọi.
- Bỏ kiểm owner. Giữ pre-check trạng thái (FUNDED, có/không có `deliveryHash`, mốc deadline).
- Nghiệm thu: test người ngoài gọi được và nhận calldata đúng. Test pre-check vẫn chặn khi chưa đủ điều kiện.

**P0-7. Race khi chèn thông báo (A5).**
- File: `packages/database/src/notifications.ts`. Hiện bắt `P2002` trong `try/catch` rồi trả `null`. Trong Postgres, lỗi unique làm hỏng transaction, câu lệnh sau sẽ lỗi.
- Sửa: `createMany({ data: [row], skipDuplicates: true })`, rồi đọc lại row theo `dedupeKey`. Trả `null` nếu không chèn mới.
- Nghiệm thu: test hai insert cùng `dedupeKey` chỉ có một bản ghi. Test thêm một query sau insert trùng trong cùng transaction vẫn chạy.

**P0-8. RPC `null` bị coi là reorg (A3).**
- File: `apps/worker/src/indexer/reorg.ts`. `current?.hash` là `undefined` khi RPC trả `null`. `hashByBlock.get(key)` cũng là `null`. Khi đó mọi event trong cửa sổ bị đánh dấu `canonical = false`.
- Sửa: nếu RPC trả `null` cho block cần so, ném lỗi để job retry. Không đánh dấu event.
- Nghiệm thu: test RPC giả trả `null` → hàm throw, không có update `canonical`.

**P0-9. Test DB không có chốt chặn tên (A4).**
- File: `apps/web/src/test/escrow-reservation.db.test.ts`. Ghi vào bất kỳ DB nào `DATABASE_URL` trỏ tới.
- Thêm kiểm tra đầu file: lấy tên DB từ `DATABASE_URL`, nếu không chứa `test` thì throw trước khi làm gì.
- Áp dụng tương tự cho mọi test có DB, kể cả `apps/worker/test/*` và `packages/database/test/*`. Dùng một helper chung.
- Nghiệm thu: chạy test với `DATABASE_URL` trỏ `bloody_roar_local` thì fail ngay, không ghi gì.

---

## 2. P1: spec còn thiếu (theo thứ tự phụ thuộc)

**A3: indexer và worker**

**P1-1. BE-41a: decode, fold, áp effect (A3). Quan trọng nhất.**
- File: `apps/worker/src/indexer/scanner.ts`. Hiện chỉ lưu log thô. Không có lệnh gọi nào tới `decodeEscrowLog`, `foldEscrowEvent`, `applyFoldEffects`. Chỉ có comment `shortcut:`.
- Làm trong cùng một transaction với checkpoint: sort theo `(block, txIndex, logIndex)` → decode → `foldEscrowEvent` → `applyFoldEffects` → upsert `EscrowProjection` (tăng `projectionVersion`) → cập nhật checkpoint → `pg_notify`.
- Nghiệm thu: test với hardhat node và `MockUSDC`: deposit → có `EscrowProjection` `FUNDED`. Effect `FUNDED` đưa issue sang `IN_PROGRESS`.

**P1-2. BE-41c, BE-41d: dựng lại projection (A3).**
- Reorg hiện chỉ đánh dấu `canonical`. Cần dựng lại projection từ event canonical.
- Replay (`apps/worker/src/indexer/replay-cli.ts`) hiện chỉ reset cursor. Cần đặt lại projection từ block đã cho.
- Nghiệm thu: test reorg bằng `evm_snapshot` / `evm_revert` cho projection đúng sau khi chuỗi đổi.

**P1-3. BE-66: reconciler chuỗi (A3).**
- Định kỳ, với escrow đang active: đọc `getEscrow`, `getDispute`, `getSettlement`, `claimable` tại safe block. So bằng `compareProjectionWithChain` (đã có trong `@bloody-roar/shared/escrow`). Ghi `ReconciliationFinding`. Đóng finding khi khớp. Kiểm `isSolvent`.
- Nghiệm thu: sửa tay projection → có finding.

**P1-4. BE-66b: giải mã custom error (A3).**
- Hiện `failureReason` là chuỗi cố định "reverted on chain". Giải mã custom error bằng ABI error của contract.
- Nghiệm thu: receipt status 0 với custom error → `failureReason` có tên lỗi.

**P1-5. BE-37, BE-47: job chỉ ghi log (A3).**
- `apps/worker/src/jobs/reservations.ts:19` và `apps/worker/src/jobs/deadlines.ts:86` chỉ có `log.info`, không tạo thông báo.
- Gửi thông báo qua `createNotificationIdempotent`. `dedupeKey`: `reservation:{id}:expired`, `deadline:{escrowId}:{kind}`.
- Nghiệm thu: chạy job hai lần → một thông báo.

**P1-6. Logger trùng (A3).**
- `apps/worker/src/log.ts` tự viết logger JSON, trong khi web dùng pino (`apps/web/src/lib/logger.ts`).
- Thay bằng pino với cấu hình tương đương, hoặc dùng chung một logger. Xóa logger trùng.
- Nghiệm thu: không còn `createLogger` tự viết. Test worker pass.

**P1-7. RPC tự viết (A3).**
- `apps/worker/src/chain/rpc.ts` (99 dòng) là JSON-RPC bằng `fetch`. QĐ-09 chọn viem.
- Mặc định: thay bằng viem (`createPublicClient`) đã có qua `@bloody-roar/shared`. Giữ wrapper mỏng nếu cần.
- Nghiệm thu: test pass. `rpc.ts` bỏ hoặc còn wrapper mỏng.

**A4: luồng escrow qua GraphQL**

**P1-8. BE-34: `prepareEscrowDeposit` (A4). Thiếu, nên client không nạp tiền được.**
- Trả `steps: [PreparedCall]`, gồm `approve` nếu allowance thiếu, rồi `deposit`.
- Pre-check: reservation đang active, intent hợp lệ, số dư đủ (đọc `balanceOf` và `allowance` qua viem), contract không paused, deadline trong tương lai.
- Nghiệm thu: test từng pre-check. Test thứ tự hai bước.

**P1-9. BE-39, BE-39a, BE-39b, BE-43: giao hàng (A4).**
- `createSubmissionDraft`: manifest bằng `computeDeliveryHash`, `status = DRAFT`, cho sửa đến deadline.
- `submitWork`: `prepareSubmitWork`. Pre-check FUNDED và `now ≤ deadline`. Bản cũ thành `SUPERSEDED` khi bản mới được xác nhận.
- Effect `WORK_SUBMITTED`: khớp `deliveryHash`. Hash lạ thì đánh cờ `externalDelivery`. Thông báo client.
- `requestChanges`: ghi chú off-chain, thông báo `CHANGES_REQUESTED`.
- Nghiệm thu: test từng nhánh.

**P1-10. BE-44: effect `ESCROW_RESOLVED` (A4).**
- Thay TODO trong `apps/worker/src/effects/index.ts`.
- Terminal → `Issue.status = COMPLETED`, `outcome = resolutionKind`. Số tiền lấy từ event. Cộng `ClaimableBalance` theo event. Thông báo `ESCROW_RESOLVED` và `FUNDS_CLAIMABLE`.
- Gọi `recalcReputation` nếu P1-22 đã có. Nếu chưa có thì để TODO có tên việc và ghi vào `DECISIONS.md`.
- Nghiệm thu: test từng `resolutionKind`.

**P1-11. BE-49, BE-49a: settlement (A4).**
- `prepareProposeSettlement(issueId, clientBps)` với `clientBps` 0..10000, `prepareRevokeSettlement`, `prepareAcceptSettlement`.
- Pre-check: người gọi là participant, phase khác `RESOLVED`, chỉ một đề xuất đang mở, người accept là bên còn lại.
- Model `SettlementProposal` (lịch sử). Effect `SETTLEMENT_PROPOSED` và `SETTLEMENT_REVOKED`. Khi `ESCROW_RESOLVED` với `SETTLEMENT`, đánh dấu `ACCEPTED`.
- Nghiệm thu: test pre-check và effect.

**P1-12. BE-20: `viewerCapabilities` và `availableActions` (A4).**
- Hàm thuần `lib/escrow/availability.ts`: tính `availableActions` từ projection và thời gian hiện tại. Thêm `viewerCapabilities` vào `IssueRef`, và `IssueRef.escrow`, `reservation`, `latestSubmission`.
- Nghiệm thu: mỗi phase cho đúng tập action.

**P1-13. BE-16: sửa tiêu chí `TestCase` không tăng `termsVersion` (A4).**
- Sửa tiêu chí đã approve phải tăng `termsVersion`. Từ chối khi có reservation active.
- Nghiệm thu: test.

**P1-14. BE-67, BE-68: thống kê (A4).**
- Tính từ `EscrowProjection` và `ClaimableBalance`. Tổng là chuỗi số nguyên.
- `userStats(userId)` public. `adminStats` thêm tỉ lệ dispute, thời gian giải quyết, phí thu. Phần extra có thể để P2.
- Nghiệm thu: test.

**P1-15. BE-81 phần A4 (A4).**
- Thêm test cho Submission. Giữ test race của `selectDeveloper`.

**A5: tranh chấp, chat, thông báo, AI**

**P1-16. BE-52 đến BE-56: dispute on-chain (A5).**
- `createEvidenceManifest(issueId, side, statement, attachmentIds, chatRange?)`: hash bằng `computeEvidenceManifestHash`. Mỗi file là Attachment `EVIDENCE`, `ATTACHED`, có `sha256`. Từ chối nếu hash khác.
- `prepareRaiseDispute(issueId, manifestId)`: party, phase `FUNDED`.
- `prepareSubmitCounterpartyEvidence`: bên kia, phase `DISPUTED`, trước `raisedAt + 72h`, một lần.
- `draftRuling(issueId, clientBps, rationale, kind)`: chỉ ADMIN. `clientBps` 0..10000. Lưu bản quyết định, tính `decisionHash`. Trả JSON Safe Transaction Builder `{version, chainId, createdAt, meta, transactions: [{to, value: "0", data}]}`. Không ký, không đổi trạng thái.
- `prepareChallengeRuling`, `prepareFinalizeRuling`, `prepareFinalizeArbiterTimeoutSplit`: đúng mốc thời gian trong contract.
- Effect dispute: `apps/worker/src/effects/dispute.ts`, đăng ký trong `effects/index.ts`.
- Nghiệm thu: test từng nhánh, gồm biên thời gian.

**P1-17. BE-57: gỡ luồng dispute cũ (A5).**
- Xóa khỏi `apps/web/src/graphql/modules/dispute/dispute.module.ts`: `raiseDispute` (~119), `proposeDisputeResolution` (~413), `challengeDisputeResolution` (~492). Giữ `analyzeDispute` nhưng chỉ làm cố vấn, không đổi trạng thái (~237).
- Bỏ import từ `lib/escrow/*` đã xóa ở P0-4.
- Bỏ BUG-2 tạm nếu không còn luồng cũ.
- Nghiệm thu: `grep "proposeDisputeResolution\|challengeDisputeResolution"` không còn kết quả.

**P1-18. BE-58: admin xem evidence qua signed URL (A5).**
- Dùng presigner S3 đã có trong `apps/web/src/lib/storage.ts`. Thêm `getSignedUrl(key, ttl)` nếu chưa có. Mỗi lần admin xem ghi `AdminLog`.
- Nghiệm thu: test.

**P1-19. BE-59, BE-59a: socket (A5).**
- `apps/web/src/socket/handlers.ts`: rate limit 10 tin / 10 giây / user, dùng `rateLimit` từ `apps/web/src/lib/rate-limit.ts`.
- BE-59a: đặt `afterDispute = true` khi lưu tin sau `disputeRaisedAt`. Hiện cờ có trong schema nhưng chưa được đặt.
- Nghiệm thu: tin thứ 11 bị từ chối. Tin sau mốc dispute có cờ.

**P1-20. BE-65: ops queries (A5).**
- `indexerStatus`, `reconciliationFindings`, `stuckIntents`, `contractConfig`. Chỉ ADMIN.
- Nghiệm thu: test.

**P1-21. BE-64: ẩn issue (A5).**
- `adminHideIssue(issueId, reason)` dùng `Issue.hiddenAt`. Ghi `AdminLog`. Issue đã ẩn không hiển thị trong marketplace và `issues`.
- Nghiệm thu: test.

**P1-22. BE-12: review (A5).**
- `submitReview(issueId, rating 1..5, comment)`: chỉ sau `COMPLETED` với outcome phù hợp. Mỗi bên một lần.
- `apps/web/src/lib/reputation.ts`: `recalcReputation(tx, userId)` cập nhật `reputationScore` và `completedTaskCount`. A4 gọi trong P1-10.
- Nghiệm thu: review trước khi kết thúc bị từ chối. Điểm tính lại đúng.

**P1-23. AI-2: HMAC thay SHA-256 (A5).**
- `apps/web/src/ai/model-router.ts:67`, `apps/web/src/socket/handlers.ts:280` và `:365`: đổi sang HMAC với `AI_HASH_KEY` (đã có trong `.env.example`).
- Không cần migrate dữ liệu cũ.
- Nghiệm thu: cùng input, cùng key → cùng hash. Không còn `createHash("sha256")` trong `ai/` và `socket/`.

**P1-24. AI-5: guard cho nội dung khác (A5).**
- Thêm `guardMessage` cho comment, mô tả issue, mô tả submission, lý do dispute, cover letter.
- Làm sau P1-9 vì phần này sửa mutation của A4.
- Nghiệm thu: test từng nơi.

**P1-25. AI-12: rate limit cho lời gọi AI (A5).**
- `rateLimit` theo user. Nghiệm thu: test vượt ngưỡng.

**P1-26. AI-15: bỏ `GOOGLE_GENERATIVE_AI_API_KEY` (A5).**
- Xóa khỏi `.env.example` và mọi tham chiếu trong `apps/web/src`.
- Nghiệm thu: `grep` không còn kết quả.

**P1-27. AI-16: bộ eval dispute (A5).**
- Thêm ≥10 kịch bản dispute, chạy được trong `apps/web/src/test/eval/`.
- Nghiệm thu: test pass.

**P1-28. BUG-4 phần dispute (A5).**
- `dispute.module.ts`: `suggestedRatio`, `proposedClientRatio` (output) và `clientRatio` (input) còn là `Float`. Đổi sang `Int` bps.
- Nghiệm thu: `grep "t.float(\|t.input.float("` trong `dispute.module.ts` không còn kết quả.

**P1-29. BE-61: kiểm enum (A5).**
- Đã có P0-1. Thêm test so khớp enum và template để không lệch lại.

**A1: nền tảng và upload**

**P1-30. BE-50a, BE-50b, BE-11 (A1).**
- Upload có `purpose` (`CHAT`, `ISSUE_IMAGE`, `DELIVERY`, `EVIDENCE`, `AVATAR`). Attachment `PENDING`, tính `sha256` từ bytes lúc upload. Đây là lệch QĐ-28 đã ghi trong báo cáo A1.
- `GET /api/files/[id]`: `DELIVERY` và `EVIDENCE` chỉ cho người tham gia issue. `EVIDENCE` cho thêm admin khi có dispute. Ghi `AdminLog` khi admin xem.
- BE-11: `purpose = AVATAR`, lưu URL vào `User`.
- Nghiệm thu: test bốn vai trò (khách, người ngoài, người tham gia, admin).

**P1-31. BE-69, BE-70 (A1).**
- Webhook GitHub: dedupe `X-GitHub-Delivery` bằng `GithubWebhookDelivery`. Lệch timestamp quá 5 phút thì bỏ.
- PR merged: `createNotificationIdempotent` cho client. Không gọi mutation tiền nào.
- Nghiệm thu: gửi lại cùng delivery không xử lý lần hai.

**P1-32. BE-91: guard môi trường khi boot (A1).**
- Kiểm `CHAIN_ID` khớp manifest và có bytecode tại `ESCROW_CONTRACT_ADDRESS` (`getCode`). Production: fail-fast.
- Nghiệm thu: test với client giả.

**P1-33. `getSignedUrl` mốc 2 (A1).**
- Có trong P1-18 nếu chưa làm. Ghi ở đây để nhớ thứ tự.

**P1-34. BE-89: cấu hình Railway cho worker (A1).**
- `railway.json` chỉ có service web. Thêm service worker với healthcheck riêng.
- `preDeployCommand` là một phần tử mảng có `&&`. Tách thành các phần tử riêng.
- Nghiệm thu: file JSON hợp lệ. `docs/DEPLOY.md` cập nhật.

**P1-35. BE-03, BE-04, BE-50c (A1, P2).**
- Session refresh, `mySessions`, `revokeSession`. Job dọn session hết hạn và upload `PENDING` quá 24h, đăng ký qua `registerJob`.
- Nghiệm thu: test hàm chọn bản ghi.

**A2: tài liệu**

**P1-36. Tài liệu ghi 20 event, artifact có 19 (A2).**
- Sửa `docs/plan/BACKEND_REMAINING_TASKS.md`, `docs/plan/BACKEND_EXECUTION_PLAN.md`, `docs/plan/parallel/reports/A2.md` nếu còn ghi 20.
- Đúng là: 15 event của contract, cộng `Paused`, `Unpaused`, `OwnershipTransferStarted`, `OwnershipTransferred`.

**P1-37. P2 còn lại (A4).**
- BE-18: bỏ `isDraft` khỏi API (mặc định đã chọn trong `DECISIONS.md`).
- BE-19: `attachIssueFile(issueId, attachmentId)` kiểm `ATTACHED` và `purpose = ISSUE_IMAGE`.
- BE-21: cursor pagination cho `issues`, `myIssues`, `applications`.

---

## 3. P2: standards (sau P0 và P1, hoặc khi còn thời gian)

**S-1. Helper test trùng.**
- `fakeDb`, `callQuery`, `callMutation`, `openIssue` lặp ở 5–8 file trong `apps/web/src/test/`. `CONTRACT`, `client`, `developer`, `reservationRow`, `CREATE_ISSUE`, `createInput` lặp ở 4–6 file.
- Gom vào `apps/web/src/test/helpers/` và `apps/worker/test/helpers.ts`. Import lại.
- Nghiệm thu: `grep` không còn định nghĩa trùng. Test pass.

**S-2. Hằng số trùng.**
- `DAY`, `HOUR`, `MAX_BPS` định nghĩa ở `packages/shared/src/escrow/fold.ts` và `events.ts`. `MINUTE_MS` ở `intent.module.ts` và test.
- Gom về một chỗ trong `packages/shared`.

**S-3. Import không đúng quy ước.**
- `packages/database/src/notifications.ts` import `@prisma/client`. Repo import qua `@bloody-roar/database`. Đồng bộ, hoặc ghi lý do trong `DECISIONS.md`.

**S-4. File quá nhiều việc.**
- `apps/web/src/graphql/modules/escrow/reservation.module.ts` (321 dòng) gộp chọn người, vòng đời reservation và query. Tách theo việc, không tách theo số dòng.
- Chỉ làm nếu không đổi hành vi.

**S-5. Code chết.**
- Xóa `PLATFORM_FEE_PERCENT` khi không còn import. Xóa re-export thừa trong `escrow-abi.ts` nếu không ai dùng.

**S-6. Không sửa.**
- `console.*` trong script CLI (`grant-admin.ts`, `seed.ts`, `export-abi.ts`, `replay-cli.ts`) là chấp nhận được.

---

## 4. Việc không làm được trong môi trường này (ghi vào báo cáo, không làm)

- BE-88: build Docker. Máy có VM 2,8 GB, `next build` bị SIGKILL. Cần builder khoảng 8 GB hoặc build trên Railway.
- GitGuardian trên PR #16, #17. Lịch sử commit còn chuỗi giống secret: `fc1c2b1` (mật khẩu Postgres CI) và `8e9e551` (fixture test). Không viết lại lịch sử. Ghi vào `DECISIONS.md` các lựa chọn: đánh dấu false positive trên dashboard, viết lại nhánh (cần người dùng xác nhận), hoặc tạo PR mới từ commit gộp.

---

## 5. Mặc định cho các quyết định (ghi vào DECISIONS.md, không dừng)

| # | Quyết định | Mặc định |
|---|---|---|
| D1 | GitGuardian PR #16, #17 | Không viết lại lịch sử. Ghi lựa chọn. |
| D2 | Coverage contract | Giữ mock ngoài phép đo (đã làm). Ngưỡng 95/90. |
| D3 | `e2e-workflow` trong CI | Không chạy (cần S3). |
| D4 | BE-10 email | Đã có sẵn trong base. Thêm kiểm định dạng và unique nếu thiếu. |
| D5 | BE-18 `isDraft` | Bỏ khỏi API. |
| D6 | RPC worker | viem (P1-7). |
| D7 | Gộp PR | Một PR từ `be/integration` sau khi gate xanh. Không tự mở. |

---

## 6. Báo cáo cuối

Viết vào `docs/plan/parallel/reports/CODEX.md`:
- Bảng ID → trạng thái (xong / dở / chưa làm) → bằng chứng (lệnh và kết quả).
- Danh sách file đã đổi, theo nhóm.
- Kết quả gate, từng lệnh một.
- Các quyết định đã ghi trong `DECISIONS.md`.
- Các việc bị chặn và lý do.
