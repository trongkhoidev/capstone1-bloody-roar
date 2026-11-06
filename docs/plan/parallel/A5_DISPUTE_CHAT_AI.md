# A5 — Tranh chấp on-chain, chat, thông báo, admin, review, AI

**Đọc trước:** [`README.md`](README.md) (đặc biệt mục 6.2 và 6.4).
**Branch:** `be/a5-dispute-chat-ai` · **Worktree:** `/Users/admin/repos/capstone1-wt/a5`
**Ước lượng:** ~11 ngày công, cộng ~3 ngày cho các mục AI P2.

---

## 1. Phạm vi

**Được sửa:**
- `apps/web/src/graphql/modules/dispute/**`
- `apps/web/src/graphql/modules/chat/**`
- `apps/web/src/graphql/modules/notification/**`
- `apps/web/src/graphql/modules/admin/**`
- `apps/web/src/graphql/modules/ai/**`
- `apps/web/src/graphql/modules/review/**` (mới)
- `apps/web/src/ai/**` (guard, model-router, prompts)
- `apps/web/src/socket/**` (gồm `handlers.ts`)
- `apps/web/src/lib/chat-access.ts`, `apps/web/src/lib/services/notifications.ts`, `apps/web/src/lib/reputation.ts` (mới), `apps/web/src/lib/notifications/templates.ts` (mới)
- `packages/database/src/notifications.ts` (mới) và một dòng export trong `packages/database/src/index.ts`
- `apps/worker/src/effects/dispute.ts` (mới) và một dòng trong `effects/index.ts`
- Test: `apps/web/src/test/{ai-guard,chat-access,model-router}.test.ts`, và test mới cho dispute, chat, notification, admin

**Dependency được phép thêm:** `@scure/bip39` (cho BE: seed phrase, AI-4). Ghi phiên bản đã phát hành ít nhất 2 tuần. Không thêm gì khác.

**Không sửa:** `schema.prisma` (A3), `lib/escrow/**` (A4), `graphql/modules/issue`, `application`, `submission`, `escrow`, `analytics` (A4), `user` và `auth` (A1), `server.ts` (A1), `packages/shared` (A2).

**Phụ thuộc:**
- A2 (mốc 1): `computeEvidenceManifestHash`, `computeDecisionHash`, `ESCROW_CONSTANTS`. A2 mốc 2: fold.
- A3 (mốc 1): schema, gồm `Dispute` mới, `EvidenceManifest`, `Message.afterDispute`, `Notification.dedupeKey`. A3 mốc 2: `registerJob` (chỉ dùng nếu cần).
- A4 (mốc 1): `createPreparedCall` trong `lib/escrow/prepare.ts`.
- A1 (mốc 1): `rateLimit`, `env` (có `AI_HASH_KEY`). A1 (mốc 2): `getSignedUrl`.

**Đầu ra:**
- `packages/database/src/notifications.ts` (mốc 1, làm đầu tiên): A1, A3, A4 dùng.
- `lib/reputation.ts` (sau BE-12): A4 gọi trong effect `ESCROW_RESOLVED`.
- `apps/worker/src/effects/dispute.ts`: đăng ký vào `applyFoldEffects`.

---

## 2. Thứ tự làm

**Nhóm 0 (mốc 1):**
1. `packages/database/src/notifications.ts`: `createNotificationIdempotent` (README mục 6.2). Thêm export. Đẩy và báo mốc 1.
2. BUG-12 và BE-59: session và rate limit cho socket. Lưu ý phần `maxHttpBufferSize` ở `server.ts` là của A1.

**Nhóm A (chat và thông báo):** BE-59a, BE-63, BE-61 (templates), BE-21 (phần notification, P2), BE-59c và BE-59d (P2).

**Nhóm B (admin):** BE-64, BE-65, BE-66a (P2), BE-13 (P2).

**Nhóm C (review):** BE-12.

**Nhóm D (tranh chấp on-chain):** BE-52, BE-53, BE-54, BE-55, BE-56, BE-58, BE-57, BUG-2 (chỉ nếu BE-57 chưa xong), BUG-4 phần dispute.

