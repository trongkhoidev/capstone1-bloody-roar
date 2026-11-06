# Phân chia backend cho 5 agent chạy song song

**Ngày lập:** 27/10/2026
**Nguồn:** [`BACKEND_STATUS_2026-10-27.md`](../BACKEND_STATUS_2026-10-27.md) (trạng thái thật), [`BACKEND_REMAINING_TASKS.md`](../BACKEND_REMAINING_TASKS.md) (chi tiết từng ID), [`BACKEND_EXECUTION_PLAN.md`](../BACKEND_EXECUTION_PLAN.md) (quyết định QĐ-01..32).

Mỗi plan gồm danh sách task, file được sửa, thứ tự làm và tiêu chí nghiệm thu. Đọc file này trước, rồi đọc plan của agent mình.

---

## 1. Nguyên tắc

1. **Mỗi file có đúng một chủ.** Chủ được sửa file. Người khác chỉ sửa theo mục 4.
2. **Mỗi ID chỉ có một chủ.** Nếu một ID có nhiều phần, plan ghi rõ phần nào thuộc agent nào.
3. **Schema Prisma chỉ do A3 sửa.** Agent khác cần cột mới thì ghi vào `SCHEMA_REQUESTS.md` (mục 7).
4. **Dependency chỉ được thêm bởi người được ghi tên:** A2 (`viem`, `canonicalize`), A3 (`pg`, `@types/pg`), A5 (`@scure/bip39`). Agent khác không thêm dependency. Cần thì dừng và báo lại.
5. **Frontend nằm ngoài phạm vi.** Không agent nào sửa `components/` hay trang UI. Thay đổi GraphQL có thể làm vỡ FE, chấp nhận được vì FE làm sau. Ghi danh sách operation bị đổi vào báo cáo.

---

## 2. Thiết lập (người điều phối chạy một lần)

Chạy từ thư mục gốc repo `/Users/admin/repos/capstone1`:

```bash
git branch be/base feat/claude-ui-redesign
git branch be/integration be/base

mkdir -p /Users/admin/repos/capstone1-wt
git worktree add /Users/admin/repos/capstone1-wt/a1 -b be/a1-platform be/base
git worktree add /Users/admin/repos/capstone1-wt/a2 -b be/a2-core be/base
git worktree add /Users/admin/repos/capstone1-wt/a3 -b be/a3-indexer be/base
git worktree add /Users/admin/repos/capstone1-wt/a4 -b be/a4-escrow-flow be/base
git worktree add /Users/admin/repos/capstone1-wt/a5 -b be/a5-dispute-chat-ai be/base

for d in /Users/admin/repos/capstone1-wt/a*; do
  cp .env "$d/.env"
  cp packages/database/.env "$d/packages/database/.env"
  (cd "$d" && bun install)
done
```

Sau đó, trong `.env` của từng worktree, đổi `DATABASE_URL` sang database riêng: `bloody_a1`, `bloody_a2`, ... Không ai migrate hay reset database của người khác. Nếu máy có Docker, `docker-compose.yml` có sẵn service Postgres 16.

**Không** chạy `bun run dev` trên port 4000 trong worktree. Nếu cần chạy server, dùng `PORT=4101` (mỗi agent một port riêng).

---

## 3. Phân quyền

| Agent | Chủ đề | Branch | Worktree | Ước lượng (ngày công) |
| --- | --- | --- | --- | --- |
| **A1** | Nền tảng, bảo mật, upload, CI, deploy, tài liệu vận hành | `be/a1-platform` | `capstone1-wt/a1` | ~9 (+ ~4 P2) |
| **A2** | Lõi escrow thuần: hashing, EIP-712, calldata, fold, so khớp chain, tiền (packages/shared) | `be/a2-core` | `capstone1-wt/a2` | ~9 |
| **A3** | Schema Prisma, indexer, worker runtime, reconciler, E2E cuối | `be/a3-indexer` | `capstone1-wt/a3` | ~12 |
| **A4** | Luồng escrow qua GraphQL: chọn người, cọc, giao hàng, release, claim, settlement, issue/application, thống kê | `be/a4-escrow-flow` | `capstone1-wt/a4` | ~12 |
| **A5** | Tranh chấp on-chain, chat, thông báo, admin, review, AI | `be/a5-dispute-chat-ai` | `capstone1-wt/a5` | ~11 (+ ~3 P2) |

