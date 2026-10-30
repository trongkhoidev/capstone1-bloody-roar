# Kế hoạch hoàn tất logic còn thiếu (30/10/2026)

Nhánh làm việc: `be/integration`, worktree `/Users/admin/repos/capstone1-wt/integration`.

File này **bổ sung và ghi đè** `LOCAL_FULL_FLOW_SPEC.md`, `FIX_LIST.md`, `DECISIONS.md` ở những chỗ có mâu thuẫn. Thứ tự ưu tiên khi hai tài liệu nói khác nhau: file này > `DECISIONS.md` > `LOCAL_FULL_FLOW_SPEC.md` > `FIX_LIST.md` > `BACKEND_REMAINING_TASKS.md`.

Các mục đã xong (phase A, B, và code phase C: P1-1 đến P1-15, P1-36, P1-37, D4, D5) không làm lại. Chỉ sửa khi test của chúng đỏ.

---

## 0. Trạng thái xuất phát (đã kiểm ngày 30/10)

- Gate pass với phần chưa commit: typecheck, lint (4 cảnh báo `any` cũ), web 489/489, worker 68/68, database 3/3. Worker và database cần `TEST_DATABASE_URL` trỏ `bloody_codex_test`.
- 5 file BE-35 chưa commit: `apps/worker/src/indexer/reorg.ts`, `apps/worker/src/jobs/intents.ts`, `apps/worker/src/reconciler/intents.ts`, `tests/e2e/scanner-deposit.ts`, `apps/worker/test/intent-race.test.ts`, cùng `reports/CODEX.md`.
- Chưa vào integration: 4 commit CI của `be/a1-platform`, 1 commit của `be/a5-dispute-chat-ai`, 1 commit UI `feat/ledger-palette-copy` (`3bf6aab`). Đã thử: merge `feat/ledger-palette-copy` không có xung đột.
- Frontend gọi mutation đã xóa: `issue-detail-view.tsx:42-47` (`assignDeveloper`, `raiseDispute`, `submitWork`, `reviewSubmission`), `admin-view.tsx:19` (`proposeDisputeResolution`).
- Không có nơi nào tạo `Attachment` với `purpose` và `sha256` (trừ chat qua socket). Vì vậy `createSubmissionDraft` có file đính kèm và `attachIssueFile` hiện không dùng được trong thực tế.

---

## 1. Quy tắc làm việc (bắt buộc)

1. **Không dừng để hỏi.** Mọi quyết định đã chốt ở mục 3. Gặp chỗ file này không nói tới thì chọn theo thứ tự: (a) chain là nguồn sự thật; (b) theo đúng pattern code đã có trong repo; (c) diff nhỏ nhất. Ghi lại lựa chọn vào cuối `DECISIONS.md`, dưới tiêu đề `## BỔ SUNG <mã> — <tên>`, kèm một dòng lý do, rồi làm tiếp.
2. **Chỉ dừng hẳn** khi việc tiếp theo cần: ghi hoặc xóa database không kết thúc `_test` (trừ migrate deploy lên `bloody_codex_local`), đụng port 4000, in hoặc commit secret, push, tạo PR, hoặc xóa worktree hay nhánh. Gặp trường hợp này: ghi vào mục "Bị chặn" trong `CODEX.md`, bỏ qua việc đó, làm tiếp mục khác.
3. Quy tắc an toàn ở `LOCAL_FULL_FLOW_SPEC.md` mục 1 và `DECISIONS.md` Q1, Q8 vẫn giữ nguyên: DB test phải tên `_test` trên localhost, dùng port 4010–4019, chỉ dừng process theo PID trong `tests/e2e/.run/`.
4. Mỗi mục một commit, message dạng `feat(p1-16): ...` hoặc `fix(be-35): ...`. Không push.
5. Sau mỗi mục: `bun run typecheck && bun run lint` cùng test liên quan. Cuối mỗi phase: chạy gate đầy đủ (mục 5).
6. Schema đổi: tạo migration bằng `bun run --cwd packages/database prisma migrate dev --create-only --name <tên>` trên `bloody_codex_test`, xem SQL, rồi `migrate deploy` lên `bloody_codex_test` và `bloody_codex_local`. Sau đó `bun run --cwd packages/database db:generate`.
7. Không thêm dependency. Danh sách được phép giữ như D-DEP-1. Frontend dùng `ethers@5.7.2` có sẵn.
8. Sắp hết context: commit điểm dừng, ghi `ĐANG DỞ: <mã>. Bước tiếp theo: <việc>` ở đầu `CODEX.md`.

### 1.1 Ủy quyền của người dùng (30/10/2026)

Người dùng đã duyệt toàn bộ kế hoạch này và ủy quyền cho AI code tự làm, không cần xin phép từng bước, các việc sau:

