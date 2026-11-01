# Kế hoạch hoàn thiện phần logic còn sót (giao cho Antigravity)

Thư mục: `/Users/admin/repos/capstone1-wt/integration`, nhánh `be/integration`. Ngày lập: 2026-10-31.

File này tự đủ. Mọi quyết định đã chốt. Không cần đọc `FINISH_PLAN.md`, `HAIKU_CONTINUE.md`, `HAIKU_FINAL.md`.

---

## 1. Trạng thái hiện tại

- HEAD `97912c7`. Các mục K0–K9 trong `HAIKU_FINAL.md` đã xong và đã commit.
- Lần chạy gate gần nhất: lint, `next build`, web 592/592, worker 72/72, database, contracts 35/35 đều pass. E2E chạy 3 lần liên tiếp, lần nào cũng in `E2E scenarios passed (E1–E32)` và không có `HTTP 429`.
- **Typecheck đang fail** với 6 lỗi, tất cả trong `packages/database/src/seed-realistic.ts`. File này chưa được commit (untracked) và không thuộc kế hoạch nào. `git status` vì thế chưa sạch.
- Review lần cuối tìm ra thêm 4 lỗi logic. Chúng được ghi ở L2–L5.

## 2. Việc cần làm (tóm tắt)

| Mã | Việc | Mức |
|---|---|---|
| L0 | Kiểm mốc và commit tài liệu | – |
| L1 | Biến `seed-realistic.ts` thành seed demo chạy đúng với kiến trúc hiện tại | Chặn gate |
| L2 | `cancelIssue` cho phép hủy bài đã nạp escrow | Cao (sai trạng thái tiền) |
| L3 | Xóa query `escrow` cũ, đọc bảng không còn ai ghi | Trung bình |
| L4 | `ContractConfig` không ai ghi: màn admin luôn trống | Trung bình |
| L5 | `prepareChallengeRuling` để lộ pha cho người ngoài; số ngày viết cứng | Thấp |
| L6 | Gate cuối, cập nhật báo cáo | – |

Không làm: Attestation (EAS), model `Transaction`, xóa bảng `escrows` khỏi schema. Lý do ghi ở mục 6.

---

## 3. Quy tắc làm việc

### 3.1 Biến môi trường cho test

Mỗi lệnh shell là một shell mới, nên phải nạp `.env` **trong cùng lệnh** với lệnh test. Không bao giờ in giá trị trong `.env`.

```bash
cd /Users/admin/repos/capstone1-wt/integration && set -a && . ./.env >/dev/null 2>&1; set +a; export TEST_DATABASE_URL=$(echo "$DATABASE_URL" | sed -E 's#/[^/?]+(\?|$)#/bloody_codex_test\1#'); <lệnh>
```

### 3.2 Gate

```bash
bun run typecheck && bun run lint && NODE_ENV=production bun run --cwd apps/web build && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test && bun run test:e2e:local
```

- Dùng snippet ở 3.1 phía trước. `NODE_ENV=production` chỉ đặt cho lệnh build, vì `.env` có `NODE_ENV=` rỗng (xem `DECISIONS.md`, mục BỔ SUNG K1).
- Lint không được thêm cảnh báo mới. Hiện có 4 cảnh báo `any` cũ.
- `test:e2e:local` tự bật Hardhat (8545), worker (4011), web (4012), AI mock (4019) và Chrome headless cho E32. Mất khoảng 3–6 phút. Ghi output vào file rồi `grep` kết quả, không in toàn bộ log.
- Thành công khi in `E2E scenarios passed (E1–E32)`.

### 3.3 Được phép, không cần hỏi

- Sửa, tạo, xóa file trong worktree này.
- Tạo migration Prisma.
- `migrate reset --force` và truncate **chỉ** trên DB tên kết thúc `_test`.
- `migrate deploy` lên `bloody_codex_test` và `bloody_codex_local`.
- Bật và tắt process trên cổng 8545 và 4010–4019.
- Commit trên `be/integration`.

### 3.4 Cấm