Các con số là ước lượng thô, dùng để cân khối lượng.

---

## 4. Điểm mở: file dùng chung

Các file này có chủ, nhưng agent khác được sửa đúng phần quy định.

| File | Chủ | Ai được sửa thêm | Quy định |
| --- | --- | --- | --- |
| `apps/web/server.ts` | A1 | A3 | A3 thêm đúng một dòng `startEscrowBridge(io)` sau khi tạo `io`. |
| `packages/database/src/index.ts` | A3 | A5 | A5 thêm đúng một dòng `export * from "./notifications";`. |
| `apps/web/src/graphql/schema.ts` | A4 | A5 | A5 thêm đúng một dòng import cho `review.module.ts` và `admin.module.ts` nếu mới. |
| `apps/web/src/graphql/modules/{issue,application,submission}/**` | A4 | A5 | Chỉ sau khi A4 merge: A5 thêm đúng một lệnh gọi `guardMessage` vào mutation tạo nội dung (AI-5). Không làm việc khác trong các file này. |
| `apps/worker/src/jobs/index.ts` | A3 | A1, A4, A5 | Mỗi agent thêm đúng một dòng import file job của mình. |
| `apps/worker/src/effects/index.ts` | A4 | A3, A5 | A3 thêm nhánh `config`. A5 thêm nhánh `dispute`. |
| `package.json` (root) | A1 | A3 | A3 chỉ thêm script `worker:*`. |
| `.env.example` | A1 | A3, A5 | Mỗi agent thêm đúng các biến của mình, ghi chú bên cạnh. |
| `apps/web/src/graphql/generated/pothos-types.ts` | sinh tự động | — | Không sửa tay. Chạy `bun run db:generate` sau khi schema hoặc schema GraphQL đổi. |
| `bun.lock` | sinh tự động | — | Khi xung đột: xóa phần conflict, chạy `bun install`, commit kết quả. |

---

## 5. Hợp đồng dữ liệu (A3 làm, cả nhóm dùng)

Tên model và enum dưới đây là **cố định**. Các agent viết code theo tên này, dù schema chưa merge.

**Model mới** (xem chi tiết field trong `BACKEND_REMAINING_TASKS.md` mục B1):
`FundingReservation`, `TransactionIntent`, `ChainEvent`, `ProjectionCheckpoint`, `EscrowProjection`, `RulingRecord`, `SettlementProposal`, `ClaimableBalance`, `ContractConfig`, `EvidenceManifest`, `ReconciliationFinding`, `GithubWebhookDelivery`.

**Sửa model cũ:**
- `Issue`: thêm `deliveryDeadline DateTime?`, `termsVersion Int @default(1)`, `termsHash String?`, `outcome EscrowResolutionKind?`. Enum `IssueStatus` thêm `AWAITING_FUNDING`.
- `Submission`: thêm `deliveryHash String?`, `manifest Json?`, `supersededAt DateTime?`, `onChainEventId String?`, `changesRequested Boolean @default(false)`. Enum `SubmissionStatus` đổi thành `DRAFT`, `PENDING_CHAIN`, `SUBMITTED`, `SUPERSEDED`. Migration map dữ liệu cũ: `SUBMITTED`/`UNDER_REVIEW`/`APPROVED` → `SUBMITTED`, `REJECTED` → `SUBMITTED` với `changesRequested = true`.
- `Attachment`: thêm `purpose AttachmentPurpose?` (`CHAT`, `ISSUE_IMAGE`, `DELIVERY`, `EVIDENCE`, `AVATAR`), `sha256 String?`, `status AttachmentStatus @default(PENDING)` (`PENDING`, `ATTACHED`).
- `Dispute`: thêm `phase EscrowPhase?`, `suggestedClientBps Int?`, `proposedClientBps Int?`, `finalClientBps Int?`, `aiStatus String?`. Giữ các cột Decimal cũ cho đến migration dọn dẹp cuối.
- `Notification`: thêm `dedupeKey String? @unique`. Enum `NotificationType` thêm các giá trị trong BE-61.
- `Message`: thêm `afterDispute Boolean @default(false)`.
- `datasource db`: thêm `directUrl = env("DIRECT_URL")` (BE-90).

