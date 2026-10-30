# Prompt tiếp tục (dùng cho mọi phiên sau phiên đầu)

Dán nguyên phần dưới đường kẻ. Có thể dán lại y hệt cho mỗi phiên mới.

---

Tiếp tục hoàn tất logic còn thiếu của BloodyRoar trên `be/integration`, thư mục `/Users/admin/repos/capstone1-wt/integration`.

Đọc theo thứ tự:
1. Dòng `ĐANG DỞ` và bảng trạng thái ở đầu `docs/plan/parallel/reports/CODEX.md`.
2. `docs/plan/parallel/FINISH_PLAN.md`, nhất là mục 1.1 (ủy quyền) và 1.2 (không tự kết thúc giữa chừng).
3. `docs/plan/parallel/PROMPT_FINISH.md`: quy tắc làm việc và những việc cấm.
4. Trong `DECISIONS.md` và `LOCAL_FULL_FLOW_SPEC.md`, chỉ đọc những phần mà mục đang làm cần tới.

Ủy quyền: tôi đã duyệt toàn bộ `FINISH_PLAN.md`. Bạn có quyền làm mọi việc ở mục 1.1 mà không cần hỏi tôi: sửa code (cả frontend), merge các nhánh ở Z-3, tạo và chạy migration trên DB `_test` và `bloody_codex_local`, sửa `.env` của worktree, bật và tắt chain, worker, web trên các cổng đã cho, xóa code legacy, commit. Chỗ nào kế hoạch chưa nói tới thì tự quyết theo mục 1 điều 1, ghi `BỔ SUNG` vào `DECISIONS.md`, rồi làm tiếp.

Cách chạy phiên này:
- Làm từ mục `ĐANG DỞ`, theo đúng thứ tự trong `FINISH_PLAN.md` mục 2.
- Mỗi mục làm theo vòng: test, code, typecheck và lint, test của mục, commit, cập nhật `LOCAL_TEST_MATRIX.md` và bảng trong `CODEX.md`. Xong vòng thì **sang mục tiếp theo ngay**, không dừng lại báo cáo cho tôi.
- Cuối mỗi phase chạy gate ở mục 5 rồi đi tiếp sang phase sau.
- Chỉ được kết thúc phiên khi: (1) đạt mục 6 "Định nghĩa xong", hoặc (2) sắp hết context (ghi `ĐANG DỞ: <mã>. Bước tiếp theo: <việc>` ở dòng đầu `CODEX.md`, commit, rồi dừng), hoặc (3) mọi mục còn lại đều đã nằm trong "Bị chặn" kèm bằng chứng.
- Một mục bị chặn sau 3 cách thử khác nhau: ghi vào "Bị chặn" rồi làm mục khác không phụ thuộc. Không dừng cả phiên vì một mục.

Khi kết thúc phiên, in đúng ba phần:
1. Các mục đã xong, kèm hash commit.
2. Kết quả gate gần nhất, từng lệnh một.
3. Dòng `ĐANG DỞ` (nếu còn), danh sách "Bị chặn", và các mục `BỔ SUNG` mới thêm.
