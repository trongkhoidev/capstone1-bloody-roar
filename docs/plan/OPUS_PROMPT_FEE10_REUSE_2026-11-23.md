Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo). Đọc `AGENTS.md`, `CLAUDE.md` và mục QĐ-33 trong `docs/management/MEETING_MINUTES.md` trước khi làm.

Việc gồm ba phần, làm theo thứ tự: A (chốt thay đổi phí 10% đã code xong), B (US-107), C (US-108). Mỗi phần một nhánh, mỗi bước một commit, message có key Jira nếu có.

## Quy tắc chung

- Chỉ dùng `bun`. Không dùng npm hoặc pnpm.
- Trong repo có `.codegraph/`. Dùng `codegraph explore "<symbol>"` trước khi grep hoặc đọc file.
- Viết diff ngắn nhất. Dùng lại helper có sẵn. Không thêm abstraction, config hay tính năng không được yêu cầu.
- Logic về quyền và tiền: viết test đỏ trước, rồi sửa cho xanh.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn thì ghi `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- `.env` trỏ tới **Supabase thật**. Không sửa `.env`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate:prod`. Không chạy app hay test nào ghi vào Supabase.
- Test DB local: container `bloody_roar_postgres`, cổng `5433`. Lấy mật khẩu bằng `docker exec bloody_roar_postgres printenv POSTGRES_PASSWORD` rồi đặt vào `TEST_DATABASE_URL` khi chạy. Không ghi mật khẩu vào file nào. Migration mới chỉ áp vào DB local, bằng `bun run db:migrate`.
- Mọi lời gọi AI đi qua `scanAndMask`, `aiRateLimit` (`apps/web/src/lib/rate-limit.ts`) và `apps/web/src/ai/model-router.ts`. `AILog` chỉ lưu HMAC.
- Trước khi báo xong một phần: `bun run typecheck`, `bun run lint`, `bun run --cwd apps/web test`, `bun run --cwd apps/worker test`. Phần nào đụng contract thì chạy thêm `bun run --cwd apps/contracts test` và `bun run --cwd apps/contracts test:fuzz`.
- Không push và không mở PR. Báo lại tên nhánh và danh sách commit.

---

## Phần A: Chốt thay đổi phí 10% (QĐ-33)

### Bối cảnh

Phí nền tảng đổi từ 2,5% (trừ vào tiền dev) sang 10%, do client trả thêm trên bounty. Bounty 100 USDC thì client nạp 110, dev nhận đủ 100, nền tảng nhận 10. Phí chỉ tính trên phần của dev. Phần phí đã nạp mà không dùng tới (khi chia tiền hoặc hoàn tiền) trả lại client.

| Kết cục | Client nhận | Dev nhận | Phí |
|---|---|---|---|
| Release / review timeout | 0 | 100 | 10 |
| Missed-delivery refund | 110 | 0 | 0 |
| Settlement / ruling 50/50 | 55 | 50 | 5 |

Phần code đã viết xong nhưng chưa commit. Nó nằm trên nhánh `fix/ui-bugs-and-page-speed`, lẫn với việc dở của task thirdweb.

### A1. Tách ra nhánh riêng

Tạo nhánh `feat/platform-fee-10` từ `HEAD` hiện tại. Chỉ commit **đúng các file dưới đây**. Không stage, revert hay format lại file nào khác: các file `.env.example`, `AGENTS.md`, `apps/web/src/lib/web3/*`, `apps/web/src/components/auth/*`, `apps/web/src/lib/store/use-auth-store.ts`, `apps/web/next.config.mjs`, `apps/web/package.json`, `bun.lock`, `scripts/demo/local-up.sh` và test của thirdweb là của việc khác.

Nhóm file theo commit:

1. **`feat(contracts): charge a 10% platform fee on top of the bounty`**
   - `apps/contracts/contracts/BloodyRoarEscrow.sol`
   - `apps/contracts/test/BloodyRoarEscrow.test.ts`
   - `apps/contracts/test/foundry/BloodyRoarEscrow.t.sol`
