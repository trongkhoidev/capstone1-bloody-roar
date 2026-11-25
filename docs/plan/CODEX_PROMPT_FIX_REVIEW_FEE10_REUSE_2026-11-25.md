# Sửa lỗi sau review fee-10 / US-107 / US-108 (2026-11-25)

Nguồn: báo cáo review theo `docs/plan/OPUS_PROMPT_REVIEW_FEE10_REUSE_2026-11-23.md`. Khôi đã duyệt toàn bộ 13 mục dưới đây.

## Kế hoạch

Ba nhánh xếp chồng: `feat/platform-fee-10` → `feat/us-107-similar-issue` → `feat/us-108-reuse-price`. Sửa từ dưới lên. Mỗi lỗi là một commit. Sửa xong nhánh dưới thì rebase các nhánh trên.

| # | Nhánh | Việc | File chính |
|---|---|---|---|
| F1 | fee-10 | Bỏ `rootDir` để `tsc` của contracts hết TS6059 | `apps/contracts/tsconfig.json` |
| F2 | fee-10 | Thêm bước typecheck contracts vào CI | `.github/workflows/contracts.yml` |
| F3 | fee-10 | Sửa docs còn ghi phí cũ | `docs/demo/DEMO_DATA_REPORT.md:73`, `docs/PRODUCT_BACKLOG.md:315` |
| F4 | fee-10 | Sửa E5 flaky: giữ nonce khi `evm_revert` | `tests/e2e/harness/chain.ts`, `tests/e2e/e09-work.test.ts` |
| F5 | fee-10 | Cho CI chạy `*.db.test.ts` | `.github/workflows/ci.yml` |
| F6 | fee-10 | Thêm job CI chạy e2e hardhat | `.github/workflows/ci.yml` |
| S1 | us-107 | `to_tsquery('simple', …)` | `apps/web/src/lib/services/similar-issues.ts` |
| S2 | us-107 | Loại issue bị ẩn và dev bị ban | như trên |
| S3 | us-107 | Workload `SIMILARITY` riêng, không trừ quota AI của client | `similar-issues.ts`, `apps/web/src/ai/model-router.ts` |
| S4 | us-107 | Comment `shortcut:` cho `updateIssue` | `apps/web/src/graphql/modules/issue/issue.module.ts` |
| R1 | us-108 | Cập nhật `reservedRaw` sau assign và cancel | `apps/web/src/components/marketplace/issue-detail-view.tsx` |
| R2 | us-108 | Sửa assert luôn đúng ở E35 | `tests/e2e/e35-reuse-price.test.ts:663` |
| R3 | us-108 | Đưa điều khoản licence vào `termsHash` | `packages/shared/src/escrow/hashing.ts`, `select.module.ts`, vector TS và Forge |

**Bước 0 (Khôi tự chạy trước khi giao cho Codex).** Worktree chính đang checkout `feat/us-108-reuse-price` và có các file thirdweb chưa commit. Git không cho rebase một nhánh đang được checkout ở worktree khác. Lệnh sau tách HEAD tại đúng commit hiện tại; file trên đĩa giữ nguyên:

```bash
git switch --detach
```

Sau khi Codex xong, Khôi chạy `git switch feat/us-108-reuse-price` để quay lại. Thay đổi thirdweb đi theo, trừ khi `issue.module.ts` xung đột với S4. Nếu xung đột thì `git stash` trước, rồi `git stash pop` sau.

**Rủi ro cần biết**

- R3 đổi `termsHash` của mọi reservation **tạo mới**. Reservation cũ đã lưu hash nên không ảnh hưởng, vì chỉ `select` tính hash, các chỗ khác chỉ so giá trị đã lưu. Vector hash cũ vẫn giữ vì trường licence là optional.
- F6 làm CI dài thêm khoảng 15–20 phút và cần cài Playwright cho E32/E34.
- Sau rebase phải chạy lại toàn bộ lệnh kiểm tra trên từng nhánh.

