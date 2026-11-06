# Prompt cho AGY: dọn code thừa, nối chỗ thiếu, sửa lỗi luồng

Ngày: 2026-11-05. Đọc hết rồi mới làm. Làm theo thứ tự P0 → P1 → P2.

Mục tiêu: chạy `bash scripts/demo/local-up.sh` là demo được trọn luồng ở `http://localhost:4000`, không có link chết, không có code chết, không có nút bấm mà lỗi.

---

## 0. Bối cảnh (đã kiểm ngày 2026-11-05)

- Repo `/Users/admin/repos/capstone1`. Tạo nhánh `fix/cleanup-demo-flow` từ nhánh hiện tại `chore/demo-data-local`.
- Các file `docs/plan/*` chưa track: không commit.
- **Quyết định đã chốt, không bàn lại:** client và developer **cùng quyền**. `CLIENT`/`DEVELOPER` trong `UserRole` chỉ là nhãn để phân biệt. Quyền trên một issue tính theo quan hệ: `issue.clientId === user.id` (chủ bài) hoặc `issue.developerId === user.id` (dev được chọn). Chỉ `ADMIN` có quyền riêng. Không đổi schema, không xoá enum.
- **Đã sửa sẵn, chưa commit. Giữ nguyên và commit chung:**
  - `apps/web/src/graphql/modules/ai/ai.module.ts`: bỏ check `CLIENT_ROLE_REQUIRED` ở `generateTestCases`, chỉ còn check chủ bài.
  - `apps/web/src/components/profile/profile-view.tsx:119`: mục chứng chỉ hiện cho mọi user không phải admin.
  - `apps/web/scripts/smoke-roles.ts`: giờ mong DEVELOPER cũng tạo được bài.
  - `scripts/demo/local-up.sh`: script mới, tắt/dựng lại Hardhat, worker và web.
- **Môi trường:** AI chưa cấu hình (`AI_API_KEY`, `OPENAI_API_KEY`, `AI_BASE_URL` đều rỗng), nên `generateTestCases` luôn trả `AI_UNAVAILABLE`. S3 và GitHub OAuth cũng chưa có. Không cấu hình thêm mấy thứ này.
- Luật dự án (`AGENTS.md`): chỉ dùng `bun`, giữ diff nhỏ nhất, kiểm bằng CLI (không điều khiển trình duyệt), chạy `bun run typecheck` và `bun run lint` trước khi commit.

## 1. Luật

1. Không sửa `apps/contracts/contracts/*.sol`, không thêm migration.
2. Không đụng DB dùng chung: không `migrate reset`, `db push`, `TRUNCATE`, `deleteMany`.
3. Trước khi xoá một file, phải grep lại để chắc không còn import nào. Lệnh kiểm có ở §5.
4. Thêm UI thì dùng lại component và kiểu viết đang có trong file đó. Không thêm thư viện.
5. Mỗi mục một commit, message dạng `fix(ui): …` hoặc `chore: …`.

---

## 2. P0: chặn luồng demo

### P0-1. Không có cách tạo tiêu chí kiểm thử khi AI tắt
- **Lỗi:** `components/issues/test-case-panel.tsx` chỉ gọi `generateTestCases` và `updateTestCase`, không có nút tạo tay. AI đang tắt nên mọi bài đều không có tiêu chí. Khi đó `selectDeveloper` trả `NO_APPROVED_CRITERIA`, nghĩa là **không chọn được dev, toàn bộ luồng escrow bị chặn trên UI**.
- **Sửa:** thêm vào panel một form nhỏ (mô tả, độ ưu tiên) gọi mutation `createTestCase`, và nút xoá gọi `deleteTestCase`. Cả hai mutation đã có ở backend. Chỉ chủ bài thấy được, và chỉ khi issue còn `OPEN`, giống điều kiện của nút Generate. Khi gặp `AI_UNAVAILABLE` thì báo "AI chưa bật, hãy thêm tiêu chí thủ công" thay vì báo lỗi chung.
- **Nghiệm thu:** script CLI dùng 1 ví ngẫu nhiên tạo bài → `createTestCase` → `updateTestCase(isApproved: true)` → ví thứ 2 apply → `selectDeveloper` thành công.