2. **`feat(web): client deposits bounty plus fee, developer gets the full bounty`**
   - `packages/shared/src/money.ts`, `packages/shared/src/constants/index.ts`, `packages/shared/src/escrow/constants.ts`, `packages/shared/src/escrow/fold.ts`
   - `apps/web/src/graphql/modules/escrow/intent.module.ts`
   - `apps/web/src/components/marketplace/issue-detail-view.tsx`, `apps/web/src/app/guide/page.tsx`
   - `apps/web/src/lib/escrow/amounts.ts` (xoá `calculatePayout`)
   - Test: `apps/web/src/test/escrow-amounts.test.ts`, `apps/web/src/test/escrow-core/fold.test.ts`, `apps/web/src/test/escrow-core/money.test.ts`, `apps/web/src/test/escrow-deposit.test.ts`, `apps/worker/test/review-window.test.ts`
   - `packages/database/src/seed-demo.ts`, `apps/web/scripts/e2e-role-flows.ts`
   - `tests/e2e/harness/funding.ts` và các file `tests/e2e/e05`, `e10`, `e12`, `e13`, `e14`, `e15`, `e16`, `e17`, `e31`, `http-flow`
3. **`docs: record QĐ-33 (10% client-paid fee) and role-based rates`**
   - `docs/management/MEETING_MINUTES.md`, `docs/PROPOSAL.md`, `docs/PROJECT_SPRINT_PLAN.md`, `docs/PRODUCT_BACKLOG.md`, cùng file prompt này

Trước mỗi commit, chạy `git diff --cached --stat` để chắc chỉ có các file trên được stage.

### A2. Rà lại

Đọc diff của commit 1 và 2, kiểm theo danh sách sau và sửa nếu sai:

- `_resolve`: tổng `clientAmount + developerAmount + platformFee` phải bằng `amount + _depositFee(amount)` ở mọi `clientBps`, và phải bằng đúng số `totalUnresolvedPrincipal` trừ đi.
- `platformFee <= depositFee` ở mọi trường hợp, nên không thể underflow.
- `splitPayout` trong `packages/shared/src/money.ts` cho ra đúng số như contract. Thêm một test so hai bên bằng cùng một bảng giá trị nếu chưa có.
- `prepareEscrowDeposit` kiểm số dư và approve theo `depositTotal`, nhưng `deposit(amount)` vẫn truyền bounty, và `FundingIntent` (EIP-712) vẫn ký bounty.
- Tìm hết chỗ còn sót số cũ: `grep -rnE "2[.,]5 ?%|97[.,]5|\b250\b" apps packages tests --include='*.ts' --include='*.tsx' --include='*.sol'`. Không sửa `docs/plan/*` có ngày cũ hay `scripts/demo/content/*`: đó là bản ghi cũ và nội dung demo.

### A3. Chạy e2e local

Bộ e2e chưa được chạy sau khi đổi số. Chạy `bun run test:e2e:local` (xem `docs/plan/parallel/LOCAL_TEST_MATRIX.md` và `tests/e2e/run-local.ts`). Lệnh này dựng Hardhat, deploy contract mới và dùng DB local. Sửa test nào còn sai số. Nếu một test fail vì lý do khác phí, ghi lại, đừng sửa lan sang chỗ khác.

Contract không nâng cấp được, nên môi trường nào đang dùng contract cũ phải deploy lại. Việc deploy Base Sepolia thuộc US-102 (Kiên): **không deploy testnet**, chỉ ghi vào báo cáo cuối là contract cần deploy lại.

---

## Phần B: US-107 · S-119, phát hiện issue trùng và báo cho dev cũ

Nhánh `feat/us-107-similar-issue`, tạo từ `feat/platform-fee-10`. Đọc mô tả ticket: `curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/issue/US-107"`.

### Mục tiêu

Khi một bounty được công bố, hệ thống tìm các issue `COMPLETED` cùng bài toán và báo cho dev đã sửa issue đó. Hệ thống chỉ gợi ý; dev tự xác nhận khi ứng tuyển (Phần C).

