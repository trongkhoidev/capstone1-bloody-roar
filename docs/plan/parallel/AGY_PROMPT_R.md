# Prompt cho Antigravity, đợt R

Mở Antigravity tại `/Users/admin/repos/capstone1-wt/integration`, rồi dán nguyên phần dưới đường kẻ. Nếu phiên bị ngắt giữa chừng, mở phiên mới và dán lại y nguyên.

---

Bạn làm đợt R của dự án BloodyRoar, nhánh `be/integration`, thư mục `/Users/admin/repos/capstone1-wt/integration`. Đợt này có hai việc:
- Đưa app lên chạy với Base Sepolia (chain 84532).
- Tạo dữ liệu thật: tạo ví, lấy ETH và USDC testnet từ faucet, rồi dùng chính các ví đó đăng nhập, đăng bài, bình luận, ứng tuyển, chat, nạp tiền vào escrow, giao việc, release, settlement, dispute và claim. Tất cả đi qua API của app và contract trên chain.

Đọc theo thứ tự:
1. Vài dòng đầu của `docs/plan/parallel/reports/CODEX.md`. Dòng đầu là `ĐANG DỞ: R<số>` hoặc `CẦN NGƯỜI DÙNG: ...` thì đọc kỹ, rồi làm tiếp từ đó.
2. `docs/plan/parallel/AGY_FINISH_R.md`: kế hoạch đợt này, đọc toàn bộ.
3. Mục 3 của `docs/plan/parallel/AGY_FINISH.md`: quy tắc làm việc. Chỉ đọc mục 3. Mục 4 của AGY_FINISH_R.md nới và bổ sung các quy tắc đó cho đợt R. Chỗ nào hai file khác nhau thì làm theo AGY_FINISH_R.md.

Ủy quyền: tôi đã duyệt toàn bộ AGY_FINISH_R.md, gồm:
- Tạo ví mới.
- Nhận faucet về ví `treasury`.
- Tạo 3 Safe và deploy escrow lên Base Sepolia với `ALLOW_BASE_SEPOLIA_DEPLOYMENT=true`.
- Tạo và ghi DB `bloody_demo`.
- Gửi giao dịch testnet bằng các ví trong `demo-wallets/keys.json`.

Bạn không cần hỏi tôi. Chỗ nào kế hoạch chưa nói tới thì tự quyết theo mục 3.6, ghi `BỔ SUNG` vào `DECISIONS.md`, rồi làm tiếp.

Cách làm:
- Làm R0 → R9 theo thứ tự. Riêng R5 chạy theo đợt W1 → W9. Đợt nào không cần tiền (W1–W4) thì được làm trước, trong lúc chờ faucet.
- Mỗi mục làm theo vòng: test, code, typecheck và lint, test của mục, một commit, cập nhật `LOCAL_TEST_MATRIX.md` và `CODEX.md`. Xong mục nào thì sang mục tiếp theo ngay, không dừng lại báo cáo.
- Lệnh test local luôn nạp `.env` bằng snippet ở mục 3.1, trong cùng một lệnh. Lệnh demo nạp `.env.demo` theo cùng cách. Không in giá trị nào trong `.env`, `.env.demo` hay `keys.json`.
- Trước lần commit đầu tiên của R1, chạy `git check-ignore .env.demo demo-wallets/keys.json`. Trước mỗi commit sau đó, chạy `git status --short`. Nếu thấy `.env.demo` hoặc `demo-wallets/` thì dừng ngay.
- Faucet:
  - Chỉ nhận về `treasury`, theo thứ tự ở R2.
  - Không lách captcha, không xoay ví để lách giới hạn.
  - Hết giới hạn thì chờ, và làm phần off-chain trong lúc chờ.
  - Không còn nguồn nào thì ghi `CẦN NGƯỜI DÙNG: nạp <số> ETH và <số> USDC vào <địa chỉ treasury> trên Base Sepolia` ở dòng đầu `CODEX.md`, làm hết phần không cần tiền, rồi dừng.
- Mọi giao dịch kiểm `chainId === 84532` trước khi gửi. Không ký bằng `DEPLOYER_PRIVATE_KEY` trong `.env`. Đó là key công khai `0x…01`.
- Dữ liệu nghiệp vụ chỉ tạo qua HTTP API và socket ở cổng 4100. Gặp lỗi của app thì sửa app theo R7, kèm test. Không chỉnh script để đi vòng qua lỗi.
- Nội dung bài, bình luận và chat do bạn tự viết, trộn tiếng Việt và tiếng Anh, giống bài thật của dev và client. Không lorem ipsum. Không dùng tên người thật hay thương hiệu thật. Ảnh sinh bằng script.
- Cấm:
  - Mainnet.
  - Đụng cổng 4000.
  - Ghi DB nào ngoài `bloody_demo` (và `bloody_codex_test` khi chạy gate).
  - Push.
  - Thêm dependency.
  - Sửa `.sol`.
  - Gọi AI provider thật, S3 hay GitHub.
  - Đổi màu hay khung giao diện.
  - Thêm dòng attribution vào commit.
- Test đỏ, RPC chập chờn hay safe head chậm không phải lý do để dừng. Tìm nguyên nhân gốc. Thử 3 cách vẫn không được thì ghi "Bị chặn", rồi làm mục khác không phụ thuộc.

Chỉ kết thúc khi gặp một trong các trường hợp sau:
- Đạt mục 2 "Định nghĩa xong" và R9 của AGY_FINISH_R.md.
- Bị chặn vì cần tôi nạp tiền.
- Sắp hết context. Khi đó ghi `ĐANG DỞ: <mã>. Bước tiếp theo: <việc>` ở dòng đầu `CODEX.md`, commit, rồi dừng.

Khi kết thúc, in đúng bốn phần:
1. Các mục R đã xong, kèm hash.
2. Bảng số lượng của `verify.ts` so với mục tiêu, và kết quả gate.
3. Địa chỉ contract, ba Safe và `treasury`, kèm link BaseScan. Tổng ETH và USDC đã nhận và đã tiêu.
4. "Bị chặn", "CẦN NGƯỜI DÙNG" và các mục `BỔ SUNG` mới.
