Bạn đang làm việc trong repo `/Users/admin/repos/capstone1` (Bun monorepo). Đọc `AGENTS.md` và `docs/plan/PERF_SLOW_PAGES.md` trước khi làm.

Tạo nhánh mới `fix/ui-bugs-and-page-speed` từ `origin/main` (`9d5fc0d`). Mỗi task là một commit riêng, theo dạng `fix(web): ...` hoặc `perf(web): ...`, kèm key Jira nếu có.

## Quy tắc chung

- Chỉ dùng `bun`. Không dùng npm hoặc pnpm.
- Working tree đang có `AGENTS.md`, `scripts/demo/local-up.sh` và vài file trong `docs/` chưa commit, không thuộc việc này. Không commit, không revert, không format lại các file đó.
- Viết diff ngắn nhất. Không thêm abstraction, config hay tính năng không được yêu cầu. Dùng lại helper có sẵn.
- Logic về quyền và tiền: viết test đỏ trước, rồi sửa cho xanh.
- Comment chỉ ghi "vì sao". Shortcut có giới hạn thì ghi `// shortcut: <giới hạn>, <khi nào nâng cấp>`.
- `.env` trỏ tới **Supabase thật**. Không sửa `.env`. Không chạy `db:reset`, `db:push`, `db:seed*`, `db:migrate*`. Không chạy app hay test nào ghi vào Supabase.
- Test DB local: container `bloody_roar_postgres`, cổng `5433`, database `bloody_e2e_plan_test`. Lấy mật khẩu bằng `docker exec bloody_roar_postgres printenv POSTGRES_PASSWORD`, đặt vào `TEST_DATABASE_URL` khi chạy. Không ghi mật khẩu vào file nào.
- Batch này không đổi Prisma schema.

---

## Phần A: Bug tìm được khi chạy walkthrough UI theo từng role (23/11)

### A1 (P0): Admin không ra phán quyết tranh chấp được trên UI

Lỗi ở `apps/web/src/components/admin/admin-view.tsx:232`:

```ts
const canDraft = ["DISPUTED", "CHALLENGED", "INITIAL_RULING"].includes(dispute.status);
```

`dispute.status` có kiểu `DisputeStatus` (`OPEN | ANALYZING | PROPOSED | RESOLVED | CHALLENGED | FINAL_RULING`), không phải phase của escrow. Vì vậy với tranh chấp `OPEN`, form "Draft ruling" không bao giờ hiện. Đã tái hiện được: tranh chấp mở bằng UI, `/admin` hiện "Dispute · OPEN" nhưng không có form.

Quy tắc ở backend (`apps/web/src/graphql/modules/dispute/ruling.module.ts`, `draftRuling`) dựa trên `escrowProjection`:
- `INITIAL` chỉ hợp lệ khi `projection.phase === "DISPUTED"`, và chỉ sau `disputeRaisedAt + DISPUTE_EVIDENCE_RESPONSE_HOURS` (72 giờ).
- `FINAL` chỉ hợp lệ khi `projection.phase === "CHALLENGED"`, tính từ `challengedAt`.
- Cả hai đều phải trước mốc `ARBITER_STALL_DAYS`.

Cần sửa:
1. Query `adminDisputes` (`apps/web/src/graphql/modules/dispute/dispute.module.ts:89`) trả thêm `escrowPhase` và thời điểm mở cửa sổ phán quyết, cùng mốc thời gian mà resolver đang dùng. Lấy từ `escrowProjection` của issue. Không tự tạo quy tắc mới.
2. UI: hiện form khi phase là `DISPUTED` hoặc `CHALLENGED`, và tự chọn `kind` theo phase (`INITIAL` hoặc `FINAL`), bỏ select tự do. Nếu chưa tới giờ mở cửa sổ, hiện "Ruling window opens at <thời gian>" và khóa nút.
3. Test: một tranh chấp ở phase `DISPUTED` thì form hiện với `INITIAL`, ở phase `CHALLENGED` thì hiện với `FINAL`, còn các phase khác thì không hiện form.

### A2 (P1, US-86): Thiếu UI "Check my scope"

