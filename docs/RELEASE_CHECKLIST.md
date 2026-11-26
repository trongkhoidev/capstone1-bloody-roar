# Checklist phát hành bản demo (S-904, US-57)

Dựng bản demo trên Hardhat local từ đầu, rồi chạy kịch bản demo. Lệnh chi tiết nằm trong [`RUNBOOK.md`](RUNBOOK.md); file này chỉ liệt kê thứ tự và điều kiện "xong". Không gồm deploy Base Sepolia (S-118, US-102).

Người chạy đánh dấu `[x]` từng mục, ghi tên và ngày ở cuối.

## 0. Điều kiện trước

- [ ] S-905 (US-58) đã xanh: `bun run lint`, `bun run typecheck`, test web, worker, database, contracts, `bun run test:e2e:local`. **Ngày 2026-11-26: US-58 còn To Do.**
- [ ] Máy có Docker (WSL Integration bật nếu dùng WSL), Bun, image `bloodyroar-test-runner:1` và `python:3.12-slim`. Xem RUNBOOK, mục "Máy demo", phần "Một lần".
- [ ] `.env` trỏ Postgres local (`localhost:5433`), **không trỏ Supabase** (G-17). `local-up.sh` seed với `ALLOW_REMOTE_DB=1`, nên kiểm bằng mắt trước khi chạy.

## 1. Migration

- [ ] `bun run --cwd packages/database db:migrate:prod` rồi `prisma migrate status` báo "up to date" (RUNBOOK, mục "Deploy có migration").
- [ ] Có đủ các migration mới:
  - `20261118090000_source_snapshot_file_tree` (S-404, `fileTree`)
  - `20261125120000_attachment_rejected_status` (C-1, `REJECTED`)
  - `20261126031827_user_disputes_lost` (US-50, khi PR #43 đã merge)
  - Bảng `Report` (C-8): **chưa có trong code ngày 2026-11-26**. Bỏ mục này nếu C-8 chưa merge.

## 2. Biến môi trường

- [ ] `CHAIN_ID=31337`, `NEXT_PUBLIC_CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`, `FINALITY=latest`.
- [ ] `TEST_RUNNER_ENABLED=true`.
- [ ] `RELAYER_PRIVATE_KEY` để trống (MVP tắt relayer, S-109).
- [ ] `ALERT_WEBHOOK_URL`: điền nếu có kênh nhận cảnh báo; để trống thì cảnh báo chỉ ghi log.
- [ ] `INDEXER_REORG_WINDOW`: để mặc định (64).
- [ ] `AUTH_PRIVATE_KEY` sinh riêng cho máy demo; `ADMIN_WALLETS` là tài khoản Hardhat #1.

## 3. Khởi động

Thứ tự: Hardhat → deploy contract → worker → web.

- [ ] `bash scripts/demo/local-up.sh`. Script ghi `ESCROW_ADDRESS` và `ESCROW_DEPLOY_BLOCK` mới vào `.env`.
- [ ] Worker `/health` trả `ok:true`, web `/api/health` trả `"database":"connected"`.
- [ ] `BASE_URL=http://localhost:4000 bun run scripts/demo/runner-smoke.ts` in `OK issue <id>`.

## 4. Dữ liệu demo

- [ ] `bun run scripts/demo/populate.ts --dry-run` chạy đủ W1–W9 không lỗi.
- [ ] `bun run scripts/demo/populate.ts` (hoặc từng `--wave W1` … `W9`). Xem LOCAL_DEV, mục 7.2.

## 5. Khôi phục sau khi reset Hardhat

- [ ] Làm theo RUNBOOK, mục "Máy demo", phần "Khôi phục": chạy lại `local-up.sh`, khởi động lại worker sau khi `.env` đổi, chạy lại `runner-smoke.ts`. Escrow cũ trong DB thuộc chain đã mất; demo bằng bounty mới.

## 6. Kịch bản demo

Ví: client là Hardhat #2, developer là #3, admin/arbiter theo RUNBOOK. MetaMask thêm mạng `http://127.0.0.1:8545`, chain `31337`.

| # | Ai | Bấm gì | Màn hình phải hiện | Nếu hỏng |
|---|---|---|---|---|
| 1 | Client | Đăng bounty bằng wizard: tiêu đề, mô tả, ngân sách MockUSDC, lưu nháp | Bounty nháp chỉ client thấy, chưa có trên marketplace | Wizard (US-42) chưa merge hoặc lỗi: dùng form `/create` để đăng thẳng |
| 2 | Client | Tải source (ZIP hoặc repo GitHub public), bấm sinh tiêu chí bằng AI | Snapshot `READY`, danh sách tiêu chí và test | AI lỗi: thêm tiêu chí tay; test tay phải có `[TC:<id>]` trong tên |
| 3 | Client | Kiểm test trên base, duyệt tiêu chí, Publish | Bounty lên marketplace | Base check kẹt `QUEUED` quá 15 phút: xem cảnh báo `QUEUED_RUN_OVERDUE` trong RUNBOOK |
| 4 | Developer | Ứng tuyển, nhắn tin với client | Phòng chat có tin của hai bên | Chat không tới: tải lại trang; vẫn hỏng thì kiểm worker `/health` |
| 5 | Client | Chọn developer, đặt hạn, ký funding, gửi approve và deposit (bounty + 10% phí) | Bounty `IN_PROGRESS`, escrow `FUNDED` | Giao dịch treo: kiểm Hardhat còn chạy; mất chain thì làm mục 5 |
| 6 | Developer | Tạo bản nộp kèm file `.patch`, chạy test, gửi submit | Test run `PASSED`, escrow có delivery | Test `FAILED` do thiếu thẻ `[TC:<id>]`: sửa tên test |
| 7 | Client | Duyệt và release | Escrow `RESOLVED`, developer có số dư claimable | Báo `DELIVERY_CHANGED`: tải lại trang và duyệt bản nộp mới nhất |
| 8 | Developer | Claim | Số dư USDC tăng đúng | — |
| 9 | Nhánh tranh chấp | Lặp bước 1–6 với bounty khác; client mở tranh chấp **sau khi có bài nộp, trong 7 ngày**; hai bên nộp bằng chứng; admin xem bằng chứng, trọng tài ra phán quyết | Escrow `DISPUTED`, rồi phán quyết; bên mở thua hoàn toàn thì hồ sơ có "Disputes lost" | Nút tranh chấp bị khóa: chưa có bài nộp hoặc hết hạn duyệt (US-50) |

## Đã chạy

| Người chạy | Ngày | Phần | Kết quả |
|---|---|---|---|
| Hiếu (soạn) | 2026-11-26 | Mục 3 trên cổng khác (8645/4311/4110) và `runner-smoke.ts`; `populate.ts --dry-run` | Đạt. `local-up.sh` chưa chạy nguyên bản |
| _Người khác Hiếu_ | | Toàn bộ từ mục 0 | **Chưa chạy** (điều kiện "xong" của US-57) |
| _Cả nhóm_ | | Kịch bản demo mục 6 | **Chưa chạy** |
