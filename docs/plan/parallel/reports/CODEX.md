ĐANG DỞ: N-2. Bước tiếp theo: đọc các module escrow web và config worker, chuẩn hóa biến môi trường theo D-ENV-1; tiếp tục phase A và sửa hai lỗi typecheck worker tại effects/escrow.ts:138–139.

## Cập nhật sau review phase A

- Kế hoạch đã commit `0644ecc` theo quyết định bổ sung.
- N-1/P0-9 và review: `6080c61` kiểm host localhost/127.0.0.1, gán URL không thể truy cập khi thiếu TEST_DATABASE_URL, preload database, guard test DB, bảo vệ reset tích hợp và ignore tests/e2e/.run/. `bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts` pass 12/12; `git check-ignore tests/e2e/.run/example.pid` pass.
- `bun run --cwd apps/web test` không có TEST_DATABASE_URL: 480 pass, 1 test DB bỏ qua; với TEST_DATABASE_URL, `bun run --cwd apps/web test -- src/test/escrow-reservation.db.test.ts` pass 1/1. `bun run --cwd packages/database test` pass 2/2 trên bloody_codex_test.
- Mục 2.2: tạo bloody_codex_local sau khi xác minh host và tên; `bun run --cwd packages/database db:migrate:prod` pass. Địa chỉ admin đã được review xác nhận; còn chờ manifest escrow.
- P0-1: `3118318` xóa template và test không dùng theo D-NOTI-1; kiểm tra từng NotificationType có nơi tạo và E2E vẫn phải hoàn tất ở phase E/G.
- P0-2: `fe78f0e` thêm dependency workspace shared. Test worker hiện pass 45/45 trên bloody_codex_test.
- P0-3: `d39cc3b` thêm schema/migration; db:generate và migrate deploy trên bloody_codex_test lẫn bloody_codex_local pass. Worker typecheck vẫn fail do hai trường arbiter và feeRecipient không có trong effect FUNDED (src/effects/escrow.ts:138–139); cần sửa trước khi coi nghiệm thu P0-3 hoàn tất.
- `bun run typecheck && bun run lint` pass sau thay đổi, lint 4 cảnh báo any có sẵn. Lưu ý typecheck gốc hiện chỉ chạy web. Gate phase A, contracts test và E2E chưa chạy.

## Cập nhật phiên local

- Mục 2.2: đã sửa .env của worktree và packages/database/.env trỏ bloody_codex_local, xóa tên biến cũ, để trống dịch vụ thật, dùng cổng 4010/4011; ESCROW_ADDRESS và ESCROW_DEPLOY_BLOCK để trống đến khi có manifest sau deploy. ADMIN_WALLETS dùng địa chỉ chuẩn hardhat #1; cần xác nhận từ eth_accounts. Không commit .env.
- N-14: commit `79c14b4`; `bun test tests/e2e/check-env.test.ts` pass 10/10. Chặn hostname giả localhost.example.com; AI_BASE_URL rỗng được phép.
- N-1: commit `43f034a`; guard và preload đã thêm; `bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts` pass 11/11; database test pass 2/2. Chưa chạy toàn bộ test web/worker.
- PostgreSQL báo bloody_codex_test không tồn tại dù đặc tả nói đã có; đã tạo mới bằng Bun SQL sau khi kiểm tên, rồi chạy `bun run --cwd packages/database db:migrate:prod` với DATABASE_URL và DIRECT_URL trỏ bloody_codex_test: 7 migration pass.
- `bun run typecheck && bun run lint`: pass, lint có 4 cảnh báo any có sẵn. Gate phase A và gate cuối chưa chạy.
- Tài liệu DECISIONS.md, FIX_LIST.md và LOCAL_FULL_FLOW_SPEC.md đã có thay đổi chưa commit từ trước; giữ nguyên.

# Báo cáo Codex — 29/10/2026