- Sửa, tạo, xóa file trong worktree `integration`, gồm cả `apps/web/src/components` và `apps/web/src/app` (phase FE), script, workflow, tài liệu.
- Merge `be/a1-platform`, `be/a5-dispute-chat-ai`, `feat/ledger-palette-copy` vào `be/integration` (Z-3) và tự giải quyết xung đột theo quy tắc ở Z-3.
- Tạo migration; chạy `migrate dev --create-only`, `migrate reset --force` và truncate trên database `_test` ở localhost; chạy `migrate deploy` lên `bloody_codex_local`.
- Sửa `.env` và `packages/database/.env` của worktree `integration` theo `LOCAL_FULL_FLOW_SPEC.md` mục 2.2 (không in giá trị).
- Khởi động và dừng Hardhat hoặc Anvil ở cổng 8545, worker ở 4011, web và mock ở 4010–4019. Chỉ dừng PID do chính mình ghi trong `tests/e2e/.run/`.
- Xóa code và test legacy theo kế hoạch (Z-7, P1-17, P1-28, S-5).
- Commit trên `be/integration`, mỗi mục một commit, kể cả `FINISH_PLAN.md` và `PROMPT_FINISH.md` (commit đầu tiên, message `docs(plan): finish plan`).
- Tự quyết những chỗ kế hoạch chưa nói tới, theo mục 1 điều 1.

Ngoài danh sách cấm ở mục 1 điều 2, không có việc nào cần hỏi lại.

### 1.2 Không tự kết thúc giữa chừng

- Xong một mục và commit xong thì **chuyển ngay sang mục tiếp theo trong cùng phiên**. Không viết báo cáo cho người dùng, không tóm tắt, không chờ xác nhận sau mỗi mục hay mỗi phase.
- Chỉ được kết thúc phiên khi rơi vào một trong ba trường hợp:
  1. Định nghĩa xong ở mục 6 đã đạt.
  2. Sắp hết context. Khi đó ghi dòng `ĐANG DỞ` theo mục 1 điều 8 rồi dừng.
  3. Mọi mục còn lại đều đã nằm trong "Bị chặn" kèm bằng chứng.
- Câu "Công việc chưa hoàn tất" không phải lý do để dừng. Nếu còn mục chưa làm và còn context thì phải làm tiếp.

---

## 2. Thứ tự làm

| Phase | Mục | Kết thúc khi |
|---|---|---|
| 0. Dọn đường | Z-1 → Z-7 | Gate xanh, E2E Hardhat chạy được |
| D. Tranh chấp | P1-16, P1-17 (phần còn lại), P1-18, P1-28, N-6, AI-11 | Test unit/DB xanh, E15–E17 chạy bằng `scanner-deposit.ts` hoặc harness |
| G1. Harness sớm | N-8, N-9, N-12, N-13 | `bun run test:e2e:local` chạy được E1–E17, E22–E24, E31 |
| E. Chat, admin, AI | P1-19 → P1-27, P1-29 | E18–E21, E30 xanh |
| F. Nền tảng | P1-30, P1-31, P1-32, P1-35, P1-33 | E25–E29 xanh |
| G2. Hoàn tất harness | E1–E31 đầy đủ, N-10, N-11 | `test:e2e:local` xanh toàn bộ |
| FE. Nối frontend | FE-1 → FE-8 | Test schema operation xanh, `next build` pass (nếu Z-6 sửa được) |
| H. Standards | S-1 → S-5 | Gate và E2E vẫn xanh |
| I. Báo cáo | CODEX.md, LOCAL_TEST_MATRIX.md | Mục 6 |

Harness được đưa lên trước phase E vì gate phase C, D cần chạy luồng thật từ E1. Không có harness thì không có bằng chứng.

---

## 3. Quyết định đã chốt, theo từng mục

### Phase 0 — Dọn đường

**Z-1. Chốt BE-35 (đang dở).**
- Trong `reconcileIndexedIntents`: điều kiện `chainEvent.findMany` dùng `contractAddress: { equals: config.escrowAddress, mode: "insensitive" }`, giống câu truy vấn intent.
- Giới hạn mỗi lượt `take: 200`, `orderBy: { submittedAt: "asc" }`. Gom tra cứu event thành một truy vấn `txHash: { in: [...] }` rồi ghép trong bộ nhớ, không truy vấn từng intent.
- Thêm test: 2 intent, event lưu địa chỉ khác kiểu chữ, vẫn xác nhận được.
- Commit cùng 5 file đang dở.

**Z-2. EMFILE khi chạy Hardhat.**
- Harness và `scanner-deposit.ts` khởi động node bằng `sh -c 'ulimit -n 65536; exec bun run --cwd apps/contracts node'`.
- Viết một helper dùng chung `tests/e2e/harness/chain.ts`, gồm `startChain()` và `stopChain()`:
  - `startChain()`: kiểm cổng 8545 trống (đang bận thì ném lỗi), spawn lệnh trên và ghi `tests/e2e/.run/hardhat.pid`, chờ `eth_chainId` trả về (tối đa 60 giây), chạy `deploy:local`, đọc manifest, gán `ESCROW_ADDRESS` và `ESCROW_DEPLOY_BLOCK` vào `process.env`.
  - `stopChain()`: dừng theo PID đã ghi, xóa file PID.
  
  `scanner-deposit.ts` gọi helper này ngay bây giờ. N-8 dùng lại nó sau.
- Z-2 xong khi `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` tự bật chain, chạy pass, tự tắt, không cần lệnh tay nào.
- Vẫn lỗi EMFILE thì dùng `anvil` (có sẵn tại `~/.foundry/bin/anvil`): `anvil --port 8545 --chain-id 31337 --accounts 10 --balance 10000`. Anvil dùng cùng mnemonic mặc định với Hardhat nên địa chỉ #0–#9 giống nhau. Ghi lựa chọn vào `DECISIONS.md`.