### Cách làm

**Không dùng pgvector hay embedding**, khác với gợi ý trong mô tả ticket. Lý do: `model-router.ts` chỉ có `completeAI`, không có API embedding, và thêm provider mới là phạm vi lớn. Làm hai tầng:

1. **Lọc ứng viên bằng Postgres.** Dùng full-text (`to_tsvector('simple', title || ' ' || description)` với `websearch_to_tsquery`/`ts_rank`) hoặc `pg_trgm` `similarity()`. Bật extension bằng migration nếu cần; Supabase có sẵn cả hai. Lấy tối đa 5 issue `COMPLETED`, có `developerId`, khác `clientId` với issue mới, có ít nhất một skill chung.
2. **Xác nhận bằng AI.** Gửi issue mới và các ứng viên qua `completeAI` (workload phù hợp trong `AIWorkload`). AI trả JSON `{ matches: [{ issueId, score, reason }] }`, kiểm bằng Zod. Chỉ giữ `score >= 0.8` (đặt hằng số trong code kèm comment vì sao). AI lỗi, không được cấu hình (`isAIConfigured`) hoặc trả sai schema thì **bỏ qua bước gợi ý, không chặn việc công bố**.

**Nơi gọi:** chỗ issue chuyển sang công bố (`createIssue` khi không phải nháp, khoảng `apps/web/src/graphql/modules/issue/issue.module.ts:651`, và `publishIssue` nếu US-99 đã merge). Chạy sau khi transaction công bố commit xong, không chạy trong transaction, để AI chậm không giữ lock và không làm chậm phản hồi. Nếu worker đã có job table phù hợp (`apps/worker`, QĐ-10) thì đẩy vào đó; nếu không thì gọi kiểu fire-and-forget có `catch` ghi log.

**Lưu kết quả:**
- Thêm bảng `IssueSimilarity` (`issueId`, `similarIssueId`, `developerId`, `score`, `createdAt`, unique theo `issueId` + `similarIssueId`). Phần C cần bảng này để kiểm quyền.
- Thêm `SIMILAR_ISSUE_POSTED` vào enum `NotificationType`.
- Gửi notification bằng `apps/web/src/lib/services/notifications.ts`, `dedupeKey` = `similar:<issueId>:<similarIssueId>`. Link tới issue mới, và chỉ nói "giống issue bạn đã sửa" kèm tiêu đề issue cũ. Không lộ nội dung khác của client cũ.

**FE:** `NotificationsMenu` hiển thị loại mới. Trên trang issue mới, chỉ dev có dòng trong `IssueSimilarity` mới thấy nhãn "Bạn đã sửa một bài toán tương tự". Kiểm quyền ở backend: thêm field vào `viewerCapabilities` theo QĐ-13, không lọc ở client.

### Xong khi

- Có test cho: ứng viên đúng được chọn; issue khác hẳn không có notification; AI lỗi hoặc sai schema thì issue vẫn được công bố và không có notification; dev khác không thấy nhãn; không gửi trùng notification.
- Có migration mới, đã áp vào DB local.
- Nhãn ở FE có test trong `apps/web/src/test/`.

---

## Phần C: US-108 · S-120, giá tái sử dụng (dev nhận 50%)

Nhánh `feat/us-108-reuse-price`, tạo từ `feat/us-107-similar-issue`. Đọc ticket US-108.

### Quy tắc đã chốt

- Dev là người đã sửa issue cũ (có dòng trong `IssueSimilarity` với issue mới) được ứng tuyển theo **giá tái sử dụng = 50% bounty của issue mới**.
- Client nạp 50% bounty cộng 10% phí của phần đó. Bounty 100 thì client nạp 55, dev nhận 50, nền tảng nhận 5. Không cần sửa contract: `deposit` nhận số tiền bất kỳ và tự cộng phí.
- Client có thể từ chối đơn tái sử dụng và chọn dev khác với giá đầy đủ.

### Ba câu chưa chốt

