ĐANG DỞ: P1-9. Bước tiếp theo: triển khai effect WORK_SUBMITTED (hash lạ externalDelivery, supersede, xác nhận intent, thông báo client), snapshot/đảo effect khi reorg; bỏ submitWork/reviewSubmission cũ, kiểm tra race sửa draft sau prepare, rồi chạy E9 trên Hardhat.

## P1-9 — điểm dừng

- `e538635`: thêm createSubmissionDraft với manifest và hash, kiểm quyền, trạng thái FUNDED, hạn giao và attachment; prepareSubmitWork tạo intent/call; requestChanges ghi chú và thông báo developer qua pg_notify. Đây mới là một phần P1-9.
- `bun run --cwd apps/web test -- src/test/submission-draft.test.ts`: pass 8/8 với DB giả, gồm manifest, sửa nháp, quyền, deadline, calldata và thông báo. `bun run typecheck && bun run lint`: pass; lint còn bốn cảnh báo any cũ. Chưa chạy gate phase C hoặc E9 thực.
- Cần kiểm lại an toàn đồng thời giữa sửa draft, prepare và event trước khi đánh dấu hoàn tất; effect/reorg chưa viết, mutation submitWork/reviewSubmission cũ vẫn còn. Chưa có bằng chứng E9 toàn luồng.


## P1-8 — chuẩn bị deposit

- `a777558`: prepareEscrowDeposit kiểm chữ ký và trạng thái reservation, issue, chain, token, deadline, balance, allowance và paused; tạo intent approve nếu cần và deposit trong transaction. Scanner chỉ xác nhận deposit intent có txHash trùng event. Effect FUNDED gửi thông báo cho client và các developer liên quan.
- `bun run --cwd apps/web test -- src/test/escrow-deposit.test.ts`: pass 14 test. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` với TEST_DATABASE_URL trỏ bloody_codex_test và Hardhat local đã deploy: pass ký EIP-712, chuẩn bị approve/deposit, gửi giao dịch thực, xác nhận deposit và thông báo; đồng thời pass lại E22/E23/E24. Fixture tạo reservation trực tiếp, chưa chứng minh toàn bộ E1–E4.
- Gate `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test`: pass; lint còn bốn cảnh báo any cũ. `test:e2e:local` chưa có vì N-8 chưa triển khai.
- Intent approve có thể vẫn PENDING_SAFE_HEAD vì scanner chỉ index event escrow, chưa index ERC20 Approval; cần xử lý và kiểm thử trong các bước tiếp theo. Reorg hiện chỉ đảo effect deposit; các effect mới cần cơ chế đảo riêng. Hardhat đã dừng; cần deploy lại khi chạy node mới.


## P1-5 và gate phase B

- `1fb8c75`: job hết hạn gửi RESERVATION_EXPIRED cho developer; job deadline gửi DEADLINE_APPROACHING cho các bên, phát pg_notify khi insert mới. Update reservation theo trạng thái hiện tại để không ghi đè deposit đồng thời; effect deposit cũng retry nếu reservation/issue thay đổi.
- Test `reservations.test.ts`, `deadline-notifications.test.ts`, `effects-escrow.test.ts`: pass; gồm hai job hết hạn đồng thời, chạy lại deadline, pg_notify và race với deposit. Theo mục ĐỔI QUYẾT ĐỊNH cuối DECISIONS.md, dedupe deadline thêm userId để gửi cả hai bên.
- Gate phase B: E22/E23/E24 pass qua `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` sau deploy Hardhat local trên bloody_codex_test; deposit thực E5 cũng pass. `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass; contract 35/35, lint có bốn cảnh báo any cũ. Chưa chạy được `bun run test:e2e:local` vì N-8 chưa có.

## P1-4 — custom error

- `df7418b`: đọc revert data từ debug_traceTransaction khi RPC hỗ trợ và giải mã tên lỗi theo ABI; nếu không có trace hoặc selector không hợp lệ, giữ lý do chung. Dùng conditional update để reconciler không ghi đè intent đã được scanner xác nhận đồng thời.
- `bun run --cwd apps/worker test -- test/intents.test.ts`: pass 7/7 trên bloody_codex_test, gồm DeadlineNotReached, fallback và race. `bun run typecheck && bun run lint` pass; bốn cảnh báo lint cũ. RPC không hỗ trợ debug trace sẽ chỉ có lý do chung.

## P1-3 — reconciler và E23