**Z-3. Merge các nhánh còn sót** vào `be/integration`, theo thứ tự: `be/a1-platform`, `be/a5-dispute-chat-ai`, `feat/ledger-palette-copy`.
- Xung đột ở `.github/workflows/*`: giữ bản của A1.
- Xung đột ở file test: giữ bản integration và thêm phần thay đổi của nhánh kia.
- Xong thì chạy gate.

**Z-4. Intent `approve` kẹt ở PENDING_SAFE_HEAD.**
- Reconciler xác nhận intent có `method = "approve"` bằng receipt: `status = 1`, block ≤ safe head (hoặc latest khi `FINALITY=latest`), và `to` khớp địa chỉ token. Không cần index event `Approval`.
- Test với receipt giả.

**Z-5. Sửa bảng trong `CODEX.md`.** Bảng ở cuối file còn ghi P1-8 đến P1-15 là "chưa làm". Viết lại bảng theo trạng thái thật và chuyển nó lên đầu file.

**Z-6. `next build` lỗi `RangeError: Division by zero` (@vercel/nft).** Giới hạn 60 phút. Thử theo thứ tự:
1. Chạy build trong chính worktree, không chạy trong `/private/tmp`.
2. Đặt `outputFileTracingRoot` trỏ về root repo trong `next.config`.
3. Loại `apps/web/.uploads` và `tests/` khỏi tracing.

Không sửa được thì ghi vào "Bị chặn". Lỗi này không chặn gate.

**Z-7. Script E2E cũ.**
- Xóa `apps/web/scripts/e2e-escrow.ts` và `e2e-workflow.ts`, cùng script `test:escrow` trong `apps/web/package.json`.
- `test:e2e:backend` ở `apps/web` chỉ giữ `e2e-login`, `e2e-issue`, `e2e-chat`, `e2e-application` nếu chúng không gọi mutation đã xóa. Script nào gọi thì xóa luôn.
- Script root `test:e2e:backend` gọi `bun run test:e2e:local` sau khi có N-8.

### Phase D — Tranh chấp on-chain

**D-DSP-1. Nguồn sự thật.**
- Bảng `Dispute` chỉ được worker tạo hoặc sửa, từ event chain.
- Các mutation GraphQL `prepare*` chỉ tạo `TransactionIntent` qua `createPreparedCall`, giống `settlement.module.ts`.
- Không mutation nào được tự đổi `Dispute.status` hay `Issue.status` vì lý do tranh chấp.

**D-DSP-2. Migration `dispute_onchain`.**
- `EvidenceManifest`: thêm `issueId String` (có index), thêm `side String` (giá trị `"CLIENT" | "DEVELOPER"`, khớp type `EvidenceManifest` trong `packages/shared/src/escrow/hashing.ts`). `disputeId` đổi thành `String?`.
- Bảng hiện đang rỗng ở mọi DB local. Nếu không rỗng, điền `issueId` từ `disputes.issueId` trước khi đặt NOT NULL.
- Model mới `RulingDraft`:
  ```prisma
  model RulingDraft {
    id           String   @id @default(cuid())
    issueId      String
    kind         String   // INITIAL | FINAL
    clientBps    Int
    rationale    String
    decisionHash String   @unique
    draftedById  String
    createdAt    DateTime @default(now())
    @@index([issueId])
    @@map("ruling_drafts")
  }
  ```
- Không xóa các cột Decimal cũ trong `Dispute`. GraphQL chỉ ngừng dùng chúng (P1-28). Việc xóa cột để giai đoạn deploy.

**P1-16a. `createEvidenceManifest(issueId, statement, attachmentIds, chatRange?)`**, file mới `graphql/modules/dispute/evidence.module.ts`.
- Người gọi phải là client hoặc developer của projection. `side` lấy theo ví người gọi.
- Ai được tạo:
  - **Bên khởi kiện:** phase `FUNDED`.
  - **Bên còn lại:** phase `DISPUTED`, người gọi không phải `disputeRaisedBy`, `counterpartyEvidenceHash` còn null, và thời gian chain (`readChainTime`) nhỏ hơn `disputeRaisedAt + 72h`.
- `statement`: 10 đến 5000 ký tự. Chạy `guardMessage` trước, rồi dùng nội dung đã che. `statement.sha256` là sha256 hex của text sau khi che.
- File: tối đa 10. Mỗi file phải là Attachment `purpose = EVIDENCE`, `status = ATTACHED`, `issueId` = issue này, `uploaderId` = người gọi, `sha256` hợp lệ. Sai bất kỳ điều kiện nào thì từ chối toàn bộ với mã `INVALID_ATTACHMENT`.
- `chatRange` (không bắt buộc): `{ fromMessageId, toMessageId }` thuộc room của issue, from ≤ to theo `createdAt`. `transcriptSha256` là sha256 của `canonicalJson` mảng `[{id, senderId, content, createdAt ISO}]`, lấy các tin chưa xóa trong khoảng, sắp theo `(createdAt, id)`.
- Hash: `computeEvidenceManifestHash({ escrowId: projection.escrowKey, side, statement, files: [{key: fileUrl, sha256, mime, size, name}], chatRange })`.
- Lưu `EvidenceManifest`: `manifest` là JSON đầy đủ, `manifestHash`, `storageKey`. Ghi bản `canonicalJson` ra storage tại `manifests/{issueId}/{hash}.json` bằng helper `putObject(key, bytes, mime)` mới trong `lib/storage.ts` (S3 nếu có cấu hình, nếu không thì `.uploads`). `disputeId` để null.
- `manifestHash` trùng thì trả bản ghi đã có (idempotent).