| ID | Trạng thái | Bằng chứng |
| --- | --- | --- |
| P0-1 | dở | 13 template cho enum hiện tại; test 21/21 pass; DEPOSIT_MISMATCHED chờ P0-3 |
| P0-2 | chưa làm | Chưa triển khai |
| P0-3 | chưa làm | Chưa triển khai |
| P0-4 | chưa làm | Chưa triển khai |
| P0-5 | chưa làm | Chưa triển khai |
| P0-6 | chưa làm | Chưa triển khai |
| P0-7 | chưa làm | Chưa triển khai |
| P0-8 | chưa làm | Chưa triển khai |
| P0-9 | chưa làm | Chưa triển khai |
| P1-1 | chưa làm | Chưa triển khai |
| P1-2 | chưa làm | Chưa triển khai |
| P1-3 | chưa làm | Chưa triển khai |
| P1-4 | chưa làm | Chưa triển khai |
| P1-5 | chưa làm | Chưa triển khai |
| P1-6 | chưa làm | Chưa triển khai |
| P1-7 | chưa làm | Chưa triển khai |
| P1-8 | chưa làm | Chưa triển khai |
| P1-9 | chưa làm | Chưa triển khai |
| P1-10 | chưa làm | Chưa triển khai |
| P1-11 | chưa làm | Chưa triển khai |
| P1-12 | chưa làm | Chưa triển khai |
| P1-13 | chưa làm | Chưa triển khai |
| P1-14 | chưa làm | Chưa triển khai |
| P1-15 | chưa làm | Chưa triển khai |
| P1-16 | chưa làm | Chưa triển khai |
| P1-17 | chưa làm | Chưa triển khai |
| P1-18 | chưa làm | Chưa triển khai |
| P1-19 | chưa làm | Chưa triển khai |
| P1-20 | chưa làm | Chưa triển khai |
| P1-21 | chưa làm | Chưa triển khai |
| P1-22 | chưa làm | Chưa triển khai |
| P1-23 | chưa làm | Chưa triển khai |
| P1-24 | chưa làm | Chưa triển khai |
| P1-25 | chưa làm | Chưa triển khai |
| P1-26 | chưa làm | Chưa triển khai |
| P1-27 | chưa làm | Chưa triển khai |
| P1-28 | chưa làm | Chưa triển khai |
| P1-29 | chưa làm | Chưa triển khai |
| P1-30 | chưa làm | Chưa triển khai |
| P1-31 | chưa làm | Chưa triển khai |
| P1-32 | chưa làm | Chưa triển khai |
| P1-33 | chưa làm | Chưa triển khai |
| P1-34 | chưa làm | Chưa triển khai |
| P1-35 | chưa làm | Chưa triển khai |
| P1-36 | chưa làm | Chưa triển khai |
| P1-37 | chưa làm | Chưa triển khai |
| S-1 | chưa làm | Chưa triển khai |
| S-2 | chưa làm | Chưa triển khai |
| S-3 | chưa làm | Chưa triển khai |
| S-4 | chưa làm | Chưa triển khai |
| S-5 | chưa làm | Chưa triển khai |
| S-6 | không làm theo kế hoạch | FIX_LIST mục 3 |

## File theo nhóm

- P0-1: apps/web/src/lib/notifications/templates.ts. Test enum đã có trong apps/web/src/test/notification-templates.test.ts.
- Báo cáo và quyết định: docs/plan/parallel/reports/CODEX.md, docs/plan/parallel/DECISIONS.md.

## Gate

Chạy với DATABASE_URL và DIRECT_URL trỏ bloody_codex, sau khi tạo database và áp migration hiện có.

| Lệnh | Kết quả |
| --- | --- |
| bun run typecheck | Pass |
| bun run lint | Pass, 4 cảnh báo any có sẵn |
| bun run --cwd apps/web test | Pass, 481 test; template 21/21 |
| bun run --cwd apps/worker test | Fail: 40 pass, 1 fail, 1 error; thiếu dependency shared theo bàn giao/P0-2 |
| bun run --cwd packages/database test | Chưa chạy vì gate dừng tại worker |
| bun run contracts:test | Chưa chạy vì gate dừng tại worker |

Lần gate đầu web test fail vì bloody_codex chưa tồn tại; đã tạo bằng pg và chạy bun run --cwd packages/database db:migrate thành công.

## Quyết định và việc còn lại

Xem DECISIONS.md. BE-88 và GitGuardian bị chặn như FIX_LIST mục 4. Các mục chưa làm do phiên dừng sớm; tiếp tục P0-2, P0-3 rồi hoàn tất P0-1, sau đó theo FIX_LIST. Quy tắc chỉ dùng bloody_codex mâu thuẫn với yêu cầu tên DB test chứa test; cần xử lý theo quyết định ghi trong DECISIONS.md trước P0-9. Không push hoặc tạo PR.
