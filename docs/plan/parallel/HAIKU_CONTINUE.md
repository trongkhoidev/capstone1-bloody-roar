# Tài liệu tiếp tục cho Claude Haiku 5.5 (30/10/2026, 21:00)

Đọc hết file này trước khi làm gì. Đây là **tài liệu duy nhất** bạn cần để làm từ bây giờ đến khi xong. Mọi quyết định đã chốt ở đây. Không hỏi lại người dùng.

- Thư mục làm việc: `/Users/admin/repos/capstone1-wt/integration`
- Nhánh: `be/integration`
- Runtime: chỉ dùng `bun`, không dùng `npm` hay `pnpm`.

---

## Phần A. Trạng thái hiện tại (đã kiểm lúc bàn giao)

### A1. Đã xong (không làm lại)

- **Phase 0:** Z-1 đến Z-5, Z-7. Z-6 (`next build`) bị chặn, xem A3.
- **Phase D, tranh chấp on-chain:** P1-16 (a–f), P1-18, P1-28, AI-11, D-DSP-2 (migration `RulingDraft`, `EvidenceManifest.issueId/side`). P1-17 chỉ còn phần frontend, làm ở phase FE.
- **Phase B và C:** P0-*, P1-1 đến P1-15, P1-36, P1-37, D4, D5.
- **Harness:** `tests/e2e/run-local.ts`, helper trong `tests/e2e/harness/`, kịch bản E1–E10.

### A2. Kết quả kiểm khi bàn giao (Claude Opus chạy, code tại HEAD `a796f41` cộng phần chưa commit)

| Lệnh | Kết quả |
|---|---|
| `bun run typecheck` | pass |
| `bun run lint` | pass, 4 cảnh báo `any` có sẵn |
| `bun run --cwd apps/web test` | 499/499 pass |
| `bun run --cwd apps/worker test` | 70/70 pass. Lần chạy đầu có 1 test fail, hai lần sau pass: **có test chập chờn**, xem B0.3 |
| `bun run --cwd packages/database test` | 3/3 pass |
| `bun run test:e2e:local` | 11 test pass (E1–E10), 0 fail. Script vẫn exit 1 vì còn thiếu file kịch bản (`Missing G1 scenarios: E11, E12, E13, E14, E15, E16, E17, E22, E23, E24, E31`). Đây là hành vi đúng của harness |

Không còn process nào treo ở cổng 8545, 4010–4019.

### A3. Bị chặn (không làm tiếp)

- **Z-6:** `bun run build` lỗi `RangeError: Division by zero` trong `@vercel/nft`. Codex đã thử 3 cách. **Không đụng nữa.** Gate không gồm build.

### A4. Phần chưa commit (Codex đang làm thì hết quota)

- `tests/e2e/harness/fixture.ts`: tạo user tuần tự thay vì `Promise.all`, để tránh lỗi kết nối Postgres.
- `tests/e2e/harness/work.ts`, `tests/e2e/e09-work.test.ts`, `tests/e2e/e10-release-claim.test.ts`: kịch bản E9, E10. **Đã chạy pass trong harness.**
- `docs/plan/parallel/FINISH_PLAN.md`, `PROMPT_FINISH.md`, `PROMPT_CONTINUE.md`, và file này.

### A5. Nhật ký dọn rác

`tests/e2e/.run/` có khoảng 30 file `.pid` cũ, mọi process tương ứng đều đã chết. Xóa các file `*.pid` trong thư mục này **chỉ khi** `ps -p <pid>` báo không tồn tại.

---

## Phần B. Quy tắc làm việc

### B0. Chạy lệnh

**B0.1 Biến môi trường cho test.** Mỗi lệnh Bash là một shell mới, nên đặt biến này **trong cùng lệnh** với lệnh test. Không in giá trị ra:

```bash
cd /Users/admin/repos/capstone1-wt/integration && set -a && . ./.env >/dev/null 2>&1; set +a; export TEST_DATABASE_URL=$(echo "$DATABASE_URL" | sed -E 's#/[^/?]+(\?|$)#/bloody_codex_test\1#'); <lệnh test>
```

**B0.2 Gate đầy đủ** (chạy cuối mỗi phase, cùng một lệnh):

```bash
bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test && bun run test:e2e:local
```

- Lint không được có thêm cảnh báo mới ngoài 4 cảnh báo `any` cũ.
- `test:e2e:local` mất khoảng 1–3 phút. Chạy ở foreground với timeout 600000 ms.
- Ghi output vào file trong scratchpad rồi `grep` kết quả. Không in toàn bộ log.

**B0.3 Test chập chờn.**
- Worker test fail một lần rồi pass ở lần sau: chạy lại tối đa 2 lần. Fail cả 3 lần thì là lỗi thật, phải sửa.
- Nếu tìm được test chập chờn, sửa nguyên nhân (thường là dữ liệu dùng chung giữa các test hoặc thiếu `await`), commit `fix(test): ...`.

**B0.4 Process.**
- Harness tự bật và tắt Hardhat (8545), worker (4011), web (4012), AI mock (4019).
- Trước khi chạy harness, kiểm các cổng đó trống: `lsof -nP -iTCP -sTCP:LISTEN | grep -E ':(8545|401[0-9])\b'`.
- Cổng bị chiếm bởi process có PID trong `tests/e2e/.run/*.pid` thì được dừng PID đó. PID không có trong `.run/` thì không đụng. Ghi vào "Bị chặn" rồi chuyển sang việc khác không cần harness.
- **Không bao giờ đụng cổng 4000.**

### B1. Ủy quyền (người dùng đã duyệt, không cần hỏi)

Bạn được tự làm, không cần xin phép:
- Sửa, tạo, xóa file trong worktree này, kể cả `apps/web/src/components` và `apps/web/src/app`.
- Tạo migration Prisma; `migrate reset --force` và truncate **chỉ** trên `bloody_codex_test`; `migrate deploy` lên `bloody_codex_test` và `bloody_codex_local`.
- Bật và tắt Hardhat, worker, web, mock trên cổng 8545 và 4010–4019.
- Xóa code và test legacy theo tài liệu này.
- Commit trên `be/integration`.

### B2. Cấm tuyệt đối

- Ghi, reset hoặc truncate DB không kết thúc bằng `_test`. Ngoại lệ duy nhất: `migrate deploy` lên `bloody_codex_local`.
- In hoặc commit nội dung `.env`, secret, `apps/web/.uploads/`, `apps/contracts/deployments/`, `tests/e2e/.run/`.
- `git push`, tạo PR, `git rebase`, `git reset --hard`, xóa nhánh hoặc worktree, `git commit --amend` lên commit có sẵn.
- Thêm dependency mới. Mọi thứ cần đã có: `viem`, `ethers@5.7.2`, `graphql`, `socket.io-client`, `pino`, `@aws-sdk/*`, `zod`.
- Gọi dịch vụ thật (S3, AI provider, GitHub).
- Đổi layout hoặc màu frontend.
- Sửa `apps/contracts/contracts/*.sol`.

### B3. Vòng làm mỗi mục