**P1-16b. `prepareRaiseDispute(issueId, manifestId)`**
- Manifest phải do chính người gọi tạo, thuộc issue này, và `side` khớp người gọi. Phase `FUNDED`.
- Gọi `createPreparedCall(method: "raiseDispute", args: { escrowId, evidenceManifestHash })`.

**P1-16c. `prepareSubmitCounterpartyEvidence(issueId, manifestId)`**: cùng các điều kiện bên còn lại ở P1-16a, method `submitCounterpartyEvidence`.

**P1-16d. `draftRuling(issueId, clientBps, rationale, kind: INITIAL | FINAL)`**: chỉ ADMIN.
- `clientBps` từ 0 đến 10000. `rationale` từ 20 đến 10000 ký tự.
- **INITIAL:** phase `DISPUTED`, thời gian chain ≥ `disputeRaisedAt + 72h` và < `disputeRaisedAt + 30 ngày`.
- **FINAL:** phase `CHALLENGED`, thời gian chain < `challengedAt + 30 ngày`.
- `decisionHash = computeDecisionHash({ issueId, escrowId, clientBps, rationale })`. Lưu `RulingDraft` (trùng hash thì trả bản đã có). Ghi `AdminLog` với `action = "draft_ruling"`.
- Calldata: `encodeFunctionData` từ `ESCROW_ABI` cho `postInitialRuling` hoặc `postFinalRuling(escrowId, clientBps, decisionHash)`.
- Trả về `{ draftId, decisionHash, safeTransactionJson }`. `safeTransactionJson` là chuỗi JSON:
  ```json
  {"version":"1.0","chainId":"<CHAIN_ID>","createdAt":<ms>,
   "meta":{"name":"BloodyRoar ruling <issueId>","description":"<kind> clientBps=<n>","txBuilderVersion":"1.16.5","createdFromSafeAddress":"<projection.arbiter>"},
   "transactions":[{"to":"<ESCROW_ADDRESS>","value":"0","data":"<calldata>","contractMethod":null,"contractInputsValues":null}]}
  ```
- Không ký, không tạo intent, không đổi trạng thái nào.

**P1-16e. Các prepare còn lại.** Thời gian lấy bằng `readChainTime`. Hai lệnh finalize ai đăng nhập cũng gọi được (permissionless, giống P0-6).
- `prepareChallengeRuling(issueId)`:
  - Người gọi là một bên. Phase `INITIAL_RULING`. Thời gian chain < `initialRulingAt + 7 ngày`.
  - Client chỉ được challenge khi `clientBps < 10000`. Developer chỉ được khi `clientBps > 0`.
  - `initialRulingAt` và `clientBps` lấy từ `RulingRecord` kind `INITIAL` mới nhất của escrow.
- `prepareFinalizeRuling(issueId)`:
  - `INITIAL_RULING` và thời gian chain ≥ `initialRulingAt + 7 ngày`, hoặc
  - `FINAL_RULING` và thời gian chain ≥ `finalRulingAt + 24h`.
- `prepareFinalizeArbiterTimeoutSplit(issueId)`:
  - `DISPUTED` và thời gian chain ≥ `disputeRaisedAt + 30 ngày`, hoặc
  - `CHALLENGED` và thời gian chain ≥ `challengedAt + 30 ngày`.
- Cập nhật `lib/escrow/availability.ts` để trả các action này đúng mốc thời gian. Thêm test bảng cho mọi phase.

**P1-16f. Effect worker `apps/worker/src/effects/dispute.ts`**, đăng ký trong `effects/index.ts`. Mỗi effect đều có snapshot/undo cho reorg, giống các effect hiện có, và được thêm vào danh sách `reversible` trong `reorg.ts`.
- `DisputeRaised`: upsert `Dispute` theo `issueId`, các trường:
  - `status = OPEN`, `phase = DISPUTED`, `raisedAt` = thời gian block
  - `raisedById` = user có ví `raisedBy`
  - `reason` = `statement.text` của manifest có hash khớp. Không tìm thấy manifest thì ghi `"(bằng chứng nộp ngoài hệ thống)"`.
  - `evidenceManifestHash`, `evidenceResponseDeadline = raisedAt + 72h`, `arbiterTimeoutAt = raisedAt + 30 ngày`
  
  Gán `EvidenceManifest.disputeId` và `onChainEventId`. `Issue.status = DISPUTED`. Thông báo `DISPUTE_RAISED` cho bên còn lại và mọi ADMIN (`dedupeKey = dispute:{escrowIdHash}:raised:{userId}`). Xác nhận intent theo txHash.