Backend đã có mutation `checkIssueScope(issueId)` (`apps/web/src/graphql/modules/ai/ai.module.ts:117`). Mutation trả về `status`, `ambiguities[]`, `openQuestions[]`, `difficulty`, và chỉ owner gọi được. Phía UI chưa có chỗ nào gọi.

Mutation cần `issueId`, nên đặt nút ở trang issue, không đặt ở form tạo bounty. Chỉ owner thấy nút, và chỉ khi issue còn `OPEN`. Đặt cạnh nút "Generate with AI" trong `apps/web/src/components/issues/test-case-panel.tsx`. Hiện hai danh sách kết quả và độ khó. Khi `status === "AI_UNAVAILABLE"` thì báo "AI is unavailable, try again later". Thêm một test component.

### A3 (P2): Nút giả trên form đăng bounty

`apps/web/src/components/issues/create-issue-form.tsx`: hai nút "Save draft" (dòng ~249) và "Save as draft" (dòng ~565) không có handler, và nhãn "Draft ready" là chữ cứng. Xóa cả ba. Tính năng nháp thuộc US-99 và US-42 (Sprint 8), đừng làm ở đây.

### A4 (P2): Dashboard, tab "All work" không có đơn ứng tuyển

`apps/web/src/components/dashboard/dashboard-view.tsx:98-101`: tab `all` chỉ lọc `myIssues`. Developer có 2 đơn thì ô thống kê ghi "Applications 2" mà danh sách lại báo "No tasks here yet". Sửa để tab `all` hiện cả đơn ứng tuyển, dùng lại markup của tab `applications`, không viết lại. Thêm test.

### A5 (P2): Client thấy bản nộp DRAFT của developer

Query `submissions` (`apps/web/src/graphql/modules/submission/submission.module.ts:~63`) trả mọi status cho client. Client thấy "Delivery v1 DRAFT" trước khi developer submit on-chain. Với viewer là client, lọc bỏ `status: "DRAFT"`. Developer và admin vẫn thấy như cũ. Thêm test quyền.

---

## Phần B: Trang tải chậm khi dùng Supabase

### Số đo hiện tại (23/11)

- Gọi `SELECT 1` từ máy dev tới Supabase pooler (`ap-northeast-2`, cổng 5432): **trung vị 89 ms mỗi lượt**. Kết nối lần đầu mất 908 ms.
- Vì vậy chậm chủ yếu do **số lượt query DB chạy tuần tự**, không phải do query nặng. Mỗi query tuần tự cộng thêm khoảng 90 ms.
- Đã có trên main: auth gộp còn 1 query và có cache 2 giây (`lib/auth.ts`), log query của Prisma đã tắt (bật lại bằng `DEBUG_PRISMA=1`), dev warm 6 route (`server.ts:146`).

### Cách đo (làm trước khi sửa và sau khi sửa)

Không đo trên Supabase. Chạy web với DB local (`TEST_DATABASE_URL`) và `DEBUG_PRISMA=1`, rồi đếm **số query DB** và **số request GraphQL** khi mở các trang `/`, `/marketplace`, `/dashboard`, `/issues/[id]` (với vai client và developer), `/messages`, `/admin`. Ghi bảng trước và sau vào cuối `docs/plan/PERF_SLOW_PAGES.md`, kèm cột "ước tính trên Supabase = số query tuần tự × 90 ms".

### B1: `recordIssueView` chiếm kết nối và xóa cache auth của mọi người

- Mỗi lần mở trang issue, client gọi mutation `recordIssueView` (`apps/web/src/graphql/modules/issue/issue.module.ts:565`). Mutation chạy một interactive transaction gồm BEGIN, 3–4 query rồi COMMIT. Trên Supabase, phần này tốn khoảng 0,5 giây và giữ 1 trong 4–5 kết nối của pool.
- `apps/web/src/app/api/graphql/route.ts:24` gọi `clearAuthCache()` sau **mọi** mutation. Nghĩa là mỗi lượt xem issue sẽ xóa cache auth của tất cả user, và request kế tiếp lại phải tra session từ DB.