**Giữ tạm, xóa ở migration cuối (BE-41-final):** `Escrow`, `Transaction`, `EscrowStatus`, `TransactionType`, `TransactionStatus`, các cột Decimal cũ của `Dispute`. Chỉ xóa sau khi A4 và A5 đã merge và không còn code nào dùng.

**Enum giữ nguyên:** `EscrowPhase` (`NONE`, `FUNDED`, `DISPUTED`, `INITIAL_RULING`, `CHALLENGED`, `FINAL_RULING`, `RESOLVED`), `EscrowResolutionKind` (`NONE`, `RELEASE`, `MISSED_DELIVERY_REFUND`, `REVIEW_TIMEOUT`, `SETTLEMENT`, `RULING`, `ARBITER_TIMEOUT_SPLIT`). Thêm `ReservationStatus` (`AWAITING_FUNDING`, `FUNDED`, `EXPIRED`, `CANCELLED`, `MISMATCHED`) và `IntentStatus` (`AWAITING_SIGNATURE`, `SUBMITTED`, `PENDING_SAFE_HEAD`, `CONFIRMED`, `FAILED`, `EXPIRED`, `DROPPED`).

---

## 6. Hợp đồng code (interface cố định)

Ký hiệu: **chủ** là agent viết, **dùng** là agent gọi. Chữ ký dưới đây là mốc. Chủ được thêm tham số tùy chọn, không được đổi tên hay thứ tự tham số bắt buộc.

### 6.1 `@bloody-roar/shared/escrow` (A2 viết, mọi agent dùng)

```ts
// types.ts
export type PreparedCall = {
  intentId: string;
  chainId: number;
  to: `0x${string}`;
  method: string;
  args: Record<string, string>; // số dạng chuỗi thập phân
  data: `0x${string}`;
  value: "0";
  expiresAt: string; // ISO
};

// fold.ts — hàm thuần, không I/O
export function foldEscrowEvent(
  state: EscrowState | null,
  event: DecodedEscrowEvent,
  meta: EventMeta, // { chainId, contractAddress, blockNumber, blockHash, txHash, txIndex, logIndex, blockTimestamp }
): FoldResult;
export type FoldResult = { state: EscrowState; effects: FoldEffect[] };
```

`FoldEffect` là union có trường `kind`:
`FUNDED`, `WORK_SUBMITTED`, `SETTLEMENT_PROPOSED`, `SETTLEMENT_REVOKED`, `DISPUTE_RAISED`, `COUNTERPARTY_EVIDENCE_SUBMITTED`, `INITIAL_RULING_POSTED`, `RULING_CHALLENGED`, `FINAL_RULING_POSTED`, `ESCROW_RESOLVED`, `CLAIMED`, `GOVERNANCE_CHANGED`, `PAUSE_CHANGED`. Mỗi effect mang đủ dữ liệu từ event (số tiền lấy từ event `EscrowResolved`, không tự tính).

Các hàm khác:

```ts
// events.ts
export function decodeEscrowLog(log: RawLog, decoderVersion: number): DecodedEscrowEvent;

// hashing.ts
export function canonicalJson(value: unknown): string;          // RFC 8785
export function keccakUtf8(text: string): `0x${string}`;
export function computeTermsHash(input: TermsInput): `0x${string}`;
export function computeDeliveryHash(manifest: DeliveryManifest): `0x${string}`;
export function computeEvidenceManifestHash(manifest: EvidenceManifest): `0x${string}`;
export function computeDecisionHash(doc: DecisionDocument): `0x${string}`;

// eip712.ts
export function fundingIntentTypedData(input: FundingIntentInput): TypedData;
export function recoverFundingIntentSigner(input: FundingIntentInput, signature: `0x${string}`): `0x${string}`;

// calldata.ts
export function encodeEscrowCall(method: EscrowMethod, args: Record<string, string>): `0x${string}`;
export function encodeErc20Approve(spender: `0x${string}`, amountRaw: string): `0x${string}`;

// reservation-check.ts
export function checkDepositAgainstReservation(deposit: DepositFact, reservation: ReservationFacts): string[]; // [] = khớp

// compare.ts
export function compareProjectionWithChain(projection: EscrowState, onchain: OnchainEscrowView): ReconciliationDiff[];
export function accountedBalance(states: EscrowState[], claimables: ClaimableRow[]): bigint;

// constants.ts
export const ESCROW_CONSTANTS: { REVIEW_DAYS: 7; EVIDENCE_HOURS: 72; CHALLENGE_DAYS: 7; FINAL_NOTICE_HOURS: 24; ARBITER_STALL_DAYS: 30; FEE_BPS: 250; MAX_DELIVERY_DAYS: 180; RESERVATION_HOURS: 24; INTENT_MINUTES: 30 };
```