- `CounterpartyEvidenceSubmitted`: ghi `counterpartyEvidenceHash`, gắn manifest. Thông báo `EVIDENCE_SUBMITTED` cho bên khởi kiện.
- `InitialRulingPosted`: tạo `RulingRecord` kind `INITIAL`. `Dispute`: `status = PROPOSED`, `phase = INITIAL_RULING`, `proposedClientBps`, `initialDecisionHash`, `proposedAt`, `challengeDeadline` lấy từ event. Thông báo `RULING_POSTED` cho cả hai bên.
- `RulingChallenged`: `Dispute`: `status = CHALLENGED`, `phase = CHALLENGED`, `challengedAt`, `challengedById`, `arbiterTimeoutAt = challengedAt + 30 ngày`. Thông báo `RULING_CHALLENGED` cho cả hai bên và ADMIN.
- `FinalRulingPosted`: tạo `RulingRecord` kind `FINAL`. `Dispute`: `status = FINAL_RULING`, `phase = FINAL_RULING`, `finalClientBps`, `finalDecisionHash`, `finalRulingAt`, `noticeDeadline`. Thông báo `RULING_POSTED`.
- `EscrowResolved` với kind `RULING` hoặc `ARBITER_TIMEOUT_SPLIT`: effect resolved hiện có vẫn chạy. Thêm: `Dispute.status = RESOLVED`, `phase = RESOLVED`, `finalClientBps` (ATS = 5000), `resolvedAt`. Theo quy tắc ở mục 6.2 của spec: gửi `DISPUTE_RESOLVED` thay cho `ESCROW_RESOLVED`.
- `decisionHash` không khớp `RulingDraft` nào: vẫn ghi nhận (chain là sự thật), ghi `log.warn` và tạo `ReconciliationFinding` loại `UNKNOWN_DECISION_HASH`.

**P1-17 (phần còn lại).**
- Xóa BUG-2 tạm nếu còn.
- `analyzeDispute` chỉ để tham khảo (xem AI-11).
- Frontend còn tham chiếu thì sửa ở phase FE. Không chặn phase D.

**AI-11. `analyzeDispute`.**
- Chỉ ADMIN. Không đổi `Dispute.status`.
- `aiStatus = "ANALYZING"` quá 5 phút được coi là `FAILED` và cho chạy lại.
- Kết quả lưu `suggestedClientBps` (Int, 0..10000) và `aiReport`, cùng một bản ghi `AILog` cho mỗi lần chạy.
- `draftRuling` không tự điền giá trị từ AI. Admin tự nhập.

**P1-18. Admin xem evidence.**
- Thêm `getDownloadUrl(key, ttlSeconds)` vào `lib/storage.ts`: có S3 thì trả presigned GET (ttl 120 giây), không có thì trả `/api/uploads?key=...`.
- Query `evidenceFiles(issueId)` (chỉ ADMIN, cần có `Dispute`): trả các manifest cùng file và `downloadUrl`. Ghi `AdminLog` `view_evidence` mỗi lần gọi.
- Route `GET /api/uploads` cũng ghi `AdminLog` khi admin tải file `EVIDENCE`.

**P1-28.** Trong `dispute.module.ts`, bỏ các field `suggestedRatio` và `proposedClientRatio` dạng Float, thay bằng `suggestedClientBps`, `proposedClientBps`, `finalClientBps` dạng Int.
- `aiConfidenceScore` vẫn là Float vì không phải tiền.
- Type `Escrow` cũ trong `escrow.module.ts:85-88`: đổi bốn field tiền sang chuỗi số nguyên raw (`t.string`, resolve bằng `toFixed()`), đặt tên `...Raw`. Nếu không còn resolver nào trả type này thì xóa luôn type.

**N-6.** Theo spec. Làm cùng P1-30a vì cùng file upload.

### Phase G1 — Harness (làm sớm)

- N-8, N-9, N-12, N-13 theo `LOCAL_FULL_FLOW_SPEC.md` mục 4, 5. Node chain khởi động theo Z-2.
- Test E chia theo file: `tests/e2e/e01-auth.test.ts` ... `tests/e2e/e31-flow.test.ts`. Helper chung đặt trong `tests/e2e/harness/` (`gql.ts`, `wallet.ts`, `chain.ts`, `waitFor.ts`).
- `waitFor(cond, 60_000)` kiểm mỗi 250 ms. Không dùng `sleep` cố định.
- Kịch bản E15–E17 dùng ví #5 (arbiter) gửi `postInitialRuling`/`postFinalRuling` trực tiếp bằng `eth_sendTransaction`, với `data` lấy từ `safeTransactionJson` của `draftRuling`. Cách này kiểm luôn calldata.
- `scanner-deposit.ts` giữ lại đến khi các E-test tương ứng có trong harness, rồi xóa và ghi vào báo cáo.

### Phase E — Chat, thông báo, admin, AI

**P1-19. Socket.**
- `rateLimit(\`chat:${userId}\`, { limit: 10, windowMs: 10_000 })` cho `message:send`. Vượt ngưỡng thì emit `error` với `{ code: "RATE_LIMITED", retryAfterMs }` và không lưu tin. Mutation sửa tin trong `chat.module.ts` dùng chung key.
- `afterDispute = true` khi issue đã có `Dispute.raisedAt` và thời điểm lưu tin ≥ `raisedAt`.