1. Đọc đúng các file mục đó nêu. Muốn tra code, dùng `codegraph explore "<tên symbol>"` trước, sau đó mới `grep`.
2. Viết test trước nếu mục có logic tiền, quyền, mốc thời gian, hoặc effect worker.
3. Viết code. Theo đúng pattern của file mẫu mục đó chỉ ra.
4. Chạy `bun run typecheck && bun run lint` và test của mục (B0.1).
5. Commit một commit, message `<loại>(<mã viết thường>): <mô tả tiếng Anh ngắn>`, ví dụ `feat(p1-19): rate-limit socket messages`.
6. Thêm hoặc cập nhật dòng của mục trong `docs/plan/parallel/LOCAL_TEST_MATRIX.md` (mã, file test, lệnh, trạng thái, commit). Cập nhật bảng trạng thái ở đầu `docs/plan/parallel/reports/CODEX.md`. Hai file này commit chung với mục.
7. **Chuyển ngay sang mục tiếp theo.** Không viết tóm tắt cho người dùng giữa chừng.

### B4. Khi gặp chỗ tài liệu chưa nói tới

Chọn theo thứ tự ưu tiên:
1. Chain là nguồn sự thật.
2. Theo đúng pattern code có sẵn gần nhất.
3. Diff nhỏ nhất.
4. Đúng ở trường hợp biên.

Ghi một mục vào cuối `docs/plan/parallel/DECISIONS.md` dạng `## BỔ SUNG <mã> — <tên>` với 1–3 dòng lý do. Rồi làm tiếp.

### B5. Khi bị kẹt

- Một mục thử 3 cách khác nhau mà vẫn fail: ghi vào mục `## Bị chặn` trong `CODEX.md` (lệnh, lỗi rút gọn, 3 cách đã thử), rồi làm mục tiếp theo không phụ thuộc vào nó.
- Không dừng cả phiên vì một mục.

### B6. Khi nào được kết thúc

Chỉ một trong ba trường hợp sau:
1. Đạt "Định nghĩa xong" ở Phần E.
2. Sắp hết context. Commit phần đang làm (nếu typecheck pass), ghi dòng đầu `CODEX.md`: `ĐANG DỞ: <mã>. Bước tiếp theo: <việc cụ thể>`, commit, rồi dừng.
3. Mọi mục còn lại đều đã nằm trong "Bị chặn".

---

## Phần C. Thứ tự làm và đặc tả từng mục

Làm đúng thứ tự: **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7.**

### C0. Commit phần dở

1. Chạy E2E (B0.1 + `bun run test:e2e:local`). Xác nhận 11 pass, 0 fail.
2. Commit theo hai nhóm:
   - `test(e9-e10): cover delivery, release and claim`: `fixture.ts`, `work.ts`, `e09-work.test.ts`, `e10-release-claim.test.ts`
   - `docs(plan): finish plan and haiku handoff`: 4 file trong `docs/plan/parallel/`
3. Xóa file `.pid` chết (A5). Không cần commit vì thư mục bị ignore.

### C1. Hoàn tất harness G1: E11–E17, E22–E24, E31, N-12, N-13

**Mẫu:** `tests/e2e/e09-work.test.ts` và `e10-release-claim.test.ts`. **Nguồn logic để chuyển sang:** `tests/e2e/scanner-deposit.ts` (594 dòng; đã có E11–E17, E22–E24 viết theo kiểu script). Chuyển logic thành file test riêng, dùng helper trong `tests/e2e/harness/`.

Quy tắc chung cho mọi file E:
- Mỗi kịch bản một file `tests/e2e/eNN-<tên>.test.ts`. `beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL))`.
- Mỗi test tự tạo issue mới bằng `fixture()`. Không dùng chung escrow giữa các file.
- Đổi thời gian chain: lấy `evm_snapshot` trước, `evm_increaseTime` cộng `evm_mine`, và `evm_revert` trong `finally`. Sau khi revert, chờ checkpoint khớp lại theo đúng đoạn cuối của `e09-work.test.ts`. Nếu đoạn chờ này lặp từ lần thứ 2, tách thành helper `restoreChain(snapshot, f)` trong `tests/e2e/harness/chain.ts`.
- Chờ trạng thái bằng `waitFor`. Không dùng `Bun.sleep` để chờ.
- Kiểm số tiền bằng `bigint` theo đơn vị raw 6 số lẻ (100 USDC = `100_000_000n`).

Helper mới, thêm vào `tests/e2e/harness/`:
- `dispute.ts`:
  - `createEvidence(f, user, statement, files?)` gọi `createEvidenceManifest`.
  - `raiseDispute(f, user, manifestId)` gọi `prepareRaiseDispute`, sau đó `sendPrepared`.
  - `arbiterPost(f, safeJson)` gửi `eth_sendTransaction` từ `f.accounts[5]` với `to` và `data` lấy từ `JSON.parse(safeTransactionJson).transactions[0]`.
- `fixture()` cần trả thêm `arbiter = accounts[5]`, `feeRecipient = accounts[6]` nếu chưa có.