---

## Prompt cho Codex

Copy nguyên khối dưới đây.

````markdown
Bạn sửa 13 lỗi đã được duyệt trên ba nhánh xếp chồng của repo BloodyRoar (`/Users/admin/repos/capstone1`), mỗi lỗi một commit.

## Luật bắt buộc

- Chỉ dùng `bun`. Không npm/pnpm/npx (dùng `bun x`).
- Làm trong worktree riêng: `git worktree add ../capstone1-fix feat/platform-fee-10`. KHÔNG đụng worktree chính `/Users/admin/repos/capstone1`: ở đó có các file thirdweb chưa commit; không stage, revert, format hay stash chúng.
- Worktree mới phải chạy `bun install` và `bun x prisma generate` trong `packages/database` trước khi typecheck/test.
- `.env` trỏ tới Supabase thật. Không sửa `.env`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`, hay bất cứ thứ gì ghi vào Supabase.
- DB chỉ dùng Postgres local: container `bloody_roar_postgres`, cổng 5433. Lấy mật khẩu lúc chạy (`docker exec bloody_roar_postgres printenv POSTGRES_PASSWORD`), không ghi ra file. Tên DB phải kết thúc bằng `_test` (vd `bloody_fix_test`). Truyền qua biến `TEST_DATABASE_URL` cho từng lệnh.
- Không kill process ở các cổng 4011, 4012, 18545 của session khác. Nếu cổng bận, đặt `E2E_RPC_PORT` khác hoặc chờ.
- Không push. Không sửa gì ngoài danh sách dưới. Commit message dạng `fix(<scope>): <mô tả>` hoặc `test(...)`/`ci(...)`/`docs(...)`, tiếng Anh, khớp nội dung.
- Diff ngắn nhất làm đúng việc. Không thêm abstraction, option hay config không được yêu cầu. Không thêm comment mới, trừ comment S4. Comment cũ bị sai sau khi sửa thì sửa lại cho đúng.
- Logic mới (nhánh điều kiện, SQL, tiền, hash) phải có test nhỏ đi kèm trong cùng commit.

## Phần 1: nhánh `feat/platform-fee-10`

**F1. Typecheck contracts.** `bun run --cwd apps/contracts typecheck` lỗi TS6059 vì `test/BloodyRoarEscrow.test.ts` import `../../../packages/shared/src/money` nằm ngoài `rootDir`. Bỏ dòng `"rootDir": "."` trong `apps/contracts/tsconfig.json`. Kiểm: lệnh trên pass, `bun run contracts:compile` và `bun run --cwd apps/contracts test` vẫn pass.

**F2. CI chạy typecheck contracts.** Trong `.github/workflows/contracts.yml`, thêm bước `bun run --cwd apps/contracts typecheck` ngay sau bước Compile (typecheck có thể cần typechain sinh ra từ compile). Thêm `"packages/shared/**"` vào `paths` của cả `push` và `pull_request`, vì test contracts import từ đó.

**F3. Docs phí.** Theo QĐ-33: client trả bounty + 10% phí nạp; phí platform = 10% phần dev nhận, trừ từ phí nạp; phần thừa trả lại client. Sửa:
- `docs/demo/DEMO_DATA_REPORT.md:73` (đang ghi 97,5% / 2,5%).
- `docs/PRODUCT_BACKLOG.md:315` (đang ghi settlement "fee-free").
Đọc QĐ-33 trong `docs/` để dùng đúng cách diễn đạt, chỉ sửa các dòng sai.

**F4. E5 flaky do `evm_revert` lùi nonce.** Nguyên nhân đã xác minh: `evm_revert` đưa nonce của các account về lúc snapshot, nhưng DB e2e vẫn giữ `txHash` của tx đã bị revert trong `transaction_intents`. Test chạy sau gửi lại tx giống hệt (cùng sender, nonce, data, phí) nên ra cùng hash → P2002 → `recordTransactionSubmitted` trả "This transaction hash was already recorded". bun 1.4 không chạy file theo thứ tự nên lỗi phụ thuộc thứ tự.
Sửa trong `tests/e2e/harness/chain.ts`, hàm `restoreChain`:
1. Trước `evm_revert`: lấy `eth_accounts`, đọc `eth_getTransactionCount(account, "latest")` cho từng account.
2. Sau `evm_revert` thành công: `hardhat_setNonce(account, nonceHex)` về đúng các giá trị đó. Làm việc này trước vòng `evm_mine` hiện có.
Rồi sửa `tests/e2e/e09-work.test.ts`: khối `finally` (dòng ~25–32) đang chép lại logic `restoreChain`. Thay bằng `await restoreChain(snapshot, { prisma: f.prisma })`. Có thể đổi `rpc("evm_snapshot")` thành `snapshotChain()`.
Kiểm: chạy `TEST_DATABASE_URL=… bun run test:e2e:local` hai lần liên tiếp, phải 0 fail cả hai. Nếu vẫn còn P2002, ghi lại test nào và thứ tự file, đừng đoán.

**F5. CI chạy DB test.** Trong job `web` của `.github/workflows/ci.yml`, các file `*.db.test.ts` đang bị skip vì không có `TEST_DATABASE_URL`. Trước tiên đọc cách các DB test chuẩn bị schema (tìm `TEST_DATABASE_URL` trong `apps/web/src/test/` và `packages/database`): chúng tự migrate hay cần DB đã migrate sẵn.
- Tạo DB `bloody_roar_ci_test` bằng `psql` trên service postgres có sẵn.
- Nếu cần, chạy `prisma migrate deploy` với `DATABASE_URL` trỏ tới DB đó trong bước riêng. Không dùng `db:migrate:prod` với DB test trừ khi script đó chỉ đọc `DATABASE_URL` truyền vào.
- Đặt `TEST_DATABASE_URL` cho bước unit test.
Kiểm local: `TEST_DATABASE_URL=…/bloody_fix_test bun run --cwd apps/web test` có số skip giảm đúng bằng số DB test, 0 fail.

**F6. CI chạy e2e hardhat.** Thêm job `e2e` mới trong `ci.yml` (`needs` không bắt buộc), `timeout-minutes: 45`:
- Service postgres 16, DB tên kết thúc `_test`.
- `bun install --frozen-lockfile`, `bun run db:generate`, cài Playwright chromium cho `apps/web` (`bun x playwright install --with-deps chromium`), vì `run-local.ts` chạy cả `apps/web/ui-e2e` (E32, E34).
- Đọc `tests/e2e/run-local.ts`, `tests/e2e/check-env.ts` và `tests/e2e/harness/*` để biết cần biến môi trường nào (vd `AUTH_PRIVATE_KEY` sinh ngẫu nhiên như job `web`, `AI_HASH_KEY`). `check-env.ts` cấm các key AI/S3 thật, nên không đưa secrets đó vào.
- Chạy `bun run test:e2e:local` với `TEST_DATABASE_URL`.
- Khi fail: `cat tests/e2e/.run/*.log` (hoặc `actions/upload-artifact` thư mục `tests/e2e/.run`).
Không thể chạy GitHub Actions local, nên kiểm bằng cách đọc kỹ và chạy đúng chuỗi lệnh của job trên máy (DB local `_test`). Ghi rõ trong báo cáo là chưa chạy trên GitHub.

Xong phần 1: `bun run typecheck`, `bun run lint`, test web, test worker, hardhat, `forge test`, typecheck contracts, e2e local. Tất cả phải pass.

## Phần 2: rebase

```bash
git switch feat/us-108-reuse-price
git rebase --update-refs feat/platform-fee-10
```

Lệnh này đưa cả `feat/us-107-similar-issue` lên trên fee-10 mới. Nếu báo nhánh đang được checkout ở worktree khác thì dừng lại và báo Khôi; không dùng `--force` hay xoá worktree của người khác. Có xung đột thì giải quyết giữ đúng ý cả hai phía, rồi chạy lại typecheck.

## Phần 3: nhánh `feat/us-107-similar-issue`

Làm trên `feat/us-107-similar-issue` (`git switch` sang nhánh này trong worktree fix). Sau phần 3, rebase lại us-108 lên us-107 (`git switch feat/us-108-reuse-price && git rebase feat/us-107-similar-issue`).

**S1. Stem hai lần.** Trong `findSimilarCandidates` (`apps/web/src/lib/services/similar-issues.ts`), câu query dựng `to_tsquery('english', …)` từ các lexeme đã được `to_tsvector('english', …)` stem. Stem lần hai làm hỏng từ: `agreed→agre→agr`, `university→univers→univ`. Vì vậy hai mô tả giống hệt nhau cũng không khớp. Đổi `to_tsquery('english', …)` thành `to_tsquery('simple', …)`. Giữ `to_tsvector('english', …)` ở mọi chỗ khác. Cập nhật comment phía trên cho đúng.
Test (thêm vào DB test của similar-issues hiện có): issue cũ COMPLETED có mô tả "The parties agreed at the university", issue mới cùng tiêu đề và mô tả, cùng skill → `findSimilarCandidates` trả issue cũ. Test này phải fail trước khi sửa.

**S2. Issue bị ẩn và dev bị ban.** Thêm vào `WHERE`:
- `AND i."hiddenAt" IS NULL`
- loại dev bị ban: `AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = i."developerId" AND u."isBanned")`. Kiểm tên bảng và cột trong `schema.prisma` (`@@map`).
Test: một issue có `hiddenAt` và một issue có dev `isBanned = true` đều không được trả về.

**S3. Workload và quota riêng.** Hiện `detectSimilarIssues` gọi `aiRateLimit(user)` (trừ 1 trong 10 lượt AI/giờ của client) và log dưới task `TESTGEN`.
- Thêm `"SIMILARITY"` vào `AIWorkload` trong `apps/web/src/ai/model-router.ts`. Điền `GROQ_MODELS` và `OPENAI_MODELS` bằng model nhỏ (giống `GUARD`). Typecheck sẽ chỉ ra các `Record<AIWorkload, …>` khác cần điền.
- Trong `detectSimilarIssues`: dùng `isAIConfigured("SIMILARITY")` và `task: "SIMILARITY"`. Bỏ `aiRateLimit(user)`. Thay bằng bucket riêng dùng `rateLimit` có sẵn trong `apps/web/src/lib/rate-limit.ts`: key `similar:${user.id}`, 20 lần/giờ. Hết lượt thì `return` im lặng (log debug), không throw, vì việc publish không được lỗi theo.
- `AILog.task` là `String`, không cần migration. Kiểm tra `tests/e2e/mocks/ai-server.ts` và mọi chỗ đọc `AI_MODEL_TESTGEN`/`GROQ_MODEL_…` để chắc mock vẫn trả lời cho task mới.
Test: gọi `detectSimilarIssues` với `complete` giả → task truyền vào là `"SIMILARITY"`, và quota `ai:${user.id}` không bị trừ (vd gọi `aiRateLimit` 10 lần sau đó vẫn không throw).

**S4. Comment shortcut** (Khôi yêu cầu rõ comment này, nên không trái luật "no code comments unless asked"). Trong `updateIssue` (`apps/web/src/graphql/modules/issue/issue.module.ts`), thêm một dòng:
`// shortcut: editing title, description or skills does not re-run similar-issue detection, so old IssueSimilarity rows stay; re-run it here if edits after publish become common.`

Xong phần 3: chạy lại toàn bộ lệnh kiểm tra như phần 1.

## Phần 4: nhánh `feat/us-108-reuse-price`

**R1. Số tiền hiển thị bị cũ.** Trong `apps/web/src/components/marketplace/issue-detail-view.tsx`, `reservedRaw` chỉ được gán khi tải lần đầu (dòng ~212). Hậu quả:
- Sau `assign` (dòng ~478), client thấy "Total Locked 110" thay vì 55 cho reuse.
- Sau `cancelFunding` (dòng ~512), issue đã về OPEN nhưng vẫn hiện 55.
Sửa:
- Trong `assign`, khi mutation thành công, gọi `setReservedRaw(<kết quả>.selectDeveloper.amountRaw)` (mutation `SELECT_DEVELOPER` đã trả `amountRaw`).
- Trong `cancelFunding`, khi thành công, gọi `setReservedRaw(null)`.
Nếu đã có test component cho file này thì thêm một case; nếu không thì không cần tạo bộ test mới.

**R2. Assert luôn đúng ở E35.** `tests/e2e/e35-reuse-price.test.ts:663`: `expect(55_000_000n - (after - before)).toBe(55_000_000n)` chỉ chứng minh số dư không đổi. Đo số dư USDC của client **sau khi mint, trước khi approve/deposit**, rồi `expect(before - after).toBe(55_000_000n)`. Giữ nguyên assert escrow +55 ở dòng 664.

**R3. Licence vào termsHash.** Điều khoản "developer keeps a non-exclusive licence to reuse their fix" hiện chỉ là chữ ở `create-issue-form.tsx:234` và `issue-detail-view.tsx:1410`, không nằm trong hash mà client ký.
- Trong `packages/shared/src/escrow/hashing.ts`: export hằng `REUSE_LICENCE_TERMS = "non-exclusive-reuse-v1"`. Thêm `licence?: string` vào `TermsInput`. Trong `computeTermsHash`, thêm `...(input.licence ? { licence: input.licence } : {})`, cùng kiểu với `reuseOfIssueId`. Trường để optional để mọi vector hash cũ giữ nguyên.
- Trong `reservationTermsHash` (`apps/web/src/graphql/modules/escrow/select.module.ts`): luôn truyền `licence: REUSE_LICENCE_TERMS`. Điều khoản áp cho mọi bounty, không chỉ bounty reuse.
- Thêm một vector mới có `licence` vào `apps/web/src/test/escrow-core/hashing.test.ts` và `apps/contracts/test/foundry/HashVectors.t.sol`. JSON canonical phải có khoá theo thứ tự đúng như `canonicalJson` sắp (`licence` đứng giữa `issueId` và `reuseOfIssueId`). Hai bên phải ra cùng hash.
- Grep để chắc không nơi nào khác tự tính lại `termsHash` từ đầu (worker, reconciler, e2e harness). Nếu có thì truyền `licence` tương tự.
Kiểm: test web, `forge test`, e2e E35 và E5 pass.

Xong phần 4: chạy lại toàn bộ lệnh kiểm tra.

## Lệnh kiểm tra (chạy ở cuối mỗi phần, trong worktree fix)

```bash
bun run typecheck
bun run lint
TEST_DATABASE_URL=<local _test> bun run --cwd apps/web test
bun run --cwd apps/worker test
bun run --cwd apps/contracts typecheck
bun run --cwd apps/contracts test
(cd apps/contracts && forge test)
TEST_DATABASE_URL=<local _test> bun run test:e2e:local
```

## Báo cáo khi xong (tiếng Việt, ngắn)

1. Bảng: mã lỗi → nhánh → commit hash → một dòng đã làm gì.
2. Kết quả từng lệnh kiểm tra cho mỗi nhánh (pass/fail, số test). Ghi rõ tải máy nếu e2e chậm.
3. Những gì đã lệch khỏi prompt này và lý do.
4. Những gì chưa kiểm được (vd job CI mới chưa chạy trên GitHub).
5. Lệnh Khôi cần chạy để quay lại worktree chính.
Cuối cùng xoá worktree fix (`git worktree remove ../capstone1-fix`) và DB `_test` đã tạo nếu không cần nữa.
````