**P1-20. Ops queries**, chỉ ADMIN, đặt trong `admin.module.ts`.
- `indexerStatus`: từ `ProjectionCheckpoint`, trả `chainId`, `contractAddress`, `lastBlock`, `updatedAt`, `lagSeconds`.
- `reconciliationFindings(status: OPEN mặc định, first, after)`.
- `stuckIntents(first, after)`: `status` thuộc `SUBMITTED` hoặc `PENDING_SAFE_HEAD`, và `submittedAt` cũ hơn 30 phút.
- `contractConfig`: các dòng `ContractConfig`.

**P1-21. Ẩn issue.**
- `adminHideIssue(issueId, reason)` đặt `hiddenAt`. `adminUnhideIssue(issueId)` gỡ ra. Cả hai ghi `AdminLog` (`hide_issue`, `unhide_issue`).
- Issue bị ẩn không xuất hiện trong `issues`, marketplace và tìm kiếm. `issue(id)` trả `NOT_FOUND` cho người không phải client, developer hay admin.
- Ẩn không đụng tới escrow. Issue có escrow vẫn chạy bình thường.

**P1-22. Review và uy tín.**
- Giữ schema hiện tại: **chỉ client đánh giá developer, mỗi issue một lần** (`Review.issueId @unique`). Không thêm chiều developer đánh giá client.
- `submitReview(issueId, rating 1..5, comment ≤ 2000)`:
  - Người gọi là client. `Issue.status = COMPLETED`, có `developerId`. Chấp nhận mọi outcome.
  - `comment` qua `guardMessage`. Trùng thì trả `CONFLICT`.
- `recalcReputation(tx, userId)` đặt ở **`packages/database/src/reputation.ts`** (export từ `@bloody-roar/database`) để web và worker cùng dùng.
  - `reputationScore` = trung bình `rating` các review nhận được, làm tròn 2 chữ số, bằng 0 nếu chưa có review.
  - `completedTaskCount` = số issue có `developerId = userId`, `status = COMPLETED`, `outcome ≠ MISSED_DELIVERY_REFUND`.
- Gọi hàm này trong `submitReview` và trong effect `ESCROW_RESOLVED` (thay `TODO(P1-22)`). Undo khi reorg chỉ cần gọi lại.
- Thêm query `reviews(userId, first, after)`.

**P1-23. HMAC.** Thêm `apps/web/src/ai/hash.ts` với `auditHash(value)` = HMAC-SHA256 hex, khóa là `AI_HASH_KEY`.
- Ngoài production, thiếu khóa thì dùng `"local-dev-ai-hash-key"` và ghi warn một lần.
- Thay ở `ai/model-router.ts:67`, `socket/handlers.ts:280` và `:365`, `chat.module.ts:260`.
- Không đổi hash của session hay refresh token trong `auth/`, vì không thuộc AI-2.

**P1-24. Guard nội dung.**
- Gọi `guardMessage(text, { issueId })` và lưu nội dung đã che (không từ chối) tại: mô tả issue khi tạo và sửa, comment issue, cover letter của application, mô tả submission draft, statement của evidence, comment review.
- Mỗi nơi một test: chuỗi giống private key bị che.

**P1-25. Rate limit AI.**
- `rateLimit(\`ai:${userId}\`, { limit: 10, windowMs: 3_600_000 })` cho mọi mutation gọi model (sinh test case, `analyzeDispute`, các mutation AI khác).
- ADMIN có limit 30. Vượt ngưỡng trả lỗi `RATE_LIMITED`.

**P1-26.** Xóa `GOOGLE_GENERATIVE_AI_API_KEY` khỏi `.env.example` và `apps/web/src`. `check-env` vẫn chặn biến này, giữ nguyên.

**P1-27. Eval dispute.**
- 10 kịch bản JSON trong `apps/web/src/test/eval/dispute/`, gồm: không giao hàng, giao trễ, giao thiếu tiêu chí, client đổi yêu cầu, giao đủ nhưng client từ chối, bằng chứng mâu thuẫn, chat có lời hứa, file hỏng hash, cả hai thiếu bằng chứng, settlement bị thu hồi.
- Mỗi kịch bản có câu trả lời giả cho mock AI và khoảng bps mong đợi.
- Test kiểm pipeline: parse, citation hợp lệ (citation không tồn tại bị loại), bps nằm trong khoảng, `AILog` được ghi. Không gọi mạng.

**P1-29.** Test duyệt mọi giá trị `NotificationType` và kiểm có ít nhất một chuỗi `"<TYPE>"` trong `apps/web/src` hoặc `apps/worker/src`, ngoài thư mục test. Loại nào không có nơi tạo thì xóa khỏi enum bằng migration (D-NOTI-1).

### Phase F — Nền tảng

**P1-30a. Upload hai bước.** Giữ route `/api/uploads`. **Không** tạo `/api/files/[id]` (lệch FIX_LIST, ghi vào DECISIONS).
- `POST /api/uploads` nhận thêm `purpose` (bắt buộc, khác `CHAT`) và `issueId`:
  - Bắt buộc với `DELIVERY` và `EVIDENCE`, người gọi phải là client hoặc developer của issue.
  - Bỏ qua với `ISSUE_IMAGE` và `AVATAR`.
  - Tạo `Attachment` `PENDING` với `fileUrl`, `purpose`, `issueId`, `fileSize`, `fileMime`. Trả thêm `attachmentId`.
