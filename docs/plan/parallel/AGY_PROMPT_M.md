# Prompt cho Antigravity, đợt M

Mở Antigravity tại `/Users/admin/repos/capstone1-wt/integration`, rồi dán nguyên phần dưới đường kẻ. Nếu phiên bị ngắt giữa chừng, mở phiên mới và dán lại y nguyên.

---

Bạn làm đợt cuối của dự án BloodyRoar, nhánh `be/integration`, thư mục `/Users/admin/repos/capstone1-wt/integration`.

Đọc theo thứ tự:
1. Vài dòng đầu của `docs/plan/parallel/reports/CODEX.md`. Nếu dòng đầu là `ĐANG DỞ: M<số>`, làm tiếp từ mục đó.
2. `docs/plan/parallel/AGY_FINISH_M.md`: kế hoạch đợt này, đọc toàn bộ.
3. Mục 3 của `docs/plan/parallel/AGY_FINISH.md`: quy tắc làm việc (biến môi trường, gate, được phép, cấm, vòng làm, tự quyết, khi kẹt, khi dừng). Chỉ đọc mục 3.

Ủy quyền: tôi đã duyệt toàn bộ AGY_FINISH_M.md, kể cả việc tạo migration xóa bảng ở M4 trên `bloody_codex_test` và `bloody_codex_local`. Bạn không cần hỏi tôi. Chỗ nào kế hoạch chưa nói tới thì tự quyết theo mục 3.6, ghi `BỔ SUNG` vào `DECISIONS.md`, rồi làm tiếp.

Cách làm:
- Làm M0 → M6 đúng thứ tự. Mỗi mục: test, code, typecheck và lint, test của mục, một commit, cập nhật `LOCAL_TEST_MATRIX.md` và `CODEX.md`. Xong thì sang mục tiếp theo ngay, không dừng lại báo cáo.
- Lệnh test luôn nạp `.env` bằng snippet ở mục 3.1, trong cùng một lệnh. Không in giá trị nào trong `.env`, không sửa `.env`.
- Cấm:
  - Ghi DB nào ngoài `bloody_codex_test` và `bloody_codex_local`.
  - Đụng cổng 4000.
  - Push.
  - Thêm dependency.
  - Đổi màu hay khung giao diện.
  - Thêm dòng attribution vào commit.
- Ở M4, nếu file SQL của migration có lệnh nào ngoài `DROP`, dừng mục đó, ghi "Bị chặn", rồi làm tiếp M5.
- Test đỏ hoặc lỗi môi trường không phải lý do để dừng. Tìm nguyên nhân gốc. Thử 3 cách vẫn không được thì ghi "Bị chặn", rồi làm mục khác không phụ thuộc.

Chỉ kết thúc khi đạt mục 3 "Định nghĩa xong" của AGY_FINISH_M.md, hoặc khi sắp hết context. Khi sắp hết context: ghi `ĐANG DỞ: <mã>. Bước tiếp theo: <việc>` ở dòng đầu `CODEX.md`, commit, rồi dừng.

Khi kết thúc, in đúng ba phần:
1. Các mục M đã xong, kèm hash.
2. Kết quả gate từng lệnh, và kết quả 3 lần E2E.
3. "Bị chặn" và các mục `BỔ SUNG` mới.