- Ghi, reset, truncate DB có tên không kết thúc bằng `_test`. Ngoại lệ: `migrate deploy` lên `bloody_codex_local`, và chạy seed demo ở L1 lên `bloody_codex_local`.
- Đụng cổng 4000 hoặc process không do mình bật. Chỉ dừng PID có trong `tests/e2e/.run/*.pid`.
- In hoặc commit `.env`, secret, `apps/web/.uploads/`, `apps/contracts/deployments/`, `tests/e2e/.run/`.
- `git push`, tạo PR, `rebase`, `reset --hard`, `commit --amend`, xóa nhánh hoặc worktree.
- Thêm dependency.
- Sửa `apps/contracts/contracts/*.sol`.
- Đổi màu hoặc khung giao diện.
- Gọi dịch vụ thật (S3, AI provider, GitHub).

### 3.5 Vòng làm mỗi mục

1. Đọc đúng các file mục đó nêu. Repo có `.codegraph/`: tra symbol bằng `codegraph explore "<tên>"` trước khi grep.
2. Mục có logic tiền, quyền hoặc trạng thái thì viết test trước.
3. Sửa code theo pattern của file lân cận.
4. Chạy `bun run typecheck && bun run lint` và test của mục.
5. Commit một commit. Message dạng `<loại>(<mã>): <mô tả tiếng Anh ngắn>`, ví dụ `fix(l2): ...`. Không thêm dòng attribution.
6. Cập nhật dòng của mục trong `docs/plan/parallel/LOCAL_TEST_MATRIX.md` và bảng L0–L6 trong `docs/plan/parallel/reports/CODEX.md`, commit chung với mục.
7. Sang mục tiếp theo ngay, không dừng lại báo cáo.

### 3.6 Khi tài liệu chưa nói tới

Chọn theo thứ tự ưu tiên:
1. Chain là nguồn sự thật.
2. Theo pattern code có sẵn gần nhất.
3. Diff nhỏ nhất.
4. Đúng ở trường hợp biên.

Ghi `## BỔ SUNG <mã> — <tên>` vào cuối `docs/plan/parallel/DECISIONS.md`, 1–3 dòng lý do, rồi làm tiếp.

### 3.7 Khi bị kẹt và khi được dừng

- Một mục thử 3 cách khác nhau vẫn fail: ghi vào mục "Bị chặn" của `CODEX.md` (lệnh, lỗi rút gọn, 3 cách đã thử), rồi làm mục khác không phụ thuộc.
- Chỉ dừng khi:
  - đạt mục 5 "Định nghĩa xong", hoặc
  - sắp hết context: commit phần đang làm, ghi dòng đầu `CODEX.md` là `ĐANG DỞ: <mã>. Bước tiếp theo: <việc>`, commit, rồi dừng, hoặc
  - mọi mục còn lại đều đã nằm trong "Bị chặn".

---

## 4. Đặc tả từng mục

### L0. Kiểm mốc

1. `git log -1` là `97912c7` hoặc mới hơn. `git status` chỉ có `?? packages/database/src/seed-realistic.ts` và hai file `docs/plan/parallel/AGY_*.md`.
2. Commit **chỉ** hai file docs: `docs(plan): add antigravity finish plan`. Chưa đụng tới `seed-realistic.ts`.

### L1. Seed demo

**Quyết định:** giữ file và đổi tên thành `packages/database/src/seed-demo.ts`. Hiện file vi phạm kiến trúc ở 4 chỗ, sửa cả 4:

| Vấn đề trong file hiện tại | Vì sao sai | Sửa |
|---|---|---|
| Ghi bảng `escrows` (`prisma.escrow.create/update`, ~dòng 690–760) | Escrow thật nằm on-chain. Off-chain chỉ có `EscrowProjection`, và chỉ worker được ghi. Bảng `escrows` là bảng cũ, không còn code nào ghi. | Xóa toàn bộ phần escrow |
| 3 bài `IN_PROGRESS` (~dòng 406, 432, 458) | `IN_PROGRESS` chỉ do worker đặt sau khi escrow được nạp. Không có projection thì developer không giao việc được, nút trên giao diện báo lỗi. | Đổi thành `OPEN`, `developerId: null`. Application của 3 bài này đổi thành `PENDING`. |
| Token Base Sepolia viết cứng (chainId 84532) | Local chạy Hardhat 31337. Bài dùng token sai chain thì `selectDeveloper` trả `INVALID_TOKEN`. | Đọc token có sẵn (xem bên dưới), bỏ USDT và DAI |
| `EscrowStatus.RELEASED`, `PRState.merged` | Không tồn tại trong enum, đây là 6 lỗi typecheck | Phần escrow bị xóa; `PRState.merged` đổi thành `PRState.MERGED` |