**Nhóm E (AI, P1 trước):** AI-1, AI-2, AI-3, AI-5, AI-6, AI-7, AI-9, AI-11, AI-12. P2: AI-4, AI-10, AI-13, AI-14, AI-15, AI-16. Không làm: AI-17, AI-18.

**Nhóm F:** BE-81 (phần dispute, chat, notification, admin).

---

## 3. Task

### Nhóm 0

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **Notifications helper** | `packages/database/src/notifications.ts`: `createNotificationIdempotent` (README mục 6.2). Trả `null` nếu `dedupeKey` đã có (bắt lỗi unique). | Test: gọi hai lần cùng `dedupeKey` → một bản ghi. |
| **BUG-12** | Socket: kiểm session còn hiệu lực khi nhận `message:send`. Session hết hạn hoặc bị thu hồi thì ngắt kết nối. Dùng helper đọc session của `lib/auth` (A1, chỉ đọc). | Test: session bị xóa → lần gửi tiếp theo bị từ chối. |
| **BE-59** (socket) | Rate limit 10 tin / 10 giây / user, dùng `rateLimit` của A1. | Test: tin thứ 11 bị từ chối. |

### Nhóm A: chat và thông báo

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-59a** | `lib/chat-access.ts`: viết được khi `AWAITING_FUNDING`, `IN_PROGRESS`, `DISPUTED`. Chỉ đọc khi `COMPLETED` hoặc `CANCELLED`. Admin chỉ đọc, và chỉ khi `DISPUTED`. Tin gửi sau `disputeRaisedAt` gắn `afterDispute = true`. | `chat-access.test.ts` mở rộng: mỗi phase × mỗi vai trò. |
| **BE-63** | Chat dùng `createNotification` (đã có trong `services/notifications.ts`) cho tin mới. | Test. |
| **BE-61** (templates) | `lib/notifications/templates.ts`: tiêu đề và nội dung tiếng Việt cho mỗi `NotificationType`, kèm `link`. | Test: mỗi giá trị enum có template. |
| **BE-21** (P2, notifications) | Cursor pagination cho `notifications`. | Test. |
| **BE-59c** (P2) | Sửa và xóa mềm tin nhắn (`editedAt`, `deletedAt`). | Test. |
| **BE-59d** (P2) | Unread count theo room. | Test. |

### Nhóm B: admin

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-64** | `adminLogs(after)`, `adminIssues(filter)`, `adminHideIssue(issueId, reason)`. Mọi thao tác ghi `AdminLog`. | Test. |
| **BE-65** | `indexerStatus` (checkpoint, lag), `reconciliationFindings`, `stuckIntents`, `contractConfig`. Đọc các bảng của A3. | Test: query trả đúng dữ liệu đã seed. |
| **BE-66a** (P2) | `setUserRole(userId, role)`: chỉ ADMIN, không tự hạ quyền, ghi `AdminLog`. | Test. |
| **BE-13** (P2) | Ban user: issue `OPEN` của họ bị hủy, application `PENDING` bị từ chối. | Test. |
| **BE-21** (P2, admin) | Cursor cho `adminDisputes`, `adminUsers`. | Test. |

### Nhóm C: review

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-12** | Module `review/`: `submitReview(issueId, rating 1..5, comment)`. Chỉ sau khi issue `COMPLETED` với `outcome` là `RELEASE`, `REVIEW_TIMEOUT` hoặc `SETTLEMENT`. Mỗi bên một lần. `lib/reputation.ts`: `recalcReputation(tx, userId)` cập nhật `reputationScore` và `completedTaskCount`. A4 gọi hàm này trong effect. | Test: review trước khi terminal bị từ chối. Điểm được tính lại đúng. |

### Nhóm D: tranh chấp on-chain (UC-05)