`@bloody-roar/shared/money`:

```ts
export function parseTokenAmount(text: string, decimals: number): bigint;   // "1250.00", 6 -> 1250000000n; sai định dạng thì throw
export function formatTokenAmount(raw: bigint, decimals: number): string;   // đầy đủ độ chính xác, bỏ số 0 thừa
export function bpsOf(amount: bigint, bps: number): bigint;                 // làm tròn xuống
export function splitPayout(principal: bigint, feeBps: number): { developer: bigint; fee: bigint; client: bigint };
```

### 6.2 `@bloody-roar/database` (A3 và A5)

```ts
// packages/database/src/notifications.ts (A5 viết)
export async function createNotificationIdempotent(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    dedupeKey: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
    actorId?: string;
    data?: Record<string, string>;
  },
): Promise<Notification | null>; // null nếu dedupeKey đã tồn tại
```

Dùng bởi: A1 (BE-70), A3 (BE-47, BE-41a notify), A4 (effects, BE-62), A5.

### 6.3 Worker (A3 viết, A4 và A5 đăng ký)

```ts
// apps/worker/src/runtime/scheduler.ts
export function registerJob(job: { name: string; everyMs: number; run: (ctx: JobContext) => Promise<void> }): void;
export type JobContext = { db: PrismaClient; publicClient: PublicClient; logger: Logger; now: () => Date };

// apps/worker/src/effects/index.ts (A4 viết)
export async function applyFoldEffects(
  tx: Prisma.TransactionClient,
  effects: FoldEffect[],
  meta: EventMeta & { chainEventId: string; escrowIdHash: `0x${string}` },
): Promise<void>;
```

### 6.4 Web (mỗi agent viết phần của mình)

```ts
// A3: apps/web/src/lib/realtime/escrow-bridge.ts
export function startEscrowBridge(io: Server): void;
// LISTEN projection_changed  -> io.to(`task:${issueId}`).emit("escrow:invalidate", { escrowId, projectionVersion })
// LISTEN notification_created -> io.to(`user:${userId}`).emit("notification:new", { id })

// A4: apps/web/src/lib/escrow/prepare.ts
export async function createPreparedCall(
  db: PrismaClient,
  input: {
    userId: string;
    method: EscrowMethod;
    args: Record<string, string>;
    issueId?: string;
    escrowKey?: string;
    expiresInMinutes?: number; // mặc định 30
  },
): Promise<PreparedCall>; // ghi TransactionIntent AWAITING_SIGNATURE rồi trả về

// A1: apps/web/src/lib/rate-limit.ts
export function rateLimit(key: string, opts: { limit: number; windowMs: number }): { ok: boolean; retryAfterMs: number };

// A1: apps/web/src/lib/config/env.ts
export const env: AppEnv; // zod, fail-fast ở production; có AI_HASH_KEY

// A1: apps/web/src/lib/storage.ts
export async function getSignedUrl(key: string, ttlSeconds: number): Promise<string>;

// A5: apps/web/src/lib/reputation.ts
export async function recalcReputation(tx: Prisma.TransactionClient, userId: string): Promise<void>; // A4 gọi sau EscrowResolved
```

Giữ nguyên tên hiện có: `guardMessage(content, { issueId })` trong `apps/web/src/ai/guard/service.ts`, `createNotification` trong `apps/web/src/lib/services/notifications.ts` (A5 vẫn giữ, chỉ tách phần DB).

---

## 7. Yêu cầu schema

Agent khác cần cột hoặc model ngoài mục 5 thì ghi vào `docs/plan/parallel/SCHEMA_REQUESTS.md` (agent tự tạo file này trong branch của mình, một dòng cho mỗi yêu cầu, có tên agent và lý do). A3 đọc file đó khi merge và gom vào một migration. Không ai tự sửa `schema.prisma`.