**Giữ nguyên:** user, bài `OPEN`, bài `COMPLETED` (lịch sử, không có escrow), application, comment, message, notification, review, submission của bài `COMPLETED`.

**Cụ thể:**
1. `git mv` không dùng được vì file chưa được track. Dùng `mv packages/database/src/seed-realistic.ts packages/database/src/seed-demo.ts`.
2. Tách thân script thành `export async function seedDemo(db: PrismaClient): Promise<SeedDemoSummary>`. Phần chạy trực tiếp đặt dưới `if (import.meta.main)`, gồm guard, gọi `seedDemo(prisma)`, in tóm tắt, `$disconnect`.
3. Guard trước khi ghi, áp cho lần chạy trực tiếp:
   - `NODE_ENV === "production"` thì ném lỗi.
   - Host của `DATABASE_URL` không phải `localhost` hoặc `127.0.0.1` thì ném lỗi.
   - Tên DB phải là `bloody_codex_local` hoặc kết thúc bằng `_test`. Khác thì ném lỗi.
   - Chỉ in tên DB, không in cả URL.
4. Token: `const chainId = Number(process.env.CHAIN_ID ?? "31337")`, rồi `db.token.findFirst({ where: { chainId, symbol: "USDC", isActive: true } })`. Không có thì ném `Error("Chưa có token USDC cho chain <id>. Chạy deploy local và db:seed trước.")`. Mọi bài dùng token này.
5. Bài `COMPLETED`: `outcome: EscrowResolutionKind.RELEASE`, `developerId` là developer của bài. Submission tương ứng `status: SubmissionStatus.SUBMITTED` và `prState: PRState.MERGED`. Không dùng `APPROVED`, `UNDER_REVIEW`, `REJECTED` vì đó là giá trị legacy.
6. Review: tạo xong toàn bộ review thì gọi `recalcReputation(db, developerId)` cho từng developer có review. Hàm có trong `packages/database/src/reputation.ts` và nhận một transaction client. Gọi bên trong `db.$transaction(async (tx) => recalcReputation(tx, id))`.
7. Dùng `upsert` theo khóa tự nhiên như file đang làm, để chạy lại nhiều lần không bị nhân bản dữ liệu.
8. Sửa câu tóm tắt cuối cho đúng số liệu mới và in tên DB thật thay vì `'bloody_roar_local'`.
9. Thêm script:
   - `packages/database/package.json`: `"db:seed:demo": "bun run src/seed-demo.ts"`.
   - `package.json` gốc: `"db:seed:demo": "bun run --cwd packages/database db:seed:demo"`.
10. `docs/LOCAL_DEV.md`: thêm 3 dòng hướng dẫn chạy `bun run db:seed:demo` sau khi deploy local và seed token.

**Test** `packages/database/test/seed-demo.test.ts` (chạy bằng `bun run --cwd packages/database test`, cạnh `funding-reservation.test.ts`):
- `beforeAll`: `assertTestDatabase(process.env.TEST_DATABASE_URL)`, rồi tạo một token USDC chainId 31337 bằng `upsert`.
- Gọi `seedDemo(prisma)` hai lần. Kiểm:
  - Số user, issue, review không đổi giữa hai lần chạy.
  - `prisma.escrow.count()` bằng 0.
  - Không có issue nào ở `IN_PROGRESS`.
  - Mọi issue dùng token chainId 31337.
  - `reputationScore` của mỗi developer có review bằng trung bình rating (làm tròn 2 chữ số).

**Kiểm cuối:** `bun run typecheck` pass. Chạy thật một lần lên `bloody_codex_local` (được phép theo 3.4) và chạy lần thứ hai: cả hai exit 0.