Cần sửa:
1. Viết lại `recordIssueView` thành 1 câu SQL (`INSERT ... ON CONFLICT (issueId, userId) DO UPDATE ... WHERE viewedAt <= now() - interval '1 hour' RETURNING ...`), rồi tăng `viewCount` trong cùng câu bằng CTE. Không dùng interactive transaction. Phía client gọi theo kiểu fire-and-forget, không await trước các fetch khác. Giữ nguyên quy tắc: lượt xem không tính quá 1 lần mỗi giờ cho mỗi user, và draft chỉ owner xem được. Viết test cho cả hai quy tắc.
2. Chỉ gọi `clearAuthCache()` cho những mutation đổi dữ liệu `User` hoặc `Session` (ban, unban, đổi role, cập nhật profile, logout…). Liệt kê rõ danh sách và viết test: ban user thì request sau bị từ chối ngay. Sau đó tăng `AUTH_CACHE_MS` từ 2 giây lên 30 giây.

### B2: Trang issue gọi khoảng 6 request lúc tải

`apps/web/src/components/marketplace/issue-detail-view.tsx` có các `useEffect` riêng gọi `ISSUE_QUERY`, `RESERVATION_QUERY`, `APPLICATIONS_QUERY`, `MY_APPLICATIONS_QUERY`, `SUBMISSIONS_QUERY` và `UNREAD_QUERY` (dòng 174–296). Gộp 5 query đầu thành **một document GraphQL** gửi một lần lúc tải, resolver trong cùng document chạy song song và dùng chung một lần auth. Giữ `UNREAD_QUERY` riêng vì nó poll. Các chỗ refresh sau mutation (`SUBMISSIONS_QUERY` ở dòng 339 và 359, `APPLICATIONS_QUERY` ở dòng 478…) giữ nguyên. Mục tiêu: lúc tải chỉ còn tối đa 2 request GraphQL.

Sau đó bật `DEBUG_PRISMA=1` và xem các field `viewerCapabilities` / `availableActions` của issue. Nếu chúng chạy nhiều query tuần tự cho cùng một issue, gom bằng `Promise.all` hoặc dùng `include`. Chỉ sửa những chỗ log cho thấy là query tuần tự.

### B3: Session được khôi phục theo kiểu waterfall

`apps/web/src/app/providers.tsx:30` chỉ gọi `restoreSession()` sau khi hydrate xong, nên các view phải chờ thêm một vòng request. Cho layout đọc user ở phía server (dùng helper server-side đang có cho `guardRoute`, nếu có) rồi truyền vào `Providers` làm giá trị ban đầu cho auth store. Giữ `restoreSession` làm phương án dự phòng.

### B4: Pool kết nối

`.env` đang có `connection_limit=5`, còn `packages/database/src/index.ts:15` mặc định `DB_POOL_SIZE=4`. Một trang gọi song song 5–6 resolver nên request phải xếp hàng chờ kết nối. Kiểm tra code hiện tại xem tham số nào thắng khi cả hai cùng có. Ghi vào `docs/LOCAL_DEV.md` khuyến nghị dùng `connection_limit=10` với session pooler của Supabase, một tiến trình web. **Không sửa `.env`**, để người dùng tự đổi.

### B5: Dev warm-up thiếu route

`apps/web/server.ts:148` chỉ warm 6 route. Thêm `/messages`, `/admin` và một trang `/issues/<id>` (lấy id đầu tiên từ `issues(first:1)`, nếu không có thì bỏ qua). Trong `docs/LOCAL_DEV.md`, thêm một dòng: khi test tay thì dùng `bun run build && bun run start` để không phải chờ compile từng route.

Không làm ở batch này: `next/font`, bundle analyzer, SSR cho marketplace. Chỉ đề xuất trong bảng đo nếu số đo cho thấy cần.

---

## Kiểm chứng (bắt buộc trước khi báo xong)

```bash
bun run typecheck
bun run lint
bun run --cwd apps/web test
TEST_DATABASE_URL=... bun run test:e2e:local     # phải in "E2E scenarios passed (E1–E34)"
```

Báo lại:
- Danh sách commit.
- Bảng số query và số request GraphQL của từng trang, trước và sau khi sửa.
- Những gì không kiểm được, nêu lý do.