- `POST /api/uploads/complete { attachmentId }`:
  - Chỉ uploader được gọi.
  - Đọc bytes đã lưu (file local hoặc S3 `GetObject`), kiểm kích thước bằng `fileSize`, tính sha256 phía server, đặt `status = ATTACHED`.
  - Với `AVATAR`: gán thêm `User.avatar = fileUrl`.
  - Trả `{ attachmentId, sha256 }`.
- `AVATAR` chỉ nhận MIME ảnh, tối đa 5 MB.
- Chat qua socket giữ nguyên luồng hiện có.

**P1-30b. Quyền tải** (`GET /api/uploads`), theo `purpose`:

| purpose | Ai được tải |
|---|---|
| `AVATAR` | Mọi người |
| `ISSUE_IMAGE` | Mọi người, nếu đã gắn vào issue chưa ẩn. Nếu chưa gắn: chỉ uploader |
| `DELIVERY` | Client và developer của issue |
| `EVIDENCE` | Client và developer. ADMIN khi issue có `Dispute` (ghi `AdminLog`) |
| `CHAT` hoặc `null` | Như hiện tại (`canReadIssueChat`) |

Bỏ tham chiếu `isDraft` trong route này.

**P1-31. Webhook GitHub.**
- Chèn `GithubWebhookDelivery` bằng `createMany({ skipDuplicates: true })`. `count = 0` thì trả 200 `{ duplicate: true }` và không xử lý.
- GitHub không gửi header thời gian, nên **bỏ kiểm lệch 5 phút**. Chữ ký HMAC giữ nguyên. Ghi vào DECISIONS.
- PR merged: thêm giá trị enum `PR_MERGED` (migration). Gửi `createNotificationIdempotent` cho client, `dedupeKey = pr-merged:{issueId}:{prNumber}`. Không gọi gì liên quan đến tiền.

**P1-32. Guard cấu hình khi khởi động** (web `server.ts` và worker `start`).
- `ESCROW_ADDRESS` rỗng: production thì thoát với mã 1. Ngoài production thì chạy tiếp, ghi warn, mọi mutation `prepare*` trả `ESCROW_NOT_CONFIGURED`.
- `ESCROW_ADDRESS` có giá trị:
  - `eth_chainId` của RPC phải bằng `CHAIN_ID`.
  - `getCode(ESCROW_ADDRESS)` phải khác `0x`.
  - Nếu có file `apps/contracts/deployments/localhost.json` và `CHAIN_ID = 31337`, địa chỉ phải khớp manifest.
  - Sai điều kiện nào cũng thoát với mã 1, ở mọi môi trường. Đây là E29.

**P1-33.** Đã gộp vào P1-18 (`getDownloadUrl`).

**P1-35. Session và job dọn dẹp.**
- **Không làm refresh token xoay vòng.** JWT cùng dòng `Session` hiện tại đã thu hồi được (ghi vào DECISIONS).
- Thêm `mySessions` (session chưa thu hồi và chưa hết hạn của user, có cờ `current`), `revokeSession(id)` (chỉ session của mình), `revokeOtherSessions`.
- Job worker `cleanup` (chạy mỗi giờ, đăng ký qua `registerJob`):
  - Xóa `Session` đã hết hạn hoặc đã thu hồi quá 7 ngày.
  - Xóa `Attachment` `PENDING` quá 24 giờ. Nếu `UPLOADS_DIR` có giá trị, xóa luôn file local. File trên S3 để lifecycle rule xử lý, ghi vào `docs/DEPLOY.md`.
  - Xóa `GithubWebhookDelivery` quá 30 ngày.

**P1-34, BE-88, BE-89, BE-94:** vẫn ngoài phạm vi (Q4).

### Phase FE — Nối frontend với API mới

Phạm vi: chỉ sửa logic gọi API và nút hành động. Không đổi layout hay palette. Dùng component có sẵn trong `components/ui`.

**FE-1. Ví và chain.**
- Thêm `NEXT_PUBLIC_CHAIN_ID` (mặc định 84532, local 31337). Chọn `ChainConfig` tương ứng trong `lib/web3/client.ts`. Yêu cầu ví đổi chain trước mọi giao dịch.
- Helper `lib/web3/send-prepared.ts`:
  ```
  sendPreparedCall(call) → signer.sendTransaction({ to: call.contractAddress, data: call.data, value: call.value })
  → mutation recordTransactionSubmitted(intentId, txHash)
  ```
  Các bước (`steps`) gửi lần lượt. Chờ mỗi tx có 1 confirmation rồi mới gửi bước sau.

**FE-2. Trạng thái sau giao dịch.** Lắng nghe socket `escrow:invalidate` trong room issue để refetch. Dự phòng: refetch mỗi 4 giây, tối đa 2 phút, rồi hiện "Đang chờ chain xác nhận".

**FE-3. Nút hành động.** Chỉ hiện nút có trong `availableActions` hoặc `viewerCapabilities`. Nút bị tắt thì hiện `reasonDisabled`. Không tự tính quyền ở frontend.

