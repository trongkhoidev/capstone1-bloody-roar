# Prompt cho AGY: sửa theo review PR #21 (`fix/role-flow-e2e`)

Ngày: 2026-11-03. Đây là vòng sửa sau review, không làm thêm việc mới.

## 0. Bối cảnh

- Worktree: `/Users/admin/repos/capstone1-wt/role-flow`, nhánh `fix/role-flow-e2e`, PR #21 vào `main`. Chỉ sửa trong worktree này. Thư mục `/Users/admin/repos/capstone1` chỉ được đọc.
- Phiên trước đã làm theo `docs/plan/AGY_PROMPT_FIX_FLOW_2026-11-03.md` (đọc file đó ở `/Users/admin/repos/capstone1/docs/plan/` nếu cần ngữ cảnh). Có 3 commit:
  - `049fd11`: K1–K4
  - `5284044`: script E2E
  - `4fd0a01`: báo cáo
- Review đã kiểm lại: `bun run typecheck`, `bun run lint` và `bun run --cwd apps/web test` (579 test) đều pass. Logic K1–K4 đúng hướng. Còn 5 mục dưới đây cần sửa.
- Quy tắc: chỉ dùng `bun`, diff nhỏ nhất, không thêm tính năng, không sửa backend, contract hay schema. Không điều khiển trình duyệt.

## 1. Việc cần sửa

### R1. Báo cáo ghi sai mục "API chưa có FE" (bắt buộc)

File `docs/plan/ROLE_FLOW_E2E_2026-11-03.md`, mục 3.3, ghi rằng settlement, dispute, ruling và claim timeout chưa có giao diện. **Ghi như vậy là sai.** Những phần này đã có trên `main`:
- `apps/web/src/components/marketplace/issue-detail-view.tsx`: dòng 81–88 khai báo các action spec (`challengeRuling`, `finalizeRuling`, `claimMissedDeliveryRefund`, `claimReviewTimeout`, `proposeSettlement`, …). Quanh dòng 456 có `prepareRaiseDispute` kèm evidence manifest.
- `apps/web/src/components/admin/admin-view.tsx`: dòng 22 và 118 có `draftRuling`.

Sửa mục 3.3 như sau:
1. Trước khi viết, grep `apps/web/src/components` để chắc từng API thật sự chưa có FE.
2. Liệt kê đúng 11 API mà prompt gốc yêu cầu, ghi rõ API nào đã có FE và API nào chưa:
   `setUserRole`, `revokeSession`, `mySessions`, `myTransactions`, `adminLogs`, `aiLogs`, `editMessage`, `deleteMessage`, `createTestCase`, `deleteTestCase`, `unlinkGithub`
3. Xoá các khuyến nghị "mở PR FE cho settlement/dispute/arbiter/timeout".

### R2. Form sửa bài luôn gửi bounty (nên sửa)

Ở `issue-detail-view.tsx`, hàm `updateTask` (khoảng dòng 378–397) luôn gửi đủ `title`, `description`, `category`, `bountyAmount`. Backend (`graphql/modules/issue/issue.module.ts`, `updateIssue`) chạy `assertBountyRange` mỗi khi có `bountyAmount`. Vì vậy chỉ sửa tiêu đề mà bounty cũ nằm ngoài giới hạn hiện tại thì cả lần sửa bị từ chối.

Sửa: chỉ đưa vào `input` những field khác với giá trị đang có trên `issue`. `id` thì luôn gửi.

### R3. Effect `myApplications` chạy lại sau mỗi lần reload issue (nên sửa)

Effect tải `MY_APPLICATIONS_QUERY` (khoảng dòng 215–227) có `issue` trong deps. Mỗi lần `load()` chạy, effect lại tải toàn bộ đơn của dev, mà query này không giới hạn số đơn.

Sửa: bỏ `issue` khỏi deps, chỉ giữ `[user, isClient, isAdmin, issueId]`. Hàm `apply` đã tự tải lại `myApplications` sau khi nộp. Hàm `withdraw` đặt `setMyApplication(null)` nên form apply hiện lại. Hai hàm này giữ nguyên.

### R4. Tải lại hai lần trong `reject` (nên sửa)

Trong `reject`, sau `await load()` có đoạn fetch `APPLICATIONS_QUERY` thủ công. Đoạn này thừa, vì effect tải applications (deps `[isClient, issue, issueId]`) đã tự chạy lại khi `issue` đổi. Xoá đoạn fetch thủ công.

Trước khi xoá, kiểm lại deps của effect đó. Nếu deps không chứa `issue` thì giữ nguyên đoạn này và ghi lại lý do.

### R5. S7 khẳng định "admin đọc được chat" nhưng không có tin nhắn nào (tuỳ chọn, làm nếu nhỏ)

`apps/web/scripts/e2e-role-flows.ts` khoảng dòng 940 chỉ kiểm query `messages` không lỗi. Script chưa gửi tin nào, nên kết quả rỗng vẫn PASS.

Cách sửa nhỏ nhất:
1. Trong S7, trước bước admin đọc, cho client hoặc dev gửi 1 tin bằng mutation gửi tin đang có trong schema. Grep `sendMessage` trong `graphql/modules`.
2. Kiểm admin thấy đúng tin đó.

Nếu phải dựng socket hoặc thêm hơn khoảng 15 dòng thì bỏ R5. Khi đó sửa câu trong báo cáo thành "admin query được messages (chưa kiểm nội dung)".

## 2. Kiểm tra

```bash
cd /Users/admin/repos/capstone1-wt/role-flow
bun run typecheck
bun run lint
bun run --cwd apps/web test
```

Tất cả phải pass.

Nếu sửa R5 và muốn chạy lại E2E: làm theo mục 4 của báo cáo, dùng DB `bloodyroar_e2e`, port 4100 và `.env.e2e`. Không đụng server port 4000 hay DB gốc. Nếu không dựng lại được môi trường thì ghi rõ trong báo cáo là R5 chưa chạy lại được. Không được ghi PASS khi chưa chạy.

## 3. Giao

- Một commit `fix(ui): review fixes for issue edit and application refetch` cho R2–R4. Một commit `docs: correct role-flow report` cho R1 (và R5 nếu làm).
- Push lên `fix/role-flow-e2e` để cập nhật PR #21. Không mở PR mới, không merge.
- Cuối báo cáo thêm mục "Vòng review 2026-11-03": mỗi mục R1–R5 ghi đã sửa hay bỏ qua, kèm lý do.
- Tắt mọi process mình đã bật. Không xoá worktree, nhánh hay DB.
