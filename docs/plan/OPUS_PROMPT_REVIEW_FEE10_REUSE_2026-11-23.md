Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo). Đọc `AGENTS.md`, `CLAUDE.md`, mục QĐ-33 trong `docs/management/MEETING_MINUTES.md` và prompt gốc `docs/plan/OPUS_PROMPT_FEE10_REUSE_2026-11-23.md` trước khi làm.

Nhiệm vụ: **review độc lập** toàn bộ thay đổi của ba nhánh dưới đây. Mặc định bạn chỉ đọc, chạy test và báo cáo. Không sửa code, không commit, không push, trừ khi Khôi bảo sửa sau khi đọc báo cáo.

## Phạm vi

| Nhánh | Gốc | Nội dung |
|---|---|---|
| `feat/platform-fee-10` | `176e718` | Phí 10% client trả thêm trên bounty (QĐ-33) |
| `feat/us-107-similar-issue` | `feat/platform-fee-10` | US-107: phát hiện issue trùng, báo dev cũ |
| `feat/us-108-reuse-price` | `feat/us-107-similar-issue` | US-108: giá tái sử dụng 50% bounty |

Xem diff từng phần:

```bash
git diff 176e718..feat/platform-fee-10
git diff feat/platform-fee-10..feat/us-107-similar-issue
git diff feat/us-107-similar-issue..feat/us-108-reuse-price
```

Working tree còn việc dở của task thirdweb (chưa commit: `apps/web/src/lib/web3/*`, `components/auth/*`, `use-auth-store.ts`, `next.config.mjs`, `package.json`, `bun.lock`, `.env.example`, `AGENTS.md`, `scripts/demo/local-up.sh` và test của chúng). Những file đó không thuộc phạm vi review. Không stage, revert hay format chúng. Nếu cần một cây sạch, dùng `git worktree add` vào scratchpad.

## Quy tắc an toàn