Dispute cũ dựa trên luồng off-chain. Nhóm này thay thế nó. Thứ tự quan trọng: làm BE-52..56 trước, rồi mới BE-57.

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-52** | `createEvidenceManifest(issueId, side, statement, attachmentIds, chatRange?)`: manifest theo QĐ-26, hash bằng `computeEvidenceManifestHash` (A2). Mỗi file phải là Attachment `EVIDENCE` đã `ATTACHED`, và `sha256` lấy từ Attachment. Lưu `EvidenceManifest`. | Test: file có `sha256` khác với hash đã tính → từ chối. |
| **BE-53** | `prepareRaiseDispute(issueId, manifestId)`: party, phase `FUNDED`. `prepareSubmitCounterpartyEvidence(manifestId)`: bên kia, phase `DISPUTED`, trước `raisedAt + 72h`, chỉ một lần. Dùng `createPreparedCall` (A4). | Test từng pre-check. |
| **BE-54** | `draftRuling(issueId, clientBps, rationale, kind)`: chỉ ADMIN. `clientBps` là số nguyên 0..10000. Lưu bản quyết định, tính `decisionHash` (A2). Trả JSON cho Safe Transaction Builder: `{version, chainId, createdAt, meta, transactions: [{to, value: "0", data}]}`. **Không ký, không đổi trạng thái.** | Test: JSON parse được, `data` khớp `encodeEscrowCall`. |
| **BE-55** | `prepareChallengeRuling(issueId)`: bên mất principal, phase `INITIAL_RULING`, trước `challengeEndsAt`, chỉ một lần. `prepareFinalizeRuling(issueId)`: `INITIAL_RULING` ≥ 7 ngày hoặc `FINAL_RULING` ≥ 24 giờ. `prepareFinalizeArbiterTimeoutSplit(issueId)`: `DISPUTED` ≥ `raisedAt + 30 ngày`, hoặc `CHALLENGED` ≥ `challengedAt + 30 ngày`. | Test từng nhánh, gồm biên thời gian. |
| **BE-56** | `apps/worker/src/effects/dispute.ts`: effect `DISPUTE_RAISED`, `COUNTERPARTY_EVIDENCE_SUBMITTED`, `INITIAL_RULING_POSTED`, `RULING_CHALLENGED`, `FINAL_RULING_POSTED`, và `ESCROW_RESOLVED` khi `kind` là `RULING` hoặc `ARBITER_TIMEOUT_SPLIT`. Ghi `Dispute`, `RulingRecord`, `EvidenceManifest.onChainEventId`. Gửi thông báo qua `createNotificationIdempotent`. Đăng ký trong `effects/index.ts`. | Test từng effect. |
| **BE-58** | Admin xem evidence qua signed URL (`getSignedUrl` của A1). Mỗi lần xem ghi `AdminLog`. | Test. |
| **BE-57** | Xóa `raiseDispute`, `proposeDisputeResolution`, `challengeDisputeResolution`, và việc chuyển `ANALYZING` trong `analyzeDispute`. Phân tích AI vẫn giữ, chỉ làm cố vấn. | `grep` không còn các mutation này. |
| **BUG-2** | Chặn challenge lần hai tạm thời. **Chỉ làm nếu BE-57 chưa xong.** Nếu BE-57 xong trong cùng ngày thì bỏ qua và ghi vào báo cáo. | Test. |
| **BUG-4** (dispute) | Thay `Float` trong `dispute.module.ts` bằng `TokenAmount` và bps. Làm sau khi A4 merge scalar. | `grep -n "t.float(" dispute.module.ts` không còn kết quả. |