| File | Nội dung bắt buộc kiểm |
|---|---|
| `e11-claim-auth.test.ts` | Người ngoài (#7) `prepareClaim` với recipient là ví khác: lỗi `FORBIDDEN`. Người có balance 0: lỗi. Lấy mã lỗi thật từ `release.module.ts` |
| `e12-missed-delivery.test.ts` | Fund, không submit. Trước deadline: `prepareClaimMissedDeliveryRefund` bị từ chối. Tăng thời gian qua `deliveryDeadline`: người ngoài (#7) gọi được, gửi tx. Client có claimable `100_000_000n`, claim, `balanceOf` client tăng đúng số đó |
| `e13-review-timeout.test.ts` | Fund, submit. Trước `deliveryDeadline + 7 ngày`: từ chối. Sau mốc: developer `prepareClaimReviewTimeout`. Developer claimable `97_500_000n`, fee recipient `2_500_000n` |
| `e14-settlement.test.ts` | Client propose 3000. Developer tự accept đề xuất của chính mình (nhánh developer propose): từ chối. Developer accept đề xuất của client: client `30_000_000n`, developer `68_250_000n`, fee `1_750_000n`. Nhánh revoke: có `SETTLEMENT_REVOKED`, không còn đề xuất chờ. Có `SETTLEMENT_PROPOSED` cho bên còn lại |
| `e15-dispute-ruling.test.ts` | Fund, submit. Client tạo evidence và raise. `DISPUTE_RAISED` gửi tới developer và admin. Developer nộp counterparty evidence trong 72h: `EVIDENCE_SUBMITTED` gửi tới client. Tăng 72h. Admin `draftRuling(INITIAL, 5000)`; kiểm `data` trong JSON đúng bằng `encodeFunctionData(postInitialRuling, [escrowId, 5000n, decisionHash])`. Arbiter gửi tx: `RULING_POSTED`. Tăng 7 ngày, `prepareFinalizeRuling`, gửi tx. Kết quả: client `50_000_000n`, developer `48_750_000n`, fee `1_250_000n`, `DISPUTE_RESOLVED` cho cả hai bên, `Dispute.status = RESOLVED` |
| `e16-challenge.test.ts` | Initial ruling 3000. Client challenge được: `RULING_CHALLENGED`. Developer challenge sau đó: từ chối. Admin `draftRuling(FINAL, 7000)`, arbiter gửi. Tăng 24h, finalize: client `70_000_000n`, developer `29_250_000n`, fee `750_000n`. Một escrow khác: challenge sau 7 ngày bị từ chối |
| `e17-arbiter-timeout.test.ts` | Escrow `DISPUTED`. Trước 30 ngày: `prepareFinalizeArbiterTimeoutSplit` bị từ chối. Sau 30 ngày: người ngoài gọi được, chia 50/48,75/1,25, có `DISPUTE_RESOLVED`. Nhánh `CHALLENGED`: tính 30 ngày từ `challengedAt` |
| `e22-reorg.test.ts` | Chuyển từ `apps/worker/e2e/reorg.e2e.ts` cộng phần E22 trong `scanner-deposit.ts`: snapshot, deposit A, revert, deposit B. Projection theo B, event A `canonical = false`, event B `canonical = true`. Đây là **N-12** |
| `e23-reconciler.test.ts` | Chain khỏe: không có finding. Sửa tay `amountRaw` của projection trong DB test: có finding. Sửa lại: finding đóng. Gọi job reconciliation trực tiếp bằng import nếu worker không chạy đủ nhanh |
| `e24-replay.test.ts` | Gọi `bun run worker:replay --from <deployBlock>` bằng `Bun.spawnSync` với env test. Projection sau replay giống trước replay (so `phase`, `amountRaw`, `projectionVersion` ≥ cũ) |
| `e31-flow.test.ts` | Một issue chạy liên tục: chọn người, fund, submit, release, claim. Cuối cùng: `balanceOf(escrow)` giảm đúng 100 USDC so với lúc fund, developer nhận `97_500_000n`, issue `COMPLETED` |

Sau khi đủ các file trên:
- Xóa `tests/e2e/scanner-deposit.ts` và `apps/worker/e2e/` (cả `harness.ts` và `reorg.e2e.ts`) nếu không còn script nào import. Xóa script trong `package.json` trỏ tới chúng.
- **N-13:** thêm mục `## N-13 dependency` vào `CODEX.md` ghi `socket.io-client` và `pino` kèm phiên bản trong `bun.lock` (`grep` trong `bun.lock`), không cần ngày phát hành.
- Chạy gate B0.2. `test:e2e:local` phải exit 0 với thông báo `G1 E2E scenarios passed`.

### C2. Phase E: chat, admin, review, AI

Thêm kịch bản E18–E21, E30 vào harness **sau khi** làm xong các mục bên dưới, theo bảng ở cuối C2.

**P1-19. Socket** (`apps/web/src/socket/handlers.ts`, handler `message:send` ở dòng ~134).
- Đầu handler, sau khi xác thực user: `const limit = rateLimit(\`chat:${user.id}\`, { limit: 10, windowMs: 10_000 })`, import từ `../lib/rate-limit`. Nếu `!limit.ok`: gọi `callback({ ok: false, error: { code: "RATE_LIMITED", retryAfterMs: limit.retryAfterMs } })` theo đúng dạng callback lỗi đang dùng trong file, rồi `return`, không lưu tin.
- Khi tạo `Message`: đặt `afterDispute: Boolean(dispute?.raisedAt && dispute.raisedAt <= new Date())`, trong đó `dispute = await tx.dispute.findUnique({ where: { issueId }, select: { raisedAt: true } })`.
- Mutation sửa tin trong `apps/web/src/graphql/modules/chat/chat.module.ts` (dòng ~254) dùng cùng key `chat:${user.id}`.
- Test: `apps/web/src/test/socket-rate-limit.test.ts` (theo mẫu `socket-session.test.ts`): tin thứ 11 trong 10 giây bị từ chối; tin sau `raisedAt` có `afterDispute = true`.

**P1-20. Ops queries** (`apps/web/src/graphql/modules/admin/admin.module.ts`, theo mẫu `adminLogs` ở dòng ~85). Cả bốn query chỉ ADMIN, dùng đúng guard admin có sẵn trong file.
- `indexerStatus: [IndexerStatus]`, từ `ProjectionCheckpoint`: `chainId`, `contractAddress`, `lastScannedBlock` (String), `lastCanonicalBlockHash`, `updatedAt`, `lagSeconds` (Int, = now − updatedAt).
- `reconciliationFindings(status: String = "OPEN", first: Int = 20, after: ID)`: theo pattern cursor có sẵn (`adminLogs`).
- `stuckIntents(first, after)`: `TransactionIntent` có `status` thuộc `SUBMITTED`/`PENDING_SAFE_HEAD` và `submittedAt < now − 30 phút`.
- `contractConfig: [ContractConfig]`: mọi dòng `ContractConfig`.
- Test: `apps/web/src/test/admin-ops.test.ts`. Người không phải admin bị `FORBIDDEN`; admin nhận đúng dữ liệu (dùng DB giả theo mẫu test admin có sẵn).

**P1-21. Ẩn issue** (`admin.module.ts` và `issue/issue.module.ts`).
- `adminHideIssue(issueId: ID!, reason: String!)` (reason 3–500 ký tự) đặt `hiddenAt = now`. `adminUnhideIssue(issueId: ID!)` đặt `hiddenAt = null`. Mỗi lệnh ghi `AdminLog` với `action` là `hide_issue` hoặc `unhide_issue`, `target = "issue"`, `details = { reason }`.
- `issue.module.ts`: query `issues` (~366) và `marketplaceStats` (~267) thêm `hiddenAt: null` vào `where`. Query `issue(id)` (~505): nếu `hiddenAt` khác null và người xem không phải client, developer hay ADMIN thì trả `null` (theo cách query này đang trả khi không tìm thấy). `myIssues` không lọc.
- Không đụng escrow.
- Test: `apps/web/src/test/issue-hide.db.test.ts` (DB test). Issue ẩn không có trong `issues`; người ngoài nhận `null`; client vẫn thấy; có `AdminLog`.

**P1-22. Review và uy tín.**
- File mới `packages/database/src/reputation.ts`:
  ```ts
  export async function recalcReputation(tx: Prisma.TransactionClient, userId: string): Promise<void>
  ```
  - `reputationScore` = trung bình `rating` của `Review` có `developerId = userId`, làm tròn 2 chữ số, bằng 0 nếu chưa có review.
  - `completedTaskCount` = số `Issue` có `developerId = userId`, `status = COMPLETED`, `outcome` khác `MISSED_DELIVERY_REFUND`.
  - Export trong `packages/database/src/index.ts` bằng một dòng `export * from "./reputation";`.
- `apps/worker/src/effects/resolved.ts` dòng 37: thay `TODO(P1-22)` bằng lệnh gọi `recalcReputation(tx, developerUserId)` trong cùng transaction (chỉ khi issue có developer). Undo khi reorg cũng gọi lại hàm này sau khi khôi phục.
- Module mới `apps/web/src/graphql/modules/review/review.module.ts`, import một dòng trong `graphql/schema.ts`:
  - `submitReview(issueId: ID!, rating: Int!, comment: String)`:
    - Người gọi là `issue.clientId`. `issue.status = COMPLETED`, `developerId` khác null. `rating` 1–5. `comment` tối đa 2000 ký tự, qua `guardMessage`.
    - `Review.issueId` là unique: trùng (Prisma `P2002`) trả `CONFLICT`.
    - Sau khi tạo, gọi `recalcReputation(tx, developerId)` trong cùng transaction.
  - `reviews(userId: ID!, first: Int = 20, after: ID): [Review]` (public), sắp theo `createdAt desc`.
- **Chỉ client đánh giá developer, mỗi issue một lần.** Không thêm chiều ngược lại.
- Test: `apps/web/src/test/review.db.test.ts`: review trước `COMPLETED` bị từ chối; người khác client bị từ chối; review lần 2 bị `CONFLICT`; điểm trung bình đúng. Worker: thêm case vào `apps/worker/test/effects-resolved.test.ts` kiểm `completedTaskCount` tăng.

**P1-23. HMAC cho hash audit.**
- File mới `apps/web/src/ai/hash.ts`:
  ```ts
  import { createHmac } from "node:crypto";
  export function auditHash(value: string): string
  ```
  - Khóa là `process.env.AI_HASH_KEY`. Thiếu khóa và `NODE_ENV !== "production"`: dùng `"local-dev-ai-hash-key"` và `logger.warn` đúng một lần. Thiếu khóa ở production: throw (env.ts đã bắt buộc biến này ở production).
- Thay `createHash("sha256")...digest("hex")` bằng `auditHash(...)` ở `apps/web/src/ai/model-router.ts:67`, `apps/web/src/socket/handlers.ts:280` và `:365`, `apps/web/src/graphql/modules/chat/chat.module.ts:260`. Bỏ import `createHash` nếu không còn dùng.
- **Không** đổi `createHash` trong `app/api/auth/*`, `lib/auth.ts`, `submission/draft.module.ts` (đó là hash nội dung hoặc token, không phải audit AI).
- Test: `apps/web/src/test/audit-hash.test.ts`: cùng input và key cho cùng hash; khác key cho khác hash; khác SHA-256 thuần.

**P1-24. Guard cho các nội dung khác.**
- Gọi `guardMessage(text, { issueId })` và lưu `result.content` (không từ chối) ở các chỗ sau:
  - `createIssue` và `updateIssue`: field `description` (`issue/issue.module.ts` ~548, ~619). Lúc tạo issue chưa có id thì gọi không kèm `issueId`.
  - `createIssueComment` (`issue/issue-comment.module.ts` ~40).
  - `applyToIssue`: cover letter (`application/application.module.ts` ~83).
  - `createSubmissionDraft`: `description`, **trước** khi tính `descriptionSha256` (`submission/draft.module.ts`).
  - `submitReview`: `comment` (đã nêu ở P1-22).
  - Evidence statement đã có, không làm lại.
- Test: `apps/web/src/test/content-guard.test.ts`. Mỗi chỗ một case: chuỗi giả dạng private key (`0x` + 64 hex, sinh lúc chạy test, xem `8426085` để biết cách tạo fixture) bị che trong dữ liệu lưu.

**P1-25. Rate limit AI.**
- Helper trong `apps/web/src/lib/rate-limit.ts`:
  ```ts
  export function aiRateLimit(user: { id: string; role: string }): void
  ```
  Dùng `rateLimit(\`ai:${user.id}\`, { limit: user.role === "ADMIN" ? 30 : 10, windowMs: 3_600_000 })`. Vượt ngưỡng thì throw `gqlError("Vượt giới hạn gọi AI", "RATE_LIMITED")`.
- Gọi ở đầu: `generateTestCases` (`ai/ai.module.ts` ~86), `analyzeDispute` (`dispute/dispute.module.ts`), và mọi mutation khác gọi `model-router` (tìm bằng `grep -rn "model-router" apps/web/src/graphql`).
- Test: lần gọi thứ 11 của user thường bị `RATE_LIMITED` (mock model router).

**P1-26.** Xóa dòng `GOOGLE_GENERATIVE_AI_API_KEY` trong `.env.example` cùng comment đi kèm. `grep -rn GOOGLE_GENERATIVE apps/web/src` phải rỗng. Không đụng `tests/e2e/check-env.ts` (vẫn chặn biến này).

**P1-27. Eval dispute.**
- Thư mục `apps/web/src/test/eval/dispute/` chứa 10 file JSON:
  `no-delivery`, `late-delivery`, `missing-criteria`, `client-scope-change`, `complete-but-rejected`, `conflicting-evidence`, `chat-promise`, `bad-file-hash`, `both-no-evidence`, `revoked-settlement`.
- Mỗi file có dạng:
  ```json
  { "name": "...", "dispute": { ...dữ liệu đầu vào như analyzeDispute đọc... }, "mockResponse": { ...JSON mà model trả về... }, "expect": { "minClientBps": 0, "maxClientBps": 10000, "validCitations": 2, "droppedCitations": 0 } }
  ```
- Test `apps/web/src/test/eval/dispute-eval.test.ts` chạy từng file qua đúng hàm phân tích mà `analyzeDispute` dùng, với model router được mock để trả `mockResponse`. Kiểm: parse thành công, `suggestedClientBps` nằm trong khoảng, citation không tồn tại bị loại đúng số lượng, có `AILog`.
- Ít nhất 2 file có citation giả để kiểm việc loại bỏ. Không gọi mạng.

**P1-29. Kiểm enum thông báo.**
- Test `apps/web/src/test/notification-types.test.ts`: với mỗi giá trị của `NotificationType` (import từ `@bloody-roar/database`), đọc toàn bộ file `.ts` trong `apps/web/src` và `apps/worker/src` (bỏ thư mục `test`), phải có ít nhất một chuỗi `"<TYPE>"` hoặc `NotificationType.<TYPE>`.
- Loại nào không có nơi tạo: xóa khỏi enum bằng migration và ghi `BỔ SUNG` vào `DECISIONS.md`.

**Kịch bản harness cho phase E:**

| File | Kiểm |
|---|---|
| `e18-chat.test.ts` | Client và developer nhắn trong room khi `IN_PROGRESS`. Người ngoài bị từ chối. Sau `COMPLETED`: chỉ đọc. Khi `DISPUTED`: admin đọc được, không gửi được; tin sau dispute có `afterDispute = true`. Chuỗi private key bị che. Người kia nhận `MESSAGE_RECEIVED`. Dùng `socket.io-client` tới `http://localhost:4012` với cookie lấy từ `login()` |
| `e19-realtime.test.ts` | Socket vào room issue. Sau deposit nhận `escrow:invalidate`. Có thông báo mới thì nhận `notification:new`. User bị ban thì bị ngắt kết nối. Gửi tin bằng session đã logout bị từ chối |
| `e20-notifications.test.ts` | `notifications` có cursor; `unreadCount`; `markNotificationRead`; `markAllNotificationsRead` |
| `e21-admin.test.ts` | `adminStats` khớp projection. `banUser`: issue `OPEN` của user bị hủy, application `PENDING` bị từ chối. `setUserRole` không cho admin tự hạ quyền mình. `adminHideIssue`. `indexerStatus`, `reconciliationFindings`, `contractConfig` trả dữ liệu. `adminLogs` có `ban_user`, `hide_issue`. Review: review trước `COMPLETED` bị từ chối, sau `COMPLETED` thì `reputationScore` đúng |
| `e30-deadline-notice.test.ts` | Sửa `deliveryDeadline` trong projection test về gần hiện tại, gọi job deadline (import trực tiếp) hai lần: mỗi người nhận đúng một `DEADLINE_APPROACHING` |

Cuối C2: gate B0.2.

### C3. Phase F: nền tảng

**P1-30a + N-6. Upload hai bước** (`apps/web/src/app/api/uploads/route.ts`, `apps/web/src/lib/storage.ts`).
- `POST /api/uploads`: body thêm `purpose` (bắt buộc; một trong `ISSUE_IMAGE`, `DELIVERY`, `EVIDENCE`, `AVATAR`; `CHAT` bị từ chối 400 vì chat đi qua socket) và `issueId`.
  - `DELIVERY` và `EVIDENCE`: `issueId` bắt buộc. Người gọi phải là `clientId` hoặc `developerId` của issue, nếu không thì 403.
  - `ISSUE_IMAGE` và `AVATAR`: bỏ qua `issueId`, lưu `null`.
  - `AVATAR`: chỉ MIME `image/*`, tối đa 5 MB.
  - Tạo `Attachment` với `status = PENDING`, `purpose`, `issueId`, `fileName`, `fileUrl` (giá trị `fileUrl` đang trả về), `fileSize`, `fileMime`, `uploaderId`. Response thêm `attachmentId`.
- Route mới `apps/web/src/app/api/uploads/complete/route.ts`, `POST { attachmentId }`:
  - Chỉ uploader. Attachment phải đang `PENDING`.
  - Đọc bytes: local qua `localUploadPath(key)` + `readFile`; S3 qua `GetObjectCommand` rồi đọc stream thành buffer.
  - Số byte phải bằng `fileSize`, nếu không thì 400 và giữ `PENDING`.
  - `sha256 = createHash("sha256").update(bytes).digest("hex")`. Cập nhật `sha256`, `status = ATTACHED`. Nếu `purpose = AVATAR`: cập nhật thêm `User.avatar = fileUrl`.
  - Trả `{ attachmentId, sha256 }`.
- Thêm `.uploads/` vào `apps/web/.gitignore` nếu chưa có.
- Test: `apps/web/src/test/upload-two-step.test.ts`. Upload local rồi complete thì sha256 khớp. Sai kích thước thì 400. Người khác uploader thì 403. `NODE_ENV=production` không có S3 thì 503.

**P1-30b. Quyền tải** (`GET` trong cùng route). Thay khối kiểm quyền hiện tại bằng bảng sau, xét theo `attachment.purpose`:

| purpose | Ai được tải |
|---|---|
| `AVATAR` | Mọi người, kể cả khách |
| `ISSUE_IMAGE` | Mọi người nếu `issueId` khác null và issue có `hiddenAt = null`. Nếu chưa gắn: chỉ uploader |
| `DELIVERY` | Client và developer của issue |
| `EVIDENCE` | Client và developer. ADMIN khi tồn tại `Dispute` của issue; mỗi lần admin tải ghi `AdminLog` `view_evidence` (giữ cơ chế P1-18 đã có) |
| `CHAT` hoặc `null` | Giữ nguyên `canReadIssueChat` |

- Bỏ `isDraft` khỏi các `select` trong route.
- Test: `apps/web/src/test/upload-access.test.ts`, mỗi purpose kiểm bốn vai trò: khách, người ngoài, người tham gia, admin.

**P1-31. Webhook GitHub** (`apps/web/src/app/api/webhooks/github/route.ts`).
- Sau khi kiểm chữ ký HMAC (giữ nguyên code hiện có), đọc header `x-github-delivery`. Thiếu thì trả 400.
- `const { count } = await prisma.githubWebhookDelivery.createMany({ data: [{ deliveryId }], skipDuplicates: true })`. `count === 0` thì trả `200 { duplicate: true }`, không xử lý gì thêm.
- **Không kiểm lệch thời gian**, vì GitHub không gửi header thời gian. Ghi `BỔ SUNG P1-31` vào DECISIONS.
- PR merged: migration thêm `PR_MERGED` vào enum `NotificationType` (`ALTER TYPE "NotificationType" ADD VALUE 'PR_MERGED'`). Gọi `createNotificationIdempotent` cho `issue.clientId`:
  - `type: "PR_MERGED"`, `dedupeKey: \`pr-merged:${issueId}:${prNumber}\``
  - Tiêu đề `"Pull request đã được merge"`, nội dung `"PR #<n> của bài <title> đã merge. Kiểm tra và xác nhận trên hệ thống."`
  - `data: { issueId, prUrl }`
  - Không gọi bất kỳ thứ gì liên quan đến tiền.
- Test: `apps/web/src/test/github-webhook.test.ts`. Cùng delivery id gửi hai lần thì chỉ xử lý một lần. PR merged tạo đúng một thông báo.

**P1-32. Guard cấu hình khi khởi động.**
- File mới `packages/shared/src/chain-guard.ts`:
  ```ts
  export async function assertChainConfig(opts: { rpcUrl: string; chainId: number; escrowAddress: string; manifestPath?: string }): Promise<void>
  ```
  - Dùng viem `createPublicClient`.
  - `getChainId()` khác `chainId`: throw `"CHAIN_ID mismatch: rpc=<x> env=<y>"`.
  - `getBytecode({ address })` rỗng hoặc `"0x"`: throw `"No contract code at ESCROW_ADDRESS"`.
  - `manifestPath` có giá trị, file tồn tại và `chainId === 31337`: đọc JSON; địa chỉ escrow trong manifest (đúng tên trường mà `tests/e2e/harness/seed.ts` đang đọc) khác `escrowAddress` (so chữ thường) thì throw.
  - Export qua `packages/shared/src/index.ts`.
- `apps/web/server.ts`, trước `httpServer.listen`:
  - `ESCROW_ADDRESS` có giá trị: `await assertChainConfig({ rpcUrl: RPC_URL, chainId: Number(CHAIN_ID), escrowAddress, manifestPath: path.resolve("apps/contracts/deployments/localhost.json") })` (đường dẫn tính từ root repo; thử cả `../contracts/deployments/localhost.json` khi cwd là `apps/web`). Lỗi thì `logger.fatal` rồi `process.exit(1)`.
  - `ESCROW_ADDRESS` rỗng: production thì exit 1; dev chỉ `logger.warn`.
- `lib/escrow/prepare.ts` `escrowTarget()`: thiếu `ESCROW_ADDRESS` thì throw `gqlError("Chưa cấu hình escrow", "ESCROW_NOT_CONFIGURED")` (kiểm hàm hiện đang làm gì; chỉ thêm nhánh này nếu chưa có).
- `apps/worker/src/index.ts`, sau `loadConfig()`: gọi `assertChainConfig` tương tự. Lỗi thì exit 1. Worker luôn cần `ESCROW_ADDRESS`.
- Test: `packages/shared` hoặc `apps/web/src/test/chain-guard.test.ts` với client giả: sai chain, không có code, manifest lệch, và trường hợp hợp lệ.
- Kịch bản harness `e29-config-guard.test.ts`: spawn worker với `ESCROW_ADDRESS` là một ví EOA (`accounts[9]`), process phải exit khác 0 trong vòng 20 giây. Lặp lại với `CHAIN_ID=1`.

**P1-35. Session và dọn dẹp.**
- **Không làm refresh token xoay vòng** (ghi `BỔ SUNG P1-35`).
- Trong `apps/web/src/graphql/modules/user/user.module.ts`:
  - `mySessions: [Session]`: các session của user hiện tại có `revokedAt = null` và `expiresAt > now`. Trả `id`, `userAgent`, `ip`, `createdAt`, `expiresAt`, `current`. `current` là true khi `refreshHash` bằng sha256 của token trong request (xem `lib/auth.ts:91` để biết cách tính).
  - `revokeSession(id: ID!): Boolean`: chỉ session của chính mình, đặt `revokedAt = now`.
  - `revokeOtherSessions: Int`: thu hồi mọi session khác session hiện tại, trả số lượng.
- Job worker mới `apps/worker/src/jobs/cleanup.ts` (`everyMs: 3_600_000`), đăng ký một dòng import và một phần tử mảng trong `apps/worker/src/jobs/index.ts`:
  - Xóa `Session` có `expiresAt < now − 7 ngày` hoặc `revokedAt < now − 7 ngày`.
  - Xóa `Attachment` có `status = PENDING` và `createdAt < now − 24h`. Nếu env `UPLOADS_DIR` có giá trị: xóa thêm file `<UPLOADS_DIR>/<key>` (key lấy từ query `key=` trong `fileUrl`; bỏ qua lỗi không có file).
  - Xóa `GithubWebhookDelivery` có `receivedAt < now − 30 ngày`.
  - Thêm `UPLOADS_DIR` vào `.env.example` kèm comment. Thêm một câu vào `docs/DEPLOY.md`: S3 cần lifecycle rule xóa object không gắn sau 1 ngày.
- Test: `apps/web/src/test/sessions.test.ts` (quyền, cờ current), `apps/worker/test/cleanup.test.ts` (DB test: chỉ xóa đúng bản ghi quá hạn).

**Kịch bản harness phase F:**

| File | Kiểm |
|---|---|
| `e25-files.test.ts` | Upload `DELIVERY` qua HTTP tới `http://localhost:4012/api/uploads` (POST, PUT, complete). Người tham gia tải được. Người ngoài nhận 403. `EVIDENCE`: admin tải được khi có dispute, có `AdminLog`. sha256 khớp |
| `e26-webhook.test.ts` | POST payload PR merged có chữ ký (đặt `GITHUB_WEBHOOK_SECRET` test trong env của harness ở `run-local.ts`). Client có thông báo `PR_MERGED`. Gửi lại cùng delivery id: không có thông báo thứ hai |
| `e27-rate-limit.test.ts` | `GET /api/auth/nonce?address=<same>` lần thứ 11 trả 429 kèm header `Retry-After`. Query GraphQL vượt giới hạn điểm trả lỗi |
| `e28-authz.test.ts` | Với mỗi mutation trong `docs/AUTHZ_MATRIX.md`, ít nhất một case cho khách (UNAUTHORIZED) và một case cho người ngoài (FORBIDDEN hoặc NOT_FOUND theo bảng). Thêm vào `AUTHZ_MATRIX.md` các mutation mới của phase D, E, F |
| `e29-config-guard.test.ts` | Như P1-32 |

- Cuối C3: đổi danh sách bắt buộc trong `tests/e2e/run-local.ts` (dòng ~85) thành E1 đến E31 đầy đủ. Đổi thông báo thành `"E2E scenarios passed"`.
- Chạy gate B0.2.

### C4. Phase G2: tài liệu

- **N-10:** `LOCAL_TEST_MATRIX.md` có đủ dòng cho mọi mã trong tài liệu này.
- **N-11:** viết `docs/LOCAL_DEV.md`:
  1. Yêu cầu: Postgres ở localhost:5433, bun, Hardhat.
  2. Lệnh chạy tay theo thứ tự: tạo DB `bloody_codex_local`, `migrate deploy`, Hardhat node (`ulimit -n 65536; bun run --cwd apps/contracts node`), `deploy:local`, điền `ESCROW_ADDRESS` và `ESCROW_DEPLOY_BLOCK` từ manifest, seed, worker (`bun run worker:start`), web (`cd apps/web && PORT=4010 bun run server.ts`).
  3. Thêm mạng Hardhat (31337, `http://127.0.0.1:8545`) vào MetaMask và import tài khoản test #1–#4. Ghi rõ: private key lấy từ output của `hardhat node`, không ghi key vào tài liệu.
  4. Các bước thử luồng: đăng nhập, tạo bounty, ứng tuyển, chọn, ký và nạp, giao việc, release, claim.
  5. Cách chạy `bun run test:e2e:local` và đọc `tests/e2e/.run/last-run.txt`.
- Mọi lệnh ghi trong tài liệu phải đã chạy thử được.

### C5. Phase FE: nối frontend với API mới

Phạm vi: logic gọi API và nút hành động. **Không đổi layout, class màu hay copy** trừ khi nút mới cần nhãn. Nhãn mới viết tiếng Việt, ngắn. Dùng component trong `apps/web/src/components/ui`.

**FE-8 làm trước tiên** (để biết chính xác chỗ nào hỏng):
- Test `apps/web/src/test/fe-operations.test.ts`:
  - Đọc mọi file `.ts`/`.tsx` trong `apps/web/src/components`, `apps/web/src/app`, `apps/web/src/lib`.
  - Trích mọi template string bắt đầu bằng `query`, `mutation` hoặc `subscription` (regex trên backtick).
  - Với mỗi chuỗi: `parse` rồi `validate(schema, doc)` bằng `graphql`, với `schema` import từ `apps/web/src/graphql/schema`.
  - Test fail và liệt kê file cùng lỗi.
- Chạy một lần, lưu danh sách lỗi vào scratchpad. Đó là danh sách việc của FE-4 đến FE-6.

**FE-1. Chain và ví.**
- Thêm `NEXT_PUBLIC_CHAIN_ID` vào `.env.example` (mặc định `84532`; local `31337`).
- Trong `apps/web/src/lib/web3/client.ts`: `export const ACTIVE_CHAIN = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532) === 31337 ? LOCALHOST_CHAIN : BASE_SEPOLIA_CHAIN`. Có sẵn hàm đổi chain thì dùng; không có thì thêm `ensureChain()` gọi `wallet_switchEthereumChain`, và `wallet_addEthereumChain` khi gặp lỗi 4902.

**FE-1b. Gửi giao dịch đã chuẩn bị:** file mới `apps/web/src/lib/web3/send-prepared.ts`.
```ts
export type PreparedCall = { intentId: string; contractAddress: string; data: string; value: string };
export async function sendPreparedCalls(calls: PreparedCall[], record: (intentId: string, txHash: string) => Promise<void>): Promise<string[]>
```
- Lấy signer từ `new ethers.providers.Web3Provider(window.ethereum).getSigner()`, gọi `ensureChain()`.
- Với mỗi call, **lần lượt**: `const tx = await signer.sendTransaction({ to, data, value: ethers.BigNumber.from(value) })`, `await record(intentId, tx.hash)`, `await tx.wait(1)`. Receipt `status !== 1` thì throw.
- `record` gọi mutation `recordTransactionSubmitted(intentId: $id, txHash: $hash) { id }`.

**FE-1c. Ký funding intent:** file mới `apps/web/src/lib/web3/funding-intent.ts`.
- Dựng typed data bằng `fundingIntentTypedData` từ `@bloody-roar/shared/escrow`, **đúng như** `tests/e2e/harness/funding.ts` dòng 24–27.
- `nonce` = 16 byte ngẫu nhiên từ `crypto.getRandomValues`, đổi sang bigint. `intentExpiry` = bây giờ + 10 phút.
- Ký bằng `signer._signTypedData(typed.domain, typed.types, message)`, trong đó `message` là `typed.message` đã đổi bigint sang string, và `types` không chứa `EIP712Domain`.
- Gọi `submitFundingIntent(reservationId, signature, nonce: String, intentExpiry: ISO string)`.

**FE-2. Làm mới sau giao dịch.** Trong `issue-detail-view.tsx`: dùng socket client có sẵn của app (tìm trong `components/chat/chat-room.tsx` hoặc `lib/realtime`). Join room issue và lắng nghe `escrow:invalidate`, khi nhận thì `queryClient.invalidateQueries` cho query của issue. Dự phòng: sau mỗi giao dịch, refetch mỗi 4 giây, tối đa 30 lần, sau đó hiện `"Đang chờ chain xác nhận"`.

**FE-3. Nút theo quyền.** Query issue lấy thêm `availableActions { action enabledAt reasonDisabled }` và `viewerCapabilities` (dùng đúng tên field trong `graphql/modules/issue/issue-availability.module.ts`). Mỗi nút chỉ hiện khi action có trong danh sách. Nút bị tắt hiển thị `reasonDisabled` dạng tooltip hoặc dòng chữ nhỏ. Không tự tính quyền ở frontend.

**FE-4. `apps/web/src/components/marketplace/issue-detail-view.tsx`.** Xóa hằng `ASSIGN_MUTATION`, `DISPUTE_MUTATION`, `SUBMIT_WORK`, `REVIEW_SUBMISSION` (dòng 42–47) và mọi chỗ dùng chúng. Thay bằng các luồng sau, mỗi luồng là một hàm handler trong component:

| Vai trò | Luồng |
|---|---|
| Client | Chọn developer: `selectDeveloper` (lấy chữ ký args thật từ `reservation.module.ts`) với ô ngày `deliveryDeadline`, mặc định +7 ngày |
| Client | Nạp tiền: FE-1c, sau đó `prepareEscrowDeposit(reservationId) { steps { intentId method contractAddress data value } }`, rồi `sendPreparedCalls(steps)` |
| Client | `cancelReservation` khi reservation đang chờ nạp |
| Developer | Giao việc: form mô tả, PR URL, commit SHA, file (upload `DELIVERY` qua FE-7) → `createSubmissionDraft` → `prepareSubmitWork` → `sendPreparedCalls` |
| Client | `prepareReleaseFunds` → gửi; hoặc `requestChanges(submissionId, notes)` |
| Hai bên | Settlement: ô nhập % cho client (đổi sang bps = % × 100), `prepareProposeSettlement`, `prepareRevokeSettlement`, `prepareAcceptSettlement` |
| Hai bên | Tranh chấp: form statement và file `EVIDENCE` → `createEvidenceManifest` → `prepareRaiseDispute`; bên còn lại → `prepareSubmitCounterpartyEvidence`; `prepareChallengeRuling` |
| Bất kỳ ai đăng nhập | `prepareFinalizeRuling`, `prepareFinalizeArbiterTimeoutSplit`, `prepareClaimMissedDeliveryRefund`, `prepareClaimReviewTimeout` khi action có hiệu lực |
| Client sau `COMPLETED` | Form `submitReview` (1–5 sao, nhận xét) |

- Lỗi GraphQL hiển thị `errors[0].message` theo cách component đang hiện lỗi.

**FE-5. Claim.** Trong `components/dashboard/dashboard-view.tsx` (hoặc `profile-view.tsx` nếu dashboard không có khu ví): query `myClaimable { chainId contractAddress address amountRaw }`, hiển thị số dư theo 6 số lẻ, nút "Rút tiền" gọi `prepareClaim` (lấy args thật từ `release.module.ts`) rồi `sendPreparedCalls`.

**FE-6. `apps/web/src/components/admin/admin-view.tsx`.**
- Xóa `PROPOSE_RESOLUTION` (dòng 19) cùng UI của nó. Sửa `ADMIN_DISPUTES` cho khớp schema mới: bỏ `suggestedRatio` và `proposedClientRatio`, dùng `suggestedClientBps`, `proposedClientBps`, `finalClientBps`, `aiStatus`.
- Form `draftRuling`: kind (INITIAL/FINAL), % client, rationale. Kết quả hiện `decisionHash` và `safeTransactionJson` trong `<pre>`, có nút copy (`navigator.clipboard.writeText`) và nút tải file `ruling-<issueId>.json` (Blob cùng thẻ `<a download>`).
- Phần "AI (tham khảo)" hiện `suggestedClientBps` và tóm tắt report. Không tự điền vào form.
- Danh sách evidence từ `evidenceFiles(issueId)` với link `downloadUrl`.
- Tab "Vận hành": `indexerStatus`, `reconciliationFindings`, `stuckIntents`.
- Nút "Ẩn" và "Bỏ ẩn" issue trong bảng issue admin.

**FE-7. Upload helper:** `apps/web/src/lib/upload.ts`.
```ts
export async function uploadFile(file: File, purpose: "ISSUE_IMAGE" | "DELIVERY" | "EVIDENCE" | "AVATAR", issueId?: string): Promise<{ attachmentId: string; sha256: string }>
```
`POST /api/uploads` → `PUT uploadUrl` với body là file và header `Content-Type` → `POST /api/uploads/complete`. Lỗi ở bước nào thì throw kèm message của server. Dùng cho delivery, evidence, ảnh issue (`attachIssueFile` sau khi complete), avatar (trong profile).

**Kết thúc FE:**
- `fe-operations.test.ts` pass, không còn chuỗi GraphQL không hợp lệ.
- `grep -rn "proposeDisputeResolution\|challengeDisputeResolution\|assignDeveloper\|reviewSubmission\|depositToEscrow\|raiseDispute(input" apps/web/src` phải rỗng.
- Gate B0.2 xanh. `next build` vẫn bị chặn (A3), không cần chạy.
- Người dùng tự kiểm bằng MetaMask theo `docs/LOCAL_DEV.md`.

### C6. Phase H: chuẩn code

Chỉ làm khi gate xanh. Không đổi hành vi. Sau mỗi mục chạy gate.

- **S-1:** gom helper test trùng (`fakeDb`, `callQuery`, `callMutation`, `openIssue`, `CONTRACT`, `client`, `developer`, `reservationRow`, `CREATE_ISSUE`, `createInput`) vào `apps/web/src/test/helpers/` và `apps/worker/test/helpers.ts`. Tìm bằng `grep -rn "function fakeDb\|const fakeDb" apps/web/src/test`. Chỉ gom bản giống nhau; bản khác nhau giữ nguyên.
- **S-2:** `DAY`, `HOUR`, `MAX_BPS` để ở một chỗ trong `packages/shared/src/escrow/constants.ts` (hoặc file constants đã có), nơi khác import. `MINUTE_MS` tương tự.
- **S-3:** `packages/database/src/notifications.ts` import type từ `./generated` hoặc `@prisma/client`. Nếu đổi sẽ gây import vòng thì giữ nguyên và ghi `BỔ SUNG S-3`.
- **S-4:** tách `apps/web/src/graphql/modules/escrow/reservation.module.ts` thành `select.module.ts` (`selectDeveloper`, `cancelReservation`) và `reservation.module.ts` (type và query). Thêm import trong `schema.ts`.
- **S-5:** xóa `PLATFORM_FEE_PERCENT` nếu `grep` không còn ai import; xóa re-export thừa trong `escrow-abi.ts` nếu không ai dùng.

### C7. Phase I: báo cáo cuối

Viết lại phần đầu `docs/plan/parallel/reports/CODEX.md`:
1. Dòng đầu: `HOÀN TẤT <ngày giờ>` (hoặc `ĐANG DỞ` nếu chưa xong).
2. Bảng mọi mã (Z, P1, N, E, FE, S) → trạng thái → commit.
3. Kết quả gate cuối, từng lệnh và số test.
4. Danh sách "Bị chặn".
5. Danh sách mục `BỔ SUNG` đã thêm vào DECISIONS.
6. Việc người dùng tự làm (Phần F).

Commit `docs(report): final status`.

---

## Phần D. Tham chiếu nhanh

### D1. Helper và file mẫu có sẵn

| Cần | Dùng |
|---|---|
| Tạo giao dịch chờ ký | `createPreparedCall`, `escrowTarget` trong `apps/web/src/lib/escrow/prepare.ts` |
| Mẫu mutation `prepare*` | `apps/web/src/graphql/modules/escrow/settlement.module.ts` |
| Thời gian chain | `readChainTime(chainId)` trong `apps/web/src/lib/escrow/chain-time.ts` |
| Action theo phase | `availableActions` trong `apps/web/src/lib/escrow/availability.ts` |
| Rate limit | `rateLimit`, `tooManyRequests` trong `apps/web/src/lib/rate-limit.ts` |
| Che nội dung | `guardMessage(content, { issueId })` trả `{ content, wasModified, matches }` |
| Thông báo chống trùng | `createNotificationIdempotent` trong `@bloody-roar/database` |
| Lỗi GraphQL | `gqlError(message, code)` trong `apps/web/src/graphql/errors` |
| Auth trong resolver | `requireAuth(ctx)` trong `apps/web/src/graphql/context` |
| Hash | `canonicalJson`, `keccakUtf8`, `computeEvidenceManifestHash`, `computeDecisionHash` trong `@bloody-roar/shared/escrow` |
| ABI và calldata | `ESCROW_ABI` (`@bloody-roar/shared/escrow`), `encodeFunctionData` (`@bloody-roar/shared`) |
| Mẫu effect worker có undo | `apps/worker/src/effects/settlement.ts`, `dispute.ts` |
| Đăng ký job | `apps/worker/src/jobs/index.ts`, mỗi job một import và một phần tử mảng |
| Mẫu DB test | `apps/web/src/test/*.db.test.ts` |
| Mẫu E2E | `tests/e2e/e09-work.test.ts`, helper trong `tests/e2e/harness/` |
| Tra code | `codegraph explore "<symbol>"` |

### D2. Tài khoản Hardhat (D-ACC-1)

| # | Vai trò |
|---|---|
| 0 | Owner và deployer |
| 1 | Admin (`ADMIN_WALLETS`) |
| 2 | Client |
| 3 | Developer 1 |
| 4 | Developer 2 |
| 5 | Arbiter |
| 6 | Fee recipient |
| 7 | Người ngoài |
| 8 | User bị ban |
| 9 | Dự phòng (dùng làm địa chỉ EOA cho E29) |

### D3. Mốc thời gian của contract

| Hằng số | Giá trị |
|---|---|
| `REVIEW_PERIOD` | 7 ngày |
| `EVIDENCE_RESPONSE_PERIOD` | 72 giờ |
| `CHALLENGE_PERIOD` | 7 ngày |
| `FINAL_RULING_NOTICE_PERIOD` | 24 giờ |
| `ARBITER_STALL_PERIOD` | 30 ngày |
| `PLATFORM_FEE_BPS` | 250, chỉ tính trên phần của developer |

### D4. Phí với bounty 100 USDC (raw 6 số lẻ)

| Kết quả | Client | Developer | Fee |
|---|---|---|---|
| Release / review timeout | 0 | 97_500_000 | 2_500_000 |
| Settlement 3000 bps | 30_000_000 | 68_250_000 | 1_750_000 |
| Ruling 5000 / ATS | 50_000_000 | 48_750_000 | 1_250_000 |
| Ruling 7000 | 70_000_000 | 29_250_000 | 750_000 |
| Missed delivery | 100_000_000 | 0 | 0 |

### D5. Quy tắc thông báo

- RULING và ARBITER_TIMEOUT_SPLIT chỉ gửi `DISPUTE_RESOLVED`.
- Các kind kết thúc khác gửi `ESCROW_RESOLVED`.
- Ai có claimable > 0 thì nhận thêm `FUNDS_CLAIMABLE`.
- Bảng đầy đủ: `LOCAL_FULL_FLOW_SPEC.md` mục 6.2.

---

## Phần E. Định nghĩa xong

Tất cả điều sau phải đúng **trong cùng một lần kiểm**:

1. Gate B0.2 exit 0. `test:e2e:local` báo đủ E1–E31 pass.
2. Các lệnh `grep` sau đều rỗng:
   - `grep -rn "proposeDisputeResolution\|challengeDisputeResolution\|assignDeveloper\|reviewSubmission\|depositToEscrow" apps/web/src`
   - `grep -rn "GOOGLE_GENERATIVE_AI_API_KEY" apps/web/src .env.example`
   - `grep -rn 'createHash("sha256")' apps/web/src/ai apps/web/src/socket`
   - `grep -rn "TODO(P1-22)" apps`
3. `fe-operations.test.ts` pass.
4. `LOCAL_TEST_MATRIX.md` có dòng cho mọi mã ở Phần C. `CODEX.md` có báo cáo cuối theo C7.
5. `git status` sạch (trừ file ignore). Mọi việc đã commit trên `be/integration`.

## Phần F. Việc người dùng tự làm (bạn không làm)

- Kiểm thử luồng bằng MetaMask theo `docs/LOCAL_DEV.md`.
- Xóa worktree cũ (`capstone1-wt/a4-int`, `capstone1/.worktrees/backend-fixes`).
- Sửa lỗi `next build` (Z-6), deploy, GitGuardian, mở PR.