**FE-4. `issue-detail-view.tsx`.**
- Client chọn người bằng `selectDeveloper(applicationId, deliveryDeadline)`. Ô ngày mặc định +7 ngày.
- Client ký funding intent bằng `signer._signTypedData` (typed data lấy đúng như server trả về), gọi `submitFundingIntent`, rồi `prepareEscrowDeposit` và gửi các bước.
- Client có thể `cancelReservation`.
- Developer: `createSubmissionDraft` (mô tả, PR URL, commit SHA, file `DELIVERY` qua upload hai bước), rồi `prepareSubmitWork`.
- Client: `prepareReleaseFunds` hoặc `requestChanges(notes)`.
- Cả hai bên: settlement (propose với ô bps hiển thị %, revoke, accept).
- Tranh chấp: `createEvidenceManifest` với file `EVIDENCE`, rồi `prepareRaiseDispute`. Bên còn lại: nộp evidence, challenge. Ai cũng thấy nút finalize và timeout khi action có hiệu lực.
- Sau `COMPLETED`: client thấy form `submitReview`.
- Xóa toàn bộ chuỗi mutation cũ.

**FE-5. Claim.** Ở dashboard hoặc profile: hiện `myClaimable` của ví, nút `prepareClaim`.

**FE-6. `admin-view.tsx`.**
- Thay `proposeDisputeResolution` bằng form `draftRuling` (kind, bps, rationale). Hiện `safeTransactionJson` với nút copy và nút tải file `.json`.
- Hiện kết quả AI (chỉ tham khảo) và danh sách evidence (`evidenceFiles`).
- Thêm tab vận hành: `indexerStatus`, `reconciliationFindings`, `stuckIntents`.
- Nút ẩn và bỏ ẩn issue.

**FE-7. Upload helper** `lib/upload.ts`: `POST /api/uploads` → PUT bytes → `POST /api/uploads/complete`. Dùng cho delivery, evidence, ảnh issue, avatar.

**FE-8. Test chặn API chết.** Test `apps/web/src/test/fe-operations.test.ts`:
- Tìm mọi chuỗi bắt đầu bằng `` `query `` hoặc `` `mutation `` trong `src/components` và `src/app`.
- Parse bằng `graphql` và `validate` với `schema` của Pothos.
- Phải không có lỗi. Test này chặn trường hợp frontend gọi mutation đã bị xóa.
- Kiểm thủ công bằng ví theo `docs/LOCAL_DEV.md` là việc của người dùng, ghi trong báo cáo.

### Phase H — Standards

Làm S-1 đến S-5 đúng như `FIX_LIST.md` mục 3, chỉ sau khi `test:e2e:local` xanh. S-4: tách `reservation.module.ts` thành `select.module.ts` (selectDeveloper, cancelReservation) và `reservation.module.ts` (query, type).

---

## 4. Ánh xạ kịch bản E

| E | Cần các mục |
|---|---|
| E1–E14, E31 | đã có code, chạy qua harness G1 |
| E15–E17 | P1-16, P1-18, P1-30a |
| E18, E19 | P1-19, P1-23, P1-24 |
| E20 | đã có |
| E21 | P1-20, P1-21 |
| E22–E24 | đã có, chuyển vào harness |
| E25 | P1-30 |
| E26 | P1-31 |
| E27 | đã có (A1) |
| E28 | `AUTHZ_MATRIX.md` cập nhật thêm mutation mới của phase D, E, F |
| E29 | P1-32 |
| E30 | đã có |

Thêm vào E21: `submitReview` và `recalcReputation` (đánh giá trước khi `COMPLETED` bị từ chối, điểm tính đúng).

---

## 5. Gate

Chạy cùng một lần, với `TEST_DATABASE_URL` trỏ `bloody_codex_test`:

```bash
bun run typecheck && bun run lint \
  && bun run --cwd apps/web test \
  && bun run --cwd apps/worker test \
  && bun run --cwd packages/database test \
  && bun run contracts:test \
  && bun run test:e2e:local
```

Lint chỉ được giữ 4 cảnh báo `any` có sẵn, không thêm cảnh báo mới.

---

## 6. Định nghĩa xong

1. Gate ở mục 5 xanh.
2. Mọi mục trong file này có dòng trong `LOCAL_TEST_MATRIX.md`, kèm file test, lệnh và commit.
3. `grep` trong `apps/web/src` không còn: `proposeDisputeResolution`, `challengeDisputeResolution`, `assignDeveloper`, `reviewSubmission`, `depositToEscrow`, `GOOGLE_GENERATIVE_AI_API_KEY`, `t.float(` (trong module tiền), `createHash("sha256")` trong `ai/` và `socket/`.
4. `CODEX.md` có bảng trạng thái mới ở đầu, danh sách "Bị chặn", và kết quả gate.
5. `docs/LOCAL_DEV.md` hướng dẫn người dùng chạy tay đủ luồng bằng MetaMask trên Hardhat (import private key tài khoản test #1–#4 là việc của người dùng, không ghi key vào repo).

## 7. Việc người dùng tự làm (AI không làm)

- Xóa worktree cũ: `git worktree remove /Users/admin/repos/capstone1-wt/a4-int` và `.worktrees/backend-fixes`.
- Kiểm thử thủ công bằng ví thật trên giao diện.
- Deploy, GitGuardian, mở PR (Q3, Q7, Q9).