Commit: `feat(l1): add idempotent local demo seed without fake escrow state`.

### L2. `cancelIssue` hủy được bài đã nạp escrow

**Lỗi:** `apps/web/src/graphql/modules/issue/issue.module.ts`, resolver `cancelIssue` (~dòng 718–760):
- Cho hủy khi bài ở `OPEN` hoặc `IN_PROGRESS`.
- Với `IN_PROGRESS`, chặn bằng `tx.escrow.findUnique(...)` trên bảng `escrows` cũ. Bảng này không còn ai ghi nên luôn trả `null`.
- Hệ quả: chủ bài hủy được một bài đang có tiền khóa trong contract. Issue thành `CANCELLED`, application của developer bị `REJECTED`, `submitWork` bị chặn (vì cần `IN_PROGRESS`), trong khi tiền vẫn nằm on-chain.

**Quyết định:** chỉ hủy được khi `status === OPEN`.
- `IN_PROGRESS` luôn có escrow đã nạp, vì worker chỉ đặt trạng thái này sau sự kiện `Deposited`. Muốn kết thúc thì dùng luồng on-chain: thỏa thuận, tranh chấp hoặc hết hạn giao.
- `AWAITING_FUNDING` dùng `cancelReservation`.

**Sửa:**
- Điều kiện thành `if (issue.status !== IssueStatus.OPEN) throw gqlError("Chỉ hủy được bài toán đang mở. Bài đã nạp ký quỹ phải kết thúc qua escrow.", "ISSUE_NOT_CANCELLABLE");`.
- Xóa dòng `tx.escrow.findUnique` và nhánh `if (issue.status === IssueStatus.IN_PROGRESS && hasEscrow)`.
- Khối `if (issue.developerId) { ... ACCEPTED → REJECTED }` không còn chạy được, vì bài `OPEN` không có `developerId`. Xóa luôn.
- FE (`issue-detail-view.tsx`, nơi dùng `CANCEL_MUTATION`): nút hủy chỉ hiện khi `issue.status === "OPEN"` và người xem là chủ bài. Nếu điều kiện hiện tại đã như vậy thì không đổi.

**Test:**
- Thêm vào `apps/web/src/test/issue-application-resolvers.test.ts`, hoặc file test đang có case `cancelIssue` (tìm bằng `grep -rln cancelIssue apps/web/src/test`):
  - `OPEN` thì hủy được.
  - `IN_PROGRESS`, `AWAITING_FUNDING`, `COMPLETED` thì lỗi `ISSUE_NOT_CANCELLABLE`.
- E2E: trong `tests/e2e/e10-release-claim.test.ts`, ngay sau `fund(f)`, client gọi `cancelIssue(id)` và nhận `ISSUE_NOT_CANCELLABLE`. Issue vẫn `IN_PROGRESS`.
- Cập nhật dòng `cancelIssue` trong `docs/AUTHZ_MATRIX.md`.

Commit: `fix(l2): only cancel open issues; funded work ends through the escrow`.

### L3. Xóa query `escrow` cũ

**Lỗi:** query `escrow(issueId)` trong `apps/web/src/graphql/modules/escrow/escrow.module.ts` (~dòng 108–126) đọc bảng `escrows` cũ, nên luôn trả `null`. Frontend không dùng query này (đã grep `components`, `app`, `lib`). Dữ liệu escrow đúng đi qua `EscrowProjection` và `viewerCapabilities`.

**Sửa:**
1. Kiểm lại: `grep -rn "escrow(issueId" apps/web/src tests docs/AUTHZ_MATRIX.md`. Nếu chỉ còn định nghĩa và test của nó thì xóa query `escrow`.
2. Xóa `EscrowRef`, `ESCROW_INCLUDE` và type liên quan nếu sau đó không còn ai dùng (TypeScript và lint sẽ báo).
3. Xóa test của query này nếu có. Bỏ dòng của nó trong `docs/AUTHZ_MATRIX.md` và trong `tests/e2e/e28-authz.test.ts` nếu có.
4. Sau L2 và L3, `grep -rnE "\.escrow\.(find|create|update|upsert|delete|count)" apps packages tests` phải rỗng, kể cả trong seed demo.
5. Trong `schema.prisma`, đặt ngay trên `model Escrow` dòng comment `/// Legacy: no code writes this table. Escrow state lives on chain and in EscrowProjection.` Không xóa model (xem mục 6).
6. Chạy lại `bun run db:generate` nếu project yêu cầu sau khi đổi comment (comment `///` có đi vào client generate).