- Chỉ dùng `bun`.
- `.env` trỏ tới **Supabase thật**. Không sửa `.env`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`, và không chạy gì ghi vào Supabase.
- DB local: container `bloody_roar_postgres`, cổng `5433`. Lấy mật khẩu bằng `docker exec bloody_roar_postgres printenv POSTGRES_PASSWORD` và chỉ đặt vào biến môi trường khi chạy, không ghi vào file. Nên tạo DB riêng có đuôi `_test` (ví dụ `bloody_review_test`), vì `assertTestDatabase` bắt buộc đuôi này.
- Trong repo có `.codegraph/`. Dùng `codegraph explore "<symbol>"` trước khi grep.
- Có thể có phiên khác đang chạy e2e trên cùng working tree (cổng 4011, 4012, 18545). Kiểm tra bằng `lsof` trước, và không kill tiến trình của phiên khác.

## Cần review những gì

Với mỗi mục, hãy đọc code thật (cả code gọi tới và code được gọi, không chỉ diff), rồi kết luận đúng, sai hay chưa chắc. Nếu có thể, kèm một ví dụ cụ thể hoặc một test chứng minh.

### A. Tiền và contract (QĐ-33)

1. `BloodyRoarEscrow.sol`, `deposit` và `_resolve`:
   - Kiểm rằng `clientAmount + developerAmount + platformFee == amount + _depositFee(amount)` ở mọi `clientBps`, kể cả khi làm tròn với số lẻ.
   - Kiểm rằng `platformFee <= depositFee` luôn đúng và không có underflow.
   - Kiểm rằng `totalUnresolvedPrincipal` và `totalClaimable` cộng trừ khớp nhau, và `_assertSolvent` vẫn đúng.
   - Tìm xem còn chỗ nào trong contract dùng `escrow.amount` như thể đó là tổng số đã nạp.
   - Kiểm xem event `Deposited` vẫn phát `amount` là bounty, không phải tổng. Đánh giá xem indexer, fold và reconciler có hiểu sai chỗ này không.
2. `splitPayout` và `depositTotal` trong `packages/shared/src/money.ts`: phải khớp contract tuyệt đối. Test hardhat hiện import trực tiếp `../../../packages/shared/src/money`. Đánh giá cách này có ổn về build và typecheck của `apps/contracts` không.
3. `prepareEscrowDeposit`: số dư và approve tính theo `depositTotal`, còn `deposit(amount)` và `FundingIntent` (EIP-712) vẫn dùng bounty. Kiểm xem client có thể bị approve thiếu không, ví dụ khi allowance đang còn dở từ lần trước.
4. `fold.ts` và worker effects: số tiền trong event resolve có được kiểm đúng theo quy tắc mới không. `reconciler/projections.ts` có so `amount` theo nghĩa nào?
5. FE `issue-detail-view.tsx`: các con số "Total Locked", "Developer Net", "Platform Fee" và thanh tỉ lệ có đúng ở mọi trạng thái không (OPEN, AWAITING_FUNDING, FUNDED, RESOLVED có split).
6. Tìm số cũ còn sót (2,5%, 97,5, 250 bps) trong code, test, seed và docs đang dùng. Bỏ qua `docs/plan/*` có ngày cũ và `scripts/demo/content/*`.
7. Docs (`PROPOSAL.md`, `PRODUCT_BACKLOG.md`, `PROJECT_SPRINT_PLAN.md`, `MEETING_MINUTES.md`): có nhất quán với code không.

### B. US-107: phát hiện issue trùng

File chính: `apps/web/src/lib/services/similar-issues.ts`, `issue.module.ts` (`createIssue`), `issue-availability.module.ts` (`similarFixIssueId`), migration `*_issue_similarity`.

1. **Truy vấn SQL** (`$queryRaw` dạng tagged template):
   - Có rủi ro injection không?
   - Cách ghép `quote_literal` + `to_tsquery('english', ...)` có lỗi với input lạ không: chuỗi rỗng, chỉ có stopword, ký tự `'`, `\`, `:`, `&`, `!`, emoji, tiếng Việt có dấu, mô tả 5000 ký tự?
   - Khi re-stem từ đã stem thì kết quả còn đúng không?
   - `to_tsvector` tính trên toàn bảng `issues` mà không có GIN index. Ước lượng chi phí khi bảng lớn.
2. **Lọc ứng viên:** chỉ issue `COMPLETED`, có `developerId`, khác `clientId`, có chung skill, tối đa 5. Kiểm xem có cần loại issue bị ẩn (`hiddenAt`) hoặc dev bị ban không.
3. **Bước AI:**
   - Mọi lời gọi có đi qua `scanAndMask`, `aiRateLimit`, `completeAI` không, và `AILog` có chỉ lưu HMAC không?
   - Mô tả của client cũ được gửi cho AI (đã mask). Đánh giá rủi ro prompt injection từ mô tả đó: AI có thể trả `issueId` nằm ngoài danh sách không (code đang lọc bằng `byId`), và có thể ép score cao không?
   - `aiRateLimit(user)` trừ quota AI của client mỗi lần họ công bố bounty có ứng viên. Hành vi này có chấp nhận được không?
   - Ngưỡng `SIMILARITY_MIN_SCORE = 0.8`.
4. **Fire-and-forget:**
   - Lỗi có bị nuốt đúng chỗ không?
   - Trên Vercel hay serverless, promise chạy nền có bị cắt khi response trả về không?
   - Tiến trình chạy nền dùng `ctx.db`. Có vấn đề gì về vòng đời kết nối không?
5. **Ghi kết quả:** `createMany skipDuplicates` + `createNotificationIdempotent` với `dedupeKey = similar:<new>:<old>`.
   - Hai lần gọi chạy đồng thời có tạo trùng không?
   - Nội dung notification có lộ gì ngoài tiêu đề issue cũ không?
6. **Quyền:** `similarFixIssueId` chỉ trả cho đúng dev có dòng trong `IssueSimilarity`. Kiểm viewer ẩn danh, user bị ban, admin, client của issue mới. Kiểm xem resolver có thêm query làm chậm trang issue không.
7. **Migration:**
   - `ALTER TYPE ... ADD VALUE` trên Postgres: có chạy được trong transaction của Prisma trên Supabase không?
   - Thứ tự deploy: nếu code lên trước migration thì trang issue sẽ lỗi.
8. **Chưa tích hợp:** Prompt có nhắc `publishIssue` nếu US-99 đã merge. Kiểm xem `updateIssue` hay luồng draft→publish có công bố issue mà bỏ qua bước phát hiện không.

### C. US-108: giá tái sử dụng

File chính: `application.module.ts` (`applyToIssue`), `select.module.ts` (`selectDeveloper`), `packages/shared/src/escrow/hashing.ts`, `HashVectors.t.sol`, `issue-detail-view.tsx`, `create-issue-form.tsx`, `tests/e2e/e35-reuse-price.test.ts`, `tests/e2e/harness/funding.ts`.

1. **Quyền ứng tuyển:**
   - Kiểm ba điều kiện: người gọi là `developerId` của issue cũ, issue cũ ở trạng thái `COMPLETED`, và có dòng `IssueSimilarity` với `developerId` khớp.
   - Kiểm race: các điều kiện được kiểm trong transaction Serializable. Nhưng nếu issue cũ đổi trạng thái hoặc dòng similarity bị xoá sau khi ứng tuyển, còn trước `selectDeveloper`, thì giá vẫn giảm. Đây có phải lỗ hổng không?
   - Rút đơn rồi ứng tuyển lại không kèm reuse: `reuseOfIssueId` có được xoá về null không?
2. **Tính giá:**
   - `amountRaw = bpsOf(bounty, REUSE_PRICE_BPS)` được tính lúc chọn dev. Kiểm khi bounty bị sửa giữa lúc ứng tuyển và lúc chọn.
   - Bounty lẻ làm tròn xuống: dev có bị thiệt 1 đơn vị không, và việc này có chấp nhận được không?
   - Với `onDelete: SetNull` trên `reuseOfIssueId`: khi issue cũ bị xoá thì đơn quay về giá đầy đủ. Hành vi đó có hợp lý không?
3. **`termsHash`:**
   - `reuseOfIssueId` chỉ thêm khi có giá trị. Kiểm rằng hash của mọi reservation cũ không đổi.
   - Vector trong `hashing.test.ts` và `HashVectors.t.sol` phải khớp nhau.
   - Tìm mọi nơi khác có tính hoặc so `termsHash` (worker, fold, reconciler, FE ký EIP-712) và xem chúng có cần biết `reuseOfIssueId` không.
4. **Ký và nạp tiền:**
   - `FundingIntent` có ký `amount = 50`, approve 55 và `deposit(50)` không?
   - Worker có nhận deposit 50 cho reservation 50, và đánh `DEPOSIT_MISMATCHED` khi deposit 100 không?
   - Client có thể nạp đủ 100 để "trả hết" không? Nếu có thì chuyện gì xảy ra?
5. **FE:**
   - Ô "Reuse my fix…" chỉ hiện khi server cho phép.
   - Dòng giá trong trang duyệt đơn của client phải tính từ `bountyRaw` (đúng không?).
   - Sau khi chọn dev, số tiền lấy từ `escrow.amountRaw ?? reservation.amountRaw ?? bountyRaw`. Field `reservation` chỉ trả cho client hoặc dev, nên người ngoài sẽ thấy giá đầy đủ trong lúc AWAITING_FUNDING. Đây là lỗi hay chấp nhận được?
   - Kiểm accessibility của checkbox và link.
6. **Điều khoản giấy phép không độc quyền:**
   - Dòng này đã được thêm ở form đăng bounty và panel "Escrow agreement". Có đủ để coi là client đã đồng ý không?
   - Dòng này có nằm trong `termsHash` không? Có cần nằm trong đó không?
7. **Ba mặc định chưa chốt:** giá cố định 50%, không ưu tiên, client được từ chối. Xem code có làm đúng ba điều đó không, và có chỗ nào ngầm giả định khác không.

### D. Test và chất lượng

1. Test có thật sự kiểm đúng điều nó tuyên bố không? Tìm test pass vì mock quá rộng, hoặc assert quá lỏng (ví dụ phép tính số dư ví client trong E35).
2. DB test (`*.db.test.ts`) bị skip khi thiếu `TEST_DATABASE_URL`. Như vậy CI có chạy chúng không? Nếu không thì đâu là cổng bảo vệ?
3. **E5 flaky:** lỗi "This transaction hash was already recorded" (P2002 trên `transaction_intents.txHash`) xuất hiện khi máy tải nặng. Hãy điều tra nguyên nhân thật: ai ghi trùng `txHash`, và có liên quan tới `harness/funding.ts` hay `recordTransactionSubmitted` không. Đây là việc có giá trị nhất nếu bạn tìm ra.
4. `tsconfig.json` có thêm `"@bloody-roar/shared/*"` để e2e resolve được subpath. Kiểm xem việc này có ảnh hưởng typecheck hay build ở nơi khác không.
5. Ở mỗi commit, kiểm message có khớp nội dung không, và có file lạ lọt vào không.

### E. Kiến trúc và YAGNI

- Có abstraction, wrapper hay tham số thừa không? Có chỗ nào lặp logic đáng lẽ dùng lại helper có sẵn không?
- Comment có chỉ nói "vì sao" không? Shortcut có giới hạn đã được ghi `// shortcut:` chưa?
- Đánh giá các chỗ làm lệch khỏi prompt gốc:
  - full-text dùng `'english'` thay cho `'simple'`
  - workload AI là `TESTGEN`
  - dùng `createNotificationIdempotent`
  - nhãn FE bằng tiếng Anh
  - e2e đánh số E35
  - migration được áp bằng `prisma migrate deploy` lên DB local, vì `migrate dev` cần TTY và `bloody_roar_dev` có migration `init` hỏng

## Lệnh kiểm tra

Chạy trên nhánh `feat/us-108-reuse-price` (bao gồm cả hai nhánh trước):

```bash
bun run typecheck && bun run lint
bun run --cwd apps/web test
bun run --cwd apps/worker test
bun run --cwd apps/contracts test && bun run --cwd apps/contracts test:fuzz

# DB test và e2e: dùng DB local riêng có đuôi _test
PW=$(docker exec bloody_roar_postgres printenv POSTGRES_PASSWORD)
docker exec bloody_roar_postgres psql -U postgres -qc "CREATE DATABASE bloody_review_test"
U="postgresql://postgres:$PW@127.0.0.1:5433/bloody_review_test"
(cd packages/database && DATABASE_URL=$U DIRECT_URL=$U bun --env-file=../../.env run scripts/assert-local-db.ts \
  && DATABASE_URL=$U DIRECT_URL=$U bun x prisma migrate deploy)
(cd apps/web && TEST_DATABASE_URL=$U AI_BASE_URL= GROQ_API_KEY= OPENAI_API_KEY= AI_API_KEY= \
  bun run test -- src/test/similar-issues.db.test.ts src/test/reuse-apply.db.test.ts)
TEST_DATABASE_URL=$U AWS_S3_BUCKET= AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= AI_API_KEY= \
  GOOGLE_GENERATIVE_AI_API_KEY= GROQ_API_KEY= OPENAI_API_KEY= ALERT_WEBHOOK_URL= bun run test:e2e:local
```

Trước khi chạy e2e, xem `uptime`. Nếu load average quá cao thì timeout hàng loạt là do máy, không phải do code. Ghi lại mức load khi báo kết quả.

## Báo cáo

Trả lời bằng tiếng Việt, ngắn, theo thứ tự:

1. **Kết luận chung:** merge được, cần sửa trước khi merge, hay không nên merge. Nói cho từng nhánh.
2. **Danh sách lỗi**, xếp từ nặng đến nhẹ. Mỗi lỗi gồm:
   - mức độ: chặn merge / nên sửa / nhỏ
   - `file:dòng`
   - lỗi là gì, kèm ví dụ cụ thể (input → kết quả sai)
   - cách sửa ngắn nhất
3. **Đã xác minh đúng:** các mục ở A–E đã kiểm và thấy ổn, mỗi mục một dòng.
4. **Kết quả lệnh kiểm tra:** số pass/fail. Lệnh nào không chạy được thì ghi lý do.
5. **Câu hỏi cho Khôi:** những chỗ cần quyết định nghiệp vụ, không phải lỗi code.

Không tự sửa. Khi Khôi duyệt danh sách lỗi, mới sửa theo từng nhánh, mỗi lỗi một commit.