### P0-2. Link ở sidebar dẫn vào chỗ không có gì
`components/layout/left-sidebar.tsx`:

| Dòng | Link | Hiện trạng | Sửa |
|---|---|---|---|
| 47 | `/dashboard?tab=bounties` | `dashboard-view.tsx:46` khởi tạo `useState<Tab>("all")`, không đọc query | Đọc `useSearchParams().get("tab")`, map `bounties` → `posted` |
| 62 | `/dashboard?tab=messages` | Không có inbox. Chat chỉ có trong từng issue | Map sang `working` (các task đang làm, có chat), hoặc bỏ link. Chọn cách ngắn hơn |
| 70 | `/dashboard?tab=notifications` | Thông báo đã có ở `NotificationsMenu` trên navbar | Bỏ link |
| 78 | `/dashboard?tab=wallet` | Dashboard đã có phần claim (`claimFunds`, `dashboard-view.tsx:62`) nhưng link không cuộn tới | Đặt `id="wallet"` cho khối claim, link đổi thành `/dashboard#wallet` |
| 85 | `/settings` | Không có `app/settings/page.tsx` | Đổi thành `/profile` |
| 24, 31 | `/marketplace?view=skills\|developers` | `app/marketplace/page.tsx` không truyền query vào `MarketplaceView` | Bỏ 2 link này ở cả sidebar và `Navbar.tsx:48,54` (chưa có màn danh sách dev/skill). Không dựng màn mới |

- Active state đang dùng `pathname.includes("tab=…")`, nhưng `pathname` không bao giờ chứa query nên highlight không chạy. Sửa cùng lúc bằng `useSearchParams`.
- `home-page-view.tsx:155,353` có link `/marketplace?skills=…` cũng không được đọc. Cho `app/marketplace/page.tsx` nhận `searchParams.skills`/`search` rồi truyền `initialSearch`, hoặc đổi link thành `/marketplace`.
- Anchor `/#rules` (`home-page-view.tsx:359-361`, `connect-modal.tsx:263`) và `/#escrow-rules` (`Navbar.tsx:60`) không trỏ tới phần tử nào có `id`. Đặt `id="rules"` cho section "Escrow rules" (`home-page-view.tsx:315`), rồi đổi `escrow-rules` → `rules`.

---

## 3. P1: code thừa cần xoá

Đã kiểm: các file dưới đây không còn module nào import (kể cả từ `apps/worker` và `scripts/`).

| File | Ghi chú |
|---|---|
| `apps/web/src/components/ui/tabs.tsx` | chỉ file này dùng `@radix-ui/react-tabs` |
| `apps/web/src/components/ui/avatar.tsx` | chỉ file này dùng `@radix-ui/react-avatar` |
| `apps/web/src/components/ui/dropdown-menu.tsx` | chỉ file này dùng `@radix-ui/react-dropdown-menu` |
| `apps/web/src/components/ui/moving-border.tsx` | chỉ file này dùng `framer-motion` |
| `apps/web/src/components/ui/dialog.tsx` | `@radix-ui/react-dialog` **vẫn được `sheet.tsx` dùng**, giữ dependency |
| `apps/web/src/components/marketplace/right-rail.tsx` | từng có ticker giao dịch giả |
| `apps/web/src/components/marketplace/marketplace-skeleton.tsx` | |
| `apps/web/src/components/marketplace/task-card.tsx` | |

- Xoá các file trên, rồi `bun remove --cwd apps/web @radix-ui/react-tabs @radix-ui/react-avatar @radix-ui/react-dropdown-menu framer-motion`, **sau khi** grep lại toàn repo không còn chỗ nào dùng.
- Nếu `components/ui/index.ts` hoặc file barrel nào đó re-export các component này thì bỏ luôn dòng export. Danh sách export trong codebase map (`Avatar`, `Dialog`, `DropdownMenu`, `Tabs`, `TaskCard`…) sẽ thu lại tương ứng.
- Test nào import file bị xoá (ví dụ `src/test/*task-card*`) thì xoá theo. Không viết test mới cho code đã xoá.

## 4. P1/P2: logic còn lệch

