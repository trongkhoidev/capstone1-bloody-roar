# Prompt giao việc: hoàn tất logic còn thiếu

Dán nguyên phần dưới đường kẻ cho AI code. Chạy trong `/Users/admin/repos/capstone1-wt/integration`.

---

Bạn làm tiếp backend và phần nối frontend của dự án BloodyRoar trên nhánh `be/integration`, thư mục `/Users/admin/repos/capstone1-wt/integration`. Mục tiêu: hoàn tất toàn bộ logic còn thiếu cho đến khi `bun run test:e2e:local` và gate đầy đủ đều xanh.

## Đọc trước khi làm, theo thứ tự

1. `docs/plan/parallel/FINISH_PLAN.md`: kế hoạch chính và mọi quyết định đã chốt. Khi có mâu thuẫn, file này thắng.
2. `docs/plan/parallel/DECISIONS.md`: quy tắc DB, port, môi trường.
3. `docs/plan/parallel/LOCAL_FULL_FLOW_SPEC.md` mục 1, 2, 3, 5, 6: môi trường local, trình tự harness, kịch bản E1–E31, bảng nơi tạo thông báo.
4. `docs/plan/parallel/reports/CODEX.md`: đọc dòng `ĐANG DỞ` ở đầu file, nếu có.
5. `AGENTS.md` và `CLAUDE.md` ở root repo.

Không đọc lại toàn bộ `FIX_LIST.md` hay `BACKEND_REMAINING_TASKS.md`. Chỉ tra khi `FINISH_PLAN.md` trỏ tới một mục cụ thể.

## Cách làm

- Làm đúng thứ tự phase trong `FINISH_PLAN.md` mục 2: 0 → D → G1 → E → F → G2 → FE → H → I.
- Mỗi mục: đọc code liên quan, viết test trước nếu là logic mới (tiền, quyền, mốc thời gian, effect worker), code, chạy `bun run typecheck && bun run lint` và test của mục, commit một commit cho mục đó.
- Cuối mỗi phase: chạy gate ở mục 5 của `FINISH_PLAN.md` (phần `test:e2e:local` chỉ chạy được từ phase G1 trở đi), ghi kết quả vào `CODEX.md` và `LOCAL_TEST_MATRIX.md`.
- Code mới phải theo pattern có sẵn:
  - mutation `prepare*` theo `graphql/modules/escrow/settlement.module.ts`
  - effect theo `apps/worker/src/effects/settlement.ts` (gồm snapshot/undo cho reorg)
  - test DB theo `apps/web/src/test/*.db.test.ts` (gọi `assertTestDatabase` trong `beforeAll`)
- Dùng helper đã có trước khi viết mới: `createPreparedCall`, `escrowTarget`, `readChainTime`, `availableActions`, `rateLimit`, `guardMessage`, `createNotificationIdempotent`, `computeEvidenceManifestHash`, `computeDecisionHash`, `canonicalJson`, `ESCROW_ABI`.
- Biến môi trường test: `TEST_DATABASE_URL` trỏ `bloody_codex_test` trên localhost:5433, lấy user và mật khẩu từ `.env` của worktree. Không in giá trị nào trong `.env`.

## Không được dừng để hỏi

Mọi quyết định đã có trong `FINISH_PLAN.md` mục 3. Gặp chỗ chưa có: chọn theo thứ tự (a) chain là nguồn sự thật, (b) theo pattern có sẵn, (c) diff nhỏ nhất. Ghi vào cuối `DECISIONS.md` dưới tiêu đề `## BỔ SUNG <mã> — <tên>`, kèm một dòng lý do, rồi làm tiếp.

Test đỏ hoặc lỗi môi trường không phải lý do để dừng. Tìm nguyên nhân gốc và sửa. Sau 3 lần thử khác nhau mà vẫn không xong, ghi vào mục "Bị chặn" trong `CODEX.md` (lệnh, lỗi, đã thử gì), rồi làm mục tiếp theo không phụ thuộc vào nó.

## Cấm tuyệt đối

- Ghi, reset hoặc truncate database có tên không kết thúc bằng `_test`. Ngoại lệ duy nhất: `migrate deploy` lên `bloody_codex_local`.
- Đụng port 4000 hoặc process không do bạn khởi động. Chỉ dừng process theo PID trong `tests/e2e/.run/`.
- Gọi dịch vụ thật (S3, AI provider). `check-env` phải pass trước mọi lần chạy E2E.
- In hoặc commit secret, `.env`, `.uploads/`, `deployments/`, `tests/e2e/.run/`.
- `git push`, tạo PR, rewrite lịch sử, xóa nhánh hoặc worktree.
- Thêm dependency ngoài danh sách D-DEP-1.
- Sửa layout hoặc màu của frontend. Phase FE chỉ đổi logic gọi API và nút hành động.
- Đánh dấu một mục là xong khi chưa chạy lệnh kiểm tra của mục đó.

## Báo cáo

- Mỗi commit: thêm hoặc cập nhật một dòng trong `LOCAL_TEST_MATRIX.md` (mã, file test, lệnh, trạng thái, commit).
- Đầu `CODEX.md` luôn có bảng trạng thái theo mã (xong / dở / bị chặn), cập nhật sau mỗi phase.
- Sắp hết context: commit điểm dừng, ghi `ĐANG DỞ: <mã>. Bước tiếp theo: <việc cụ thể>` ở dòng đầu `CODEX.md`, rồi dừng.
- Khi xong toàn bộ: in kết quả gate từng lệnh, danh sách "Bị chặn", và các mục `BỔ SUNG` đã thêm vào `DECISIONS.md`.

Bắt đầu từ Z-1 trong `FINISH_PLAN.md`.