- `eb13815`: job định kỳ so sánh escrow, settlement, dispute, claimable và isSolvent với block đã index; tạo/cập nhật/đóng finding theo chain và contract. Bỏ qua khi indexer chưa tới head, không ghi finding khi RPC lỗi hoặc checkpoint/projection thay đổi trong lúc đối chiếu.
- `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên Hardhat/bloody_codex_test pass E22/E23/E24. E23 kiểm chain khớp, sửa amount projection tạo finding, sửa lại đóng finding; kiểm mismatch claimable và insolvency rồi phục hồi. `apps/worker/test/reconciliation.test.ts` kiểm bỏ qua khi indexer trễ.
- Gate typecheck, lint, test web/worker/database và contracts pass; worker 52/52, contracts 35/35, lint có bốn cảnh báo any cũ. Luồng dispute/settlement toàn phần còn chờ P1-16/P1-11.

## P1-2 — reorg và replay

- `50df7d0`: lưu snapshot các thay đổi do deposit, đảo effect nếu event bị orphan, dựng lại projection từ event canonical; replay CLI dựng projection rồi quét lại. Scanner, reorg và replay khóa checkpoint để tránh ghi chồng. Nếu không đủ snapshot hoặc trạng thái off-chain đã thay đổi ngoài dự kiến, reorg dừng và rollback thay vì ghi đè.
- E22/E24: `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` sau deploy Hardhat local trên bloody_codex_test pass: snapshot, deposit A, revert, deposit B, A non-canonical/B canonical, projection FUNDED; sửa projection rồi replay qua `bun run worker:replay --from ...` khôi phục FUNDED. Các PID được ghi trong .run và dừng.
- Test `scanner-projection.test.ts`, `reorg.test.ts`, `replay.test.ts`, `scanner.test.ts` pass, gồm giữ nguyên trạng thái khi thiếu block RPC hoặc assignment đã thay đổi và kiểm tra replay đồng thời. Gate typecheck, lint, web, worker, database và contracts pass; lint 4 cảnh báo cũ; contracts 35/35.
- Snapshot hiện chỉ bao phủ effect deposit đã triển khai. Khi thêm effect delivery, dispute, settlement, claim trong P1-9/P1-16, cần bổ sung cơ chế đảo effect tương ứng và test reorg, không coi E22 deposit là bằng chứng cho toàn bộ lifecycle.

## P1-1 và local deploy

- P1-1 `8a3c28d`: scanner sắp thứ tự log, decode, fold lịch sử canonical và cập nhật event, effect, projection, checkpoint, pg_notify trong transaction. Kiểm tra hash block và từ chối contract/chain sai. Test `scanner-projection.test.ts` kiểm deposit + delivery đảo thứ tự, rescan và rollback khi log sai.
- Deposit thật: khởi động Hardhat, `bun run --cwd apps/contracts deploy:local`, `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên bloody_codex_test pass: projection FUNDED, reservation FUNDED và issue IN_PROGRESS. PID của Hardhat được ghi vào .run và dừng. Gate `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass; web 435/435, contracts 35/35.
- Local deploy `9f85dfc`: owner #0, arbiter #5, fee recipient #6 theo D-ACC-1; đã kiểm manifest bằng eth_accounts. ESCROW_ADDRESS và ESCROW_DEPLOY_BLOCK trong .env worktree lấy từ manifest; Hardhat hiện đã dừng, cần deploy lại khi khởi động node mới.
- `bun run --cwd apps/contracts typecheck` phát hiện lỗi CommonJS có sẵn trong export-abi; `7670048` sửa và lệnh đã pass. `bun run apps/contracts/scripts/export-abi.ts` xuất 114 mục và không thay đổi ABI được track.
- Các effect cho WORK_SUBMITTED, dispute, settlement và claim vẫn thuộc các mục P1 khác; test P1-1 chỉ chứng minh projection và effect FUNDED.

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
| P1-1 | xong | `8a3c28d`: log ABI + Hardhat deposit thực pass |
| P1-2 | xong | `50df7d0`: E22/E24 deposit trên Hardhat pass; các effect khác chờ P1-9/P1-16 |
| P1-3 | xong | `eb13815`: E23 Hardhat pass |
| P1-4 | xong | `df7418b`: custom error/fallback/race pass |
| P1-5 | xong | `1fb8c75`: jobs idempotent, pg_notify và race pass |
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