| # | Chỗ | Lỗi | Sửa |
|---|---|---|---|
| L1 | Chat (`MESSAGE_RECEIVED` có trong enum) | Không chỗ nào phát thông báo khi có tin nhắn. Người kia không biết có tin mới | Trong handler `message:send` (`apps/web/src/socket/handlers.ts`), sau khi lưu tin thì tạo 1 notification `MESSAGE_RECEIVED` cho bên còn lại. Gộp theo issue: nếu đã có thông báo chưa đọc cùng issue thì không tạo thêm |
| L2 | `issue-comments.tsx:85` | Badge ghi "Client"/"Developer" theo `user.role`. Vì quyền như nhau nên nhãn này dễ hiểu sai | `IssueComments` hiện chỉ nhận `issueId`. Thêm prop `ownerId` (truyền `issue.clientId` từ `issue-detail-view`), hiện "Owner" khi `comment.user.id === ownerId`, ngoài ra không hiện badge. Admin vẫn hiện "Admin" |
| L3 | `profile-view.tsx:108` | Ô chọn `accountRole` vẫn hiện như thể đổi quyền | Giữ ô chọn, đổi label thành "Nhãn hiển thị", thêm 1 dòng chú thích "Không ảnh hưởng quyền" |
| L4 | `issue-detail-view.tsx:1041,1046,1079,1260` | Hard-code 97.5%, 2.5%, 7 ngày | Các số này **khớp** hằng số trong contract (`PLATFORM_FEE_BPS = 250`, `REVIEW_PERIOD = 7 days`), không phải lỗi. Chỉ xem lại token: nếu chỗ nào ghi cứng "USDC" thì lấy `issue.token.symbol` (local là `mUSDC`) |
| L5 | API có backend nhưng chưa có FE | `editMessage`, `deleteMessage`, `mySessions`, `revokeSession`, `myTransactions`, `adminLogs`, `aiLogs`, `setUserRole`, `unlinkGithub` | **Không làm trong đợt này.** Chỉ liệt kê trong báo cáo. Riêng `createTestCase`/`deleteTestCase` đã làm ở P0-1 |

## 5. Kiểm tra

```bash
# file nào không còn ai import (chạy trước và sau khi xoá)
cd apps/web/src && for f in $(find components lib -name '*.ts*' ! -name '*.test.*'); do b=$(basename "$f"); b=${b%.tsx}; b=${b%.ts}; grep -rqE "/$b['\"]" --include='*.ts' --include='*.tsx' . ../../worker/src ../../../scripts || echo "UNUSED $f"; done; cd -

bun run typecheck && bun run lint
bun run --cwd apps/web test
bash scripts/demo/local-up.sh
# role smoke và e2e role flow trên chain local mới
BASE_URL=http://localhost:4000 bun run apps/web/scripts/smoke-roles.ts
BASE_URL=http://localhost:4000 bun run apps/web/scripts/e2e-role-flows.ts
# không còn link chết
for u in / /marketplace /dashboard /profile /issues/create; do curl -s -o /dev/null -w "$u %{http_code}\n" localhost:4000$u; done
```

Lưu ý: port 4000 dùng DB Supabase chung, nên `smoke-roles` và `e2e-role-flows` sẽ tạo bài test mà cả team đều thấy. Chỉ chạy **một lần** sau khi sửa xong, rồi ghi id các bài đã tạo vào báo cáo. Không viết bước xoá.

Lệnh `find` ở trên phải không in ra dòng nào. `smoke-roles` và `e2e-role-flows` phải PASS hết. Nếu script E2E vẫn check `role === "CLIENT"` ở bước SETUP (`e2e-role-flows.ts:306-308`) thì bỏ 3 check đó, vì role giờ không quyết định quyền.

## 6. Báo cáo

Ghi vào `docs/plan/CLEANUP_FIX_2026-11-05.md`:
- Bảng từng mục P0-1, P0-2, P1, L1–L4: đã làm / bỏ qua kèm lý do, commit hash.
- Danh sách file đã xoá và dependency đã gỡ.
- Kết quả typecheck, lint, test, smoke, e2e (dán dòng tóm tắt).
- Danh sách L5 còn để lại.

Không mở PR. Không push. Chờ người dùng xem.