### Nhóm E: AI

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **AI-1** (P1) | Guard quét mọi loại tin. Hiện `handlers.ts` chỉ quét khi `type === "TEXT"`. Đổi thành quét cả `FILE` (tên file và caption). | Test: tin `FILE` có email hoặc private key bị che. |
| **AI-2** (P1) | HMAC với `AI_HASH_KEY` (A1 khai báo) thay SHA-256: `handlers.ts` (`originalHash`) và `ai/model-router.ts` (`inputHash`). Không cần migrate dữ liệu cũ. | Test: cùng input, cùng key → cùng hash. Không có `createHash("sha256")` trong `ai/` và `socket/`. |
| **AI-3** (P1) | Regex `0x` + 64 hex không coi mọi chuỗi là bí mật. Loại trừ theo ngữ cảnh (`tx`, `hash`, `termsHash`, `decisionHash`). | Test: tx hash và bytes32 không bị che. Private key thật vẫn bị che. |
| **AI-5** (P1) | Guard áp cho comment, mô tả issue, mô tả submission, lý do dispute, cover letter. **A5 không sửa các file đó.** A5 xuất `guardMessage` (đã có). Khi A4 merge, A5 thêm lệnh gọi ở các mutation đó bằng PR nhỏ. | Test từng nơi. |
| **AI-6** (P1) | Pass LLM của guard chỉ chạy khi `AI_EXTERNAL_GUARD=true`. Mặc định chỉ dùng regex nội bộ. | Test: mặc định không gọi provider. |
| **AI-7** (P1) | Tổng timeout của pass LLM ≤ 2,5 giây. Không thử tuần tự ba provider. Một provider, fallback chỉ khi lỗi nhanh. | Test với provider giả chậm. |
| **AI-9** (P1) | Mutation `createTestCase`, `deleteTestCase`. Tiêu chí đã approve là đầu vào của `termsHash` (A4 đọc). | Test. |
| **AI-11** (P1) | Dispute AI: phân tách input khỏi prompt, validate output theo schema, không prefill form, lưu lịch sử bản phân tích (`AILog`), tỉ lệ dùng bps, `aiStatus` có timeout (không kẹt), participant không đọc được `aiReport` (query field bị giới hạn). | Test từng mục. |
| **AI-12** (P1) | Rate limit AI theo user (`rateLimit` của A1). `costUsd` tính từ số token và bảng giá. | Test. |
| **AI-4** (P2) | Seed phrase: wordlist BIP-39 và kiểm checksum (`@scure/bip39`). | Test với seed mẫu hợp lệ và không hợp lệ. |
| **AI-10** (P2) | Sinh test case dùng `githubRepo` làm context. | Test. |
| **AI-13** (P2) | Query `aiLogs` cho admin. | Test. |
| **AI-14** (P2) | Prompt: chọn một, load từ `ai/prompts/*.md` hoặc xóa các file `.md`. Ghi lựa chọn vào báo cáo. | Không còn file prompt chết. |
| **AI-15** (P2) | Xóa `GOOGLE_GENERATIVE_AI_API_KEY` nếu không dùng. Dòng trong `.env.example` thuộc A1: ghi yêu cầu vào báo cáo để người điều phối chuyển cho A1. | `grep` không còn kết quả trong `apps/web/src`. |
| **AI-16** (P2) | Eval set: ≥ 50 case cho guard (phần xác định), ≥ 10 kịch bản dispute. Chạy trong `apps/web/src/test/eval/`. | Test chạy được. |
| **AI-17** | **Không làm.** Multi-agent debate nằm ngoài MVP (Proposal §5.2). | Ghi trong báo cáo. |
| **AI-18** | **Không làm.** Chấm mức hoàn thành submission nằm ngoài MVP. | Ghi trong báo cáo. |

### Nhóm F: test

| ID | Việc | Nghiệm thu |
| --- | --- | --- |
| **BE-81** (phần A5) | Test resolver cho dispute, chat, notification, admin. Có test race cho `challengeRuling` hai lần song song. | Test pass. |

---

## 4. Lưu ý

- Mọi mutation dispute phải đi qua `createPreparedCall` (A4) hoặc chỉ trả JSON. Không ghi trạng thái dispute từ phía off-chain.
- Trước khi xóa mutation cũ (BE-57), kiểm tra không còn component FE nào gọi. FE làm sau, nên chỉ cần ghi danh sách vào báo cáo.
- `ai/guard` đã có `guardMessage`. Không đổi tên. Các chỗ khác đã gọi hàm này.
- `dispute.module.ts` hiện import các file legacy trong `lib/escrow/` (`confirmation`, `chain`, `integration`). A4 xóa các file đó trong nhóm D. Khi viết lại dispute (BE-57), A5 bỏ hết các import này. Nếu A4 merge trước, A5 sửa import ngay sau khi merge.

---

## 5. Kiểm tra trước khi báo cáo

- `bun run --cwd packages/database db:generate` (sau khi A3 merge)
- `bun run typecheck`, `bun run lint`
- `bun run --cwd apps/web test`

Báo cáo theo mẫu trong `README.md` mục 8, lưu vào `docs/plan/parallel/reports/A5.md`. Ghi phiên bản `@scure/bip39` và danh sách mutation đã xóa.