---

## 8. Quy tắc làm việc (áp dụng cho cả 5 agent)

1. Đọc plan của mình trước. Đọc file khác chỉ khi plan trỏ tới.
2. Làm theo thứ tự trong plan. Không đánh dấu task xong khi chưa chạy lệnh kiểm tương ứng.
3. Lệnh kiểm chung:
   - `bun run typecheck`
   - `bun run lint`
   - `bun run --cwd apps/web test`
   - `bun run --cwd apps/worker test` (nếu có đụng worker)
   - `bun run contracts:test` (nếu có đụng contract)
4. **Không** in giá trị trong `.env`. Không commit secret.
5. Commit theo nhóm việc nhỏ, message dạng `feat(be-41a): ...` hoặc `fix(bug-4): ...`. Mỗi commit kết thúc bằng dòng:
   `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`
6. Không push. Không merge vào `be/integration`. Người điều phối làm việc đó.
7. Cần thứ của agent khác: làm phần không phụ thuộc trước. Khi người điều phối báo đã merge, chạy `git merge be/integration` trong worktree của mình. Xung đột ở file của mình thì giữ bản của mình. Xung đột ở file khác thì giữ bản integration.
8. Sau khi merge có schema mới: `bun run --cwd packages/database db:generate`. Sau khi lockfile đổi: `bun install`.
9. Nếu bị chặn bởi việc của người khác, không tự viết thay phần đó. Ghi vào mục "Bị chặn" trong báo cáo.
10. Báo cáo cuối nộp vào `docs/plan/parallel/reports/<A1..A5>.md`, theo mẫu:

```markdown
# Báo cáo A? — <tên>
- Branch và commit cuối:
- Task đã xong (ID + bằng chứng: lệnh và kết quả):
- Task dở (ID + còn thiếu gì):
- Task chưa làm (ID + lý do):
- File ngoài quyền sở hữu đã sửa (theo mục 4):
- Dependency mới đã thêm (tên + version + ngày phát hành):
- Thay đổi GraphQL làm vỡ FE (tên operation):
- Yêu cầu schema (đã ghi vào SCHEMA_REQUESTS.md chưa):
- Bị chặn bởi:
- Kết quả typecheck / lint / test:
```

---

## 9. Thứ tự merge và mốc đồng bộ

**Mốc 1 (đầu ngày 1):** các phần sau phải được đẩy lên branch và người điều phối merge vào `be/integration` trước khi agent khác cần:
- A3: schema và migration (`BE-41`, `BE-75`, các sửa đổi mục 5).
- A2: skeleton `types.ts`, chữ ký `fold.ts`, `hashing.ts`, `money.ts`.
- A1: `lib/rate-limit.ts`, `lib/config/env.ts`.
- A5: `packages/database/src/notifications.ts`.
- A4: `lib/escrow/prepare.ts`, skeleton `effects/index.ts`.

**Mốc 2:** worker runtime (A3), fold đầy đủ (A2), `getSignedUrl` (A1).

**Mốc 3:** mọi nhánh tính năng xong.

**Thứ tự merge vào `be/integration`:** A2 → A3 → A1 → A5 → A4. A3 chạy E2E (BE-83) trên `be/integration` sau khi A4 và A5 merge. Sau đó A3 làm migration dọn dẹp (BE-41-final).

---

## 10. Rủi ro

| Rủi ro | Cách giảm |
| --- | --- |
| Tên field lệch giữa schema và code | Mục 5 và 6 là nguồn duy nhất. Lệch thì sửa theo mục 5, không tự đặt tên mới. |
| Hai agent sửa cùng file ngoài quyền | Mục 4 liệt kê rõ. Ngoài danh sách thì không sửa. |
| Lockfile xung đột | Mục 4: xóa phần conflict, `bun install`. |
| Haiku làm sai logic tiền (fold, hash, phí) | A2 có test bảng cho từng event. A3 và A4 không được merge khi test fold đỏ. Người điều phối review PR của A2, A3, A4 trước khi merge. |
| Thay đổi GraphQL làm vỡ FE | Chấp nhận, ghi trong báo cáo. FE làm sau. |
| Chờ phụ thuộc làm chậm | Mốc 1 đẩy sớm. Agent luôn làm phần không phụ thuộc trước. |
