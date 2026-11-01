# Prompt cho Antigravity

Mở Antigravity tại `/Users/admin/repos/capstone1-wt/integration`, rồi dán nguyên phần dưới đường kẻ. Nếu phiên bị ngắt giữa chừng, mở phiên mới và dán lại y nguyên; agent sẽ đọc dòng `ĐANG DỞ` để làm tiếp.

---

Bạn hoàn thiện phần logic còn sót của dự án BloodyRoar, nhánh `be/integration`, thư mục `/Users/admin/repos/capstone1-wt/integration`.

Đọc theo thứ tự:
1. `docs/plan/parallel/reports/CODEX.md`, chỉ đọc vài dòng đầu. Nếu dòng đầu là `ĐANG DỞ: <mã>`, làm tiếp từ mã đó.
2. `docs/plan/parallel/AGY_FINISH.md`: đọc toàn bộ. Đây là kế hoạch duy nhất bạn cần. Khi có mâu thuẫn với tài liệu khác, file này thắng.
3. `AGENTS.md` ở gốc repo.

Không đọc `FINISH_PLAN.md`, `HAIKU_*.md`, `FIX_LIST.md`. Chỉ tra `DECISIONS.md` khi AGY_FINISH.md trỏ tới một mục cụ thể.

Ủy quyền: tôi đã duyệt toàn bộ AGY_FINISH.md. Bạn được làm mọi việc ở mục 3.3 mà không cần hỏi. Chỗ nào kế hoạch chưa nói tới thì tự quyết theo mục 3.6, ghi `BỔ SUNG` vào `DECISIONS.md`, rồi làm tiếp. Không dừng lại để hỏi tôi.

Cách làm:
- Làm L0 → L6 đúng thứ tự.
- Mỗi mục theo vòng ở mục 3.5: test, code, typecheck và lint, test của mục, một commit, cập nhật `LOCAL_TEST_MATRIX.md` và `CODEX.md`. Xong thì sang mục tiếp theo ngay, không báo cáo giữa chừng.
- Lệnh test luôn nạp `.env` bằng snippet ở mục 3.1, trong cùng một lệnh. Không in giá trị nào trong `.env`.
- Tuyệt đối tuân thủ mục 3.4. Đặc biệt:
  - Không ghi DB nào ngoài `*_test`. Ngoại lệ: `migrate deploy` và seed demo lên `bloody_codex_local`.
  - Không đụng cổng 4000.
  - Không push.
  - Không thêm dependency.
  - Không thêm dòng attribution vào commit.
- Test đỏ hoặc lỗi môi trường không phải lý do để dừng. Tìm nguyên nhân gốc. Thử 3 cách vẫn không được thì ghi "Bị chặn" theo mục 3.7, rồi làm mục khác không phụ thuộc.

Chỉ kết thúc khi đạt mục 5 "Định nghĩa xong", hoặc sắp hết context (khi đó ghi `ĐANG DỞ` theo mục 3.7, commit, rồi dừng).

Khi kết thúc, in đúng ba phần:
1. Các mục L đã xong, kèm hash commit.
2. Kết quả gate, từng lệnh.
3. "Bị chặn" (nếu có) và các mục `BỔ SUNG` mới.
