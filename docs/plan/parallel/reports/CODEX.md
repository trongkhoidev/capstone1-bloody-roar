ĐANG DỞ: P1-1. Bước tiếp theo: tích hợp decode, fold, effect và projection trong transaction scanner; bổ sung test deposit thực và xử lý reorg/replay theo phase B.

## Phase B: finality, logger, RPC

- N-4 `42f4335`: FINALITY mặc định safe, latest cho local; 13 test scanner/config/RPC pass và kiểm tra không yêu cầu tag safe ở latest. Hardhat local tại block 0 trả kết quả cho cả safe và latest; eth_accounts #1 khớp ADMIN_WALLETS. Các PID đã ghi trong tests/e2e/.run và được dừng.
- P1-6 `f287f80`: thay logger tự viết bằng pino 9.14.0, cùng bản web; worker 48/48, typecheck/lint pass. Pino 9.14.0 phát hành 18/10/2025 theo [pino release](https://github.com/pinojs/pino/releases/tag/v9.14.0), hơn hai tuần.
- P1-7 `5468126`: client RPC dùng viem createPublicClient từ shared; wrapper giữ phân loại lỗi range và số liệu; worker 48/48, typecheck/lint pass. Thử `getSafeBlock(..., "latest")` với Hardhat local: block 0; process đã dừng theo PID ghi lại. E22 chưa chạy.

## P0-4 / P1-17 — 2c0e108

- Đã xóa bốn mutation escrow xác nhận bằng txHash, ba mutation dispute cũ, các module xác nhận/projection cũ và các test chỉ kiểm code đó. Schema test xác nhận chúng không còn; analyzeDispute dùng aiStatus, không đổi status, chỉ lưu báo cáo có citation hợp lệ.
- `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test`: pass trên bloody_codex_test; web 435/435, contract 35/35, 4 cảnh báo lint any có sẵn. Các test mới `graphql-schema.test.ts` và `dispute-analysis.test.ts` pass.
- Tham chiếu cũ vẫn có trong `apps/web/src/components/admin/admin-view.tsx` và `apps/web/scripts/e2e-{escrow,workflow}.ts`; chúng gọi mutation đã xóa. Frontend ngoài phạm vi theo kế hoạch; các script phải được thay/cập nhật cùng harness và luồng dispute ở phase D/G. Vì vậy điều kiện grep toàn bộ `apps/web/src` chưa đạt, dù backend không còn mutation cũ. Chưa có mutation dispute mới cho đến P1-16.

## Tiến độ phase A

| ID | Trạng thái | Commit | Kiểm tra |
| --- | --- | --- | --- |
| N-2 | xong | `f9903af` | 39 test escrow web và 3 test config worker pass; typecheck/lint pass |
| N-3 | xong | `e19d656`, `a386eec` | 29 test token/issue pass; CHAIN_ID=31337 trên server pass |
| N-5 | xong | `c21c18d` | serve:local health trả 200 tại 4012; PID trong tests/e2e/.run đã dừng |
| N-7 | xong | `3858428` | AI mock 127.0.0.1:4019, 2 test pass; model router gọi mock |
| P0-3 | xong | d39cc3b, d8fc33e |
| P0-5 | xong | deb01d4 |
| P0-6 | xong | fb0a25f |
| P0-7 | xong | c9eb936 |
| P0-8 | xong | 8301319 |
| Gate typecheck | xong | `a386eec` | bun run typecheck kiểm web, worker, database và shared |

Gate sau P0-5 và `60ca0cc`: `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass trên bloody_codex_test; contracts 35/35; lint 4 cảnh báo any cũ. `test:e2e:local` chưa có harness; gate cuối chưa hoàn tất.

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
| P0-1 | dở | 3118318 (xóa template; E2E chờ) |
| P0-2 | xong | fe78f0e |
| P0-3 | xong | d39cc3b, d8fc33e |
| P0-4 | dở | `2c0e108`: backend xong; tham chiếu frontend và E2E cũ chờ phase D/G |
| P0-5 | xong | deb01d4 |
| P0-6 | xong | fb0a25f |
| P0-7 | xong | c9eb936 |
| P0-8 | xong | 8301319 |
| P0-9 | xong | 6080c61 |
| P1-1 | chưa làm | Chưa triển khai |
| P1-2 | chưa làm | Chưa triển khai |
| P1-3 | chưa làm | Chưa triển khai |
| P1-4 | chưa làm | Chưa triển khai |
| P1-5 | chưa làm | Chưa triển khai |
| P1-6 | xong | `f287f80`: worker 48/48 |
| P1-7 | xong | `5468126`: worker 48/48, thử viem với Hardhat |
| P1-8 | chưa làm | Chưa triển khai |
| P1-9 | chưa làm | Chưa triển khai |
| P1-10 | chưa làm | Chưa triển khai |
| P1-11 | chưa làm | Chưa triển khai |
| P1-12 | chưa làm | Chưa triển khai |
| P1-13 | chưa làm | Chưa triển khai |
| P1-14 | chưa làm | Chưa triển khai |
| P1-15 | chưa làm | Chưa triển khai |
| P1-16 | chưa làm | Chưa triển khai |
| P1-17 | dở | `2c0e108`: backend xong; frontend cũ còn tham chiếu |
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