Commit: `refactor(l3): drop the escrow query that read the unused legacy table`.

### L4. Đồng bộ `ContractConfig` từ chain

**Lỗi:** query admin `contractConfig` đọc bảng `contract_configs`, nhưng không có code nào ghi bảng này, nên màn admin không bao giờ biết contract đang `paused`, ai là arbiter, ai nhận phí.

**Quyết định:** worker đọc trực tiếp trạng thái contract theo chu kỳ, không fold event. Lý do: chỉ có 7 giá trị, đọc lại thì luôn đúng kể cả khi reorg, và không cần snapshot hay undo.

**Sửa:**
1. Thêm `apps/worker/src/jobs/contract-config.ts`, theo đúng pattern của `jobs/reconciliation.ts`:
   ```ts
   export const contractConfigJob: Job = { name: "contract-config", everyMs: 60_000, async run({ db, rpc, config }) { ... } };
   ```
2. Trong `run`:
   - Đọc 7 getter bằng `rpc.call("eth_call", [{ to: config.escrowAddress, data }, "latest"])`. `data` mã hóa bằng `encodeFunctionData` của viem với `ESCROW_ABI` từ `@bloody-roar/shared`, kết quả giải bằng `decodeFunctionResult`. Xem cách `reconciler/projections.ts:30` đang làm.
   - 7 getter: `paused`, `owner`, `pendingOwner`, `arbiter`, `pendingArbiter`, `feeRecipient`, `pendingFeeRecipient`.
   - Địa chỉ ghi chữ thường. `pending*` bằng `0x000…000` thì ghi `null`.
   - `db.contractConfig.upsert({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress.toLowerCase() } }, create: {...}, update: {...} })`.
3. Thêm `contractConfigJob` vào mảng `jobs` trong `apps/worker/src/jobs/index.ts`.
4. Lỗi RPC thì để scheduler xử lý như các job khác. Không nuốt lỗi.

**FE:** trong tab vận hành của `apps/web/src/components/admin/admin-view.tsx`:
- Thêm `contractConfig { chainId contractAddress paused owner arbiter pendingArbiter feeRecipient pendingFeeRecipient updatedAt }` vào `OPS_QUERY` (dòng 18) và type `OpsData`.
- Thêm vài dòng `<p className="mt-2 text-xs">` theo đúng kiểu dòng `indexerStatus` ở ~dòng 250: trạng thái `Paused`/`Active`, arbiter, fee recipient, và pending nếu có.
- Không đổi khung hay màu.

**Test:**
- `apps/worker/test/contract-config.test.ts`, theo kiểu `reconciliation.test.ts`. Dùng `rpc` giả trả kết quả mã hóa cho từng selector. Kiểm upsert đúng giá trị, `pending*` rỗng thành `null`, chạy hai lần vẫn chỉ có một dòng.
- E2E: thêm vào `tests/e2e/e21-admin.test.ts` một test. `waitFor` tới khi admin query `contractConfig` trả một dòng có `arbiter` bằng `f.arbiter.toLowerCase()` và `feeRecipient` bằng `f.feeRecipient.toLowerCase()`.
- `fe-operations.test.ts` sẽ kiểm `OPS_QUERY` mới.

Commit: `feat(l4): sync contract config from chain for the admin ops view`.

### L5. Thứ tự kiểm trong `prepareChallengeRuling`; bỏ số ngày viết cứng

**Lỗi 1:** `apps/web/src/graphql/modules/dispute/ruling.module.ts` (~dòng 60–90) kiểm pha escrow trước khi kiểm người gọi có phải bên tham gia không. Người ngoài nhận `INVALID_PHASE` hoặc `NOT_FOUND`, và qua đó biết được pha của escrow (BỔ SUNG K9).

**Sửa:** ngay sau `const projection = await rulingProjection(...)`, chỉ khi `method === "challengeRuling"`:

```ts
const wallet = user.walletAddress.toLowerCase();
if (wallet !== projection.client.toLowerCase() && wallet !== projection.developer.toLowerCase())
  throw gqlError("Không được kháng cáo phán quyết này", "FORBIDDEN");
```

- Trong nhánh `challengeRuling` phía dưới, bỏ vế `(!client && !developer)` vì đã kiểm ở trên. Giữ kiểm `clientBps`.
- `finalizeRuling` và `finalizeArbiterTimeoutSplit` giữ nguyên, vì contract cho mọi người gọi.

**Lỗi 2:** số ngày `30 * 86_400_000`, `7`, `1` viết cứng trong cùng hàm. **Sửa:** dùng hằng có sẵn trong `packages/shared/src/constants/index.ts`:
- `ARBITER_STALL_DAYS` (30)
- `DISPUTE_CHALLENGE_DAYS` (7)
- `DISPUTE_FINAL_NOTICE_HOURS` (24)

Nhân với `DAY_MS` và `HOUR_MS` (import như `apps/worker/src/jobs/cleanup.ts` đang import `DAY_MS`). Giá trị không đổi.

**Test:**
- Thêm vào test của ruling module (tìm bằng `grep -rln prepareChallengeRuling apps/web/src/test`): người ngoài gọi khi pha **không** phải `INITIAL_RULING` vẫn nhận `FORBIDDEN`.
- Trong `tests/e2e/e28-authz.test.ts`, test escrow FUNDED: bỏ `INVALID_PHASE` khỏi danh sách mã chấp nhận cho `prepareChallengeRuling`, chỉ còn `FORBIDDEN`.
- Sửa `DECISIONS.md` mục BỔ SUNG K9: thêm một dòng "Đã sửa ở L5".

Commit: `fix(l5): check challenge eligibility before escrow phase; use shared periods`.

### L6. Gate cuối và báo cáo

1. Chạy gate 3.2. Phải exit 0.
2. `reports/CODEX.md`:
   - Dòng đầu: `HOÀN TẤT <ngày giờ> (gate exit 0; typecheck, build, E1–E32 pass)`.
   - Thêm bảng L0–L6 kèm hash.
   - Mục "Bị chặn" trống.
3. Commit `docs(report): final status after l-series fixes`.

---

## 5. Định nghĩa xong

Tất cả đều phải đúng:

1. Gate 3.2 exit 0. E2E in `E2E scenarios passed (E1–E32)`.
2. `git status` sạch.
3. Các lệnh sau đều không in gì:
   ```bash
   ls packages/database/src/seed-realistic.ts 2>/dev/null
   grep -rnE "\.escrow\.(find|create|update|upsert|delete|count)" apps packages tests
   grep -n "IssueStatus.IN_PROGRESS" apps/web/src/graphql/modules/issue/issue.module.ts | grep -i cancel
   grep -n "30 \* 86_400_000" apps/web/src/graphql/modules/dispute/ruling.module.ts
   ```
4. `grep -n contractConfigJob apps/worker/src/jobs/index.ts` có kết quả.
5. `reports/CODEX.md` có dòng `HOÀN TẤT`. Mọi quyết định mới có mục `BỔ SUNG` trong `DECISIONS.md`.

Khi xong, in đúng ba phần:
1. Các mục L đã xong, kèm hash.
2. Kết quả gate, từng lệnh.
3. "Bị chặn" và các mục `BỔ SUNG` mới.

---

## 6. Ngoài phạm vi (đã cân nhắc, cố ý không làm)

- **Attestation (EAS):** chỉ có query đọc, chưa có luồng tạo. Cần schema EAS và ví attester, không làm được ở local. Query trả mảng rỗng là đúng.
- **Model `Transaction`:** không ai đọc hay ghi. Xóa cần migration drop table; để lại cho đợt dọn schema sau.
- **Xóa bảng `escrows`:** cần migration drop và kiểm dữ liệu trên DB thật. L3 chỉ bỏ hết code đọc và đánh dấu legacy.
- **Đổi `clientIp` cho production:** production chạy sau proxy có `x-forwarded-for`.