Ticket còn ghi ba câu: giá cố định 50% hay cho đề nghị thấp hơn; có ưu tiên dev cũ 24 giờ không; client có được từ chối không. Làm theo mặc định sau:

- Giá cố định 50%.
- Không có khoảng ưu tiên.
- Client được từ chối.

Ghi các mặc định này vào báo cáo cuối để Khôi xác nhận.

### Cách làm

- **`Application`:** thêm `reuseOfIssueId String?` (quan hệ tới `Issue`). Giá tính từ bounty lúc chọn dev, không lưu số tiền vào đơn, để không lệch khi client sửa bounty.
- **Mutation ứng tuyển** (`apps/web/src/graphql/modules/application/application.module.ts`): nhận `reuseOfIssueId` tuỳ chọn. Từ chối với mã lỗi rõ ràng nếu người gọi không phải `developerId` của issue đó, issue đó không `COMPLETED`, hoặc không có dòng `IssueSimilarity` tương ứng. Test quyền viết trước.
- **`selectDeveloper`** (`apps/web/src/graphql/modules/escrow/select.module.ts`, khoảng dòng 104 và 184): nếu đơn có `reuseOfIssueId` thì `amountRaw = bpsOf(bountyRaw, 5_000)`, đặt hằng `REUSE_PRICE_BPS = 5_000` trong `packages/shared/src/constants/index.ts`. Đưa `amountRaw` này và `reuseOfIssueId` vào `reservationTermsHash`, để chữ ký EIP-712 và `termsHash` cam kết đúng giá đã giảm. Chỗ nào tính lại hash (worker, `fold`, `HashVectors.t.sol`) cũng phải khớp. Chạy `bun run --cwd apps/contracts test:fuzz` để kiểm vector hash.
- **Worker:** khớp deposit theo `reservation.amountRaw` như hiện tại. Kiểm lại rằng deposit 50 cho reservation 50 được nhận, còn 100 thì bị đánh `DEPOSIT_MISMATCHED`.
- **FE:**
  - Form ứng tuyển có ô chọn "Tái sử dụng bản sửa của issue …", chỉ hiện khi `viewerCapabilities` cho phép.
  - Trang duyệt đơn của client hiện giá gốc, giá tái sử dụng, và số phải nạp (dùng `depositTotal`).
  - Trang issue sau khi chọn dev hiện đúng số đã giảm. Hiện `issue-detail-view.tsx` tính từ `issue.bountyRaw`, nên phải đọc số tiền từ reservation hoặc escrow khi có.
- **Điều khoản:** thêm một dòng vào nội dung điều khoản bounty mà client đồng ý khi công bố: dev giữ quyền tái sử dụng bản sửa của mình (giấy phép không độc quyền). Tìm chỗ hiển thị điều khoản hiện có và dùng lại.

### Xong khi

- Test đơn vị: tính giá, kiểm quyền ứng tuyển, `termsHash` thay đổi khi giá thay đổi.
- Thêm một e2e local trong `tests/e2e/` theo mẫu `e31-flow.test.ts`: dev cũ ứng tuyển theo giá tái sử dụng, client chọn, ví client giảm đúng 55 USDC cho bounty 100, release xong dev claim được 50, fee recipient claim được 5.
- Bộ test ẩn của issue mới vẫn là cổng nghiệm thu như bình thường. Không bỏ qua test runner hay gate nộp bài.

---

## Báo cáo cuối

Trả lời bằng tiếng Việt, ngắn:

1. Tên nhánh và danh sách commit của từng phần.
2. Kết quả từng lệnh kiểm tra, có số test pass/fail. Lệnh nào không chạy được thì ghi rõ lý do.
3. Chỗ nào làm khác prompt này, và vì sao.
4. Các mặc định ở Phần C cần Khôi xác nhận.
5. Việc còn lại: deploy lại contract (US-102), xuất lại PDF của Proposal, cập nhật trạng thái US-107 và US-108 trên Jira. Chỉ ghi ra, không tự chuyển trạng thái.
