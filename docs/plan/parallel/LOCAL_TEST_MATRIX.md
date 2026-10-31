# Ma trận test local

| Mã | File test | Lệnh | Trạng thái |
| --- | --- | --- | --- |
| FE-1b | apps/web/src/lib/web3/send-prepared.ts | bun run typecheck; lint; e2e qua harness | Xong: gửi từng giao dịch đã chuẩn bị, ghi recordTransactionSubmitted trước khi chờ receipt |
| E1 | tests/e2e/e01-auth.test.ts | bun run test:e2e:local | Xong (từ G1 trước đó): xác thực SIWE và chặn người bị khóa |
| N-10 | docs/plan/parallel/LOCAL_TEST_MATRIX.md | kiểm từng mã Phần C có dòng (script trong báo cáo CODEX) | Xong: mọi mã Phần C có dòng trong ma trận |
| N-12 | tests/e2e/e22-reorg.test.ts | bun run test:e2e:local | Xong: reorg thật trên Hardhat, deposit A non-canonical, B canonical (thay reorg.e2e.ts đã xóa) |
| P1-30b | apps/web/src/test/upload-access.test.ts | bun run --cwd apps/web test -- src/test/upload-access.test.ts | Xong: quyền tải theo purpose cho khách, người ngoài, người tham gia, admin |
| FE-1c | apps/web/src/lib/web3/funding-intent.ts | bun run typecheck; lint; e2e funding qua harness | Xong: ký EIP-712 funding intent, nonce 16 byte, submitFundingIntent |
| FE-8 | apps/web/src/test/fe-operations.test.ts | bun run --cwd apps/web test -- src/test/fe-operations.test.ts | Pass: mọi GraphQL trong components/app/lib parse và validate với schema |
| FE-1 / FE-1b / FE-1c | apps/web/src/lib/web3/client.ts; send-prepared.ts; funding-intent.ts | bun run typecheck; bun run lint; e2e qua harness | Xong: ACTIVE_CHAIN theo NEXT_PUBLIC_CHAIN_ID, ensureChain, gửi giao dịch đã chuẩn bị, ký funding intent; kiểm bằng tay với MetaMask theo docs/LOCAL_DEV.md |
| FE-2 | apps/web/src/components/marketplace/issue-detail-view.tsx | bun run typecheck; lint | Xong: lắng nghe escrow:invalidate và poll tối đa 30 lần sau giao dịch; đặc tả không yêu cầu test tự động (xem BỔ SUNG FE-2) |
| FE-3 | apps/web/src/components/marketplace/issue-detail-view.tsx | bun run typecheck; lint | Xong: hành động chỉ hiện khi có trong availableActions và viewerCapabilities cho phép; nút bị tắt hiện reasonDisabled (title và dòng chữ) |
| FE-4 | apps/web/src/components/marketplace/issue-detail-view.tsx | fe-operations; typecheck; lint | Xong: chọn developer, nạp tiền, giao việc, release/yêu cầu sửa, tranh chấp, bằng chứng đối phương, đề xuất/thu hồi/chấp nhận thỏa thuận, kháng cáo, finalize, claim timeout, đánh giá |
| FE-5 | apps/web/src/components/dashboard/dashboard-view.tsx | fe-operations; typecheck | Xong: myClaimable và nút Rút tiền gọi prepareClaim |
| FE-6 | apps/web/src/components/admin/admin-view.tsx | fe-operations; typecheck; lint | Xong: draftRuling (copy, tải ruling-<issue>.json), bằng chứng, tab Vận hành, ẩn/bỏ ẩn issue; đã bỏ form đề xuất cũ |
| FE-7 | apps/web/src/lib/upload.ts; issue-detail-view.tsx; create-issue-form.tsx; profile-view.tsx | bun run typecheck; lint; fe-operations | Xong: tệp giao việc, bằng chứng, ảnh issue (attachIssueFile sau khi tạo), avatar dùng uploadFile hai bước |
| S-1 | apps/web/src/test/helpers/call-query.ts; call-mutation.ts; contract.ts; users.ts | admin, ai, escrow test suites (242 pass) | Xong theo quy tắc chỉ gom bản giống nhau: callQuery, callMutation, CONTRACT, client; các fakeDb và developer khác nhau giữ nguyên |
| S-2 | packages/shared/src/constants/index.ts | typecheck web/worker/shared | Xong: MINUTE_MS, HOUR_MS, DAY_MS, MAX_BPS dùng chung; DAY/HOUR bigint giây trong fold.ts giữ nguyên |
| S-3 | packages/database/src/notifications.ts | — | Không cần đổi: file đã import kiểu từ @prisma/client |
| S-4 | apps/web/src/graphql/modules/escrow/select.module.ts | escrow-reservation, escrow-deposit tests (199 pass) | Xong: selectDeveloper và cancelReservation tách sang select.module.ts |
| S-5 | packages/shared/src/constants/index.ts; escrow-abi.ts | typecheck web/worker/shared; constants.test | Xong: xóa PLATFORM_FEE_PERCENT và re-export ESCROW_RESOLUTION_KINDS không ai dùng; test đọc PLATFORM_FEE_BPS |
| N-11 | docs/LOCAL_DEV.md | các lệnh trong tài liệu, theo thứ tự | Viết xong: chạy tay theo các bước (DB, Hardhat, deploy, seed, worker, web) |
| N-6 | apps/web/src/app/api/uploads/route.ts; apps/web/src/app/api/uploads/complete/route.ts | bun run --cwd apps/web test -- src/test/upload-two-step.test.ts; e25-files | Xong cùng P1-30a: upload hai bước, sha256 khớp |
| E29 | tests/e2e/e29-config-guard.test.ts | bun run test:e2e:local | Pass: worker thoát khi ESCROW_ADDRESS là EOA hoặc CHAIN_ID sai |
| E28 | tests/e2e/e28-authz.test.ts; docs/AUTHZ_MATRIX.md | bun run test:e2e:local | Pass 3/3: khách bị UNAUTHORIZED ở mọi dòng trong bảng; người ngoài nhận mã đúng bảng (hoặc qua được kiểm quyền với dòng ✅); 10 mutation đã gỡ vắng mặt khỏi schema |
| E27 | tests/e2e/e27-rate-limit.test.ts | bun run test:e2e:local | Pass 2/2: nonce lần 11 trả 429 kèm Retry-After; GraphQL vượt điểm trả 429 |
| E26 | tests/e2e/e26-webhook.test.ts | bun run test:e2e:local | Pass: webhook có chữ ký tạo đúng một PR_MERGED; gửi lại cùng delivery không tạo thêm |
| E25 | tests/e2e/e25-files.test.ts | bun run test:e2e:local | Pass: tệp DELIVERY đúng người tham gia; EVIDENCE cho admin khi có tranh chấp kèm view_evidence; sha256 khớp |
| P1-35 | apps/web/src/test/sessions.test.ts; apps/worker/test/cleanup.test.ts | bun run --cwd apps/web test -- src/test/sessions.test.ts; bun run --cwd apps/worker test -- test/cleanup.test.ts; bun run typecheck; bun run lint | Pass: danh sách phiên và cờ current; chỉ thu hồi phiên của mình; job dọn đúng bản ghi quá hạn |
| P1-32 | apps/web/src/test/chain-guard.test.ts | bun run --cwd apps/web test -- src/test/chain-guard.test.ts; bun run typecheck; bun run lint | Pass 5/5: sai chain, không có code, manifest lệch, hợp lệ; web server và worker gọi guard khi khởi động |
| P1-31 | apps/web/src/test/github-webhook.test.ts | bun run --cwd apps/web test -- src/test/github-webhook.test.ts; bun run typecheck; bun run lint | Pass 4/4: cùng delivery id chỉ xử lý một lần; PR merged tạo đúng một PR_MERGED; thiếu delivery id 400; chữ ký sai không ghi delivery |
| P1-30a/b | apps/web/src/test/upload-two-step.test.ts; apps/web/src/test/upload-access.test.ts | bun run --cwd apps/web test -- src/test/upload-two-step.test.ts src/test/upload-access.test.ts; bun run typecheck; bun run lint | Pass 15/15 cùng evidence-download: upload hai bước, sha256, sai kích thước giữ PENDING, người khác 403, 503 production; quyền tải theo purpose cho 4 vai trò |
| E30 | tests/e2e/e30-deadline-notice.test.ts | bun run test:e2e:local | Pass: job deadline gửi đúng một DEADLINE_APPROACHING cho mỗi bên khi mốc đã qua |
| E21 | tests/e2e/e21-admin.test.ts | bun run test:e2e:local | Pass: adminStats khớp projection; ban hủy việc mở và từ chối ứng tuyển; không tự hạ quyền; ops query; review và uy tín |
| E20 | tests/e2e/e20-notifications.test.ts | bun run test:e2e:local | Pass: phân trang có cursor, unreadNotificationCount, đánh dấu một và tất cả |
| E19 | tests/e2e/e19-realtime.test.ts | bun run test:e2e:local | Pass: escrow:invalidate, notification:new, ban ngắt socket qua HTTP, đăng xuất ngắt phiên |
| E18 | tests/e2e/e18-chat.test.ts | bun run test:e2e:local | Pass 2/2: chat khi IN_PROGRESS, người ngoài bị chặn, che key, chỉ đọc sau COMPLETED; afterDispute và admin chỉ đọc khi DISPUTED |
| P1-29 | apps/web/src/test/notification-types.test.ts | bun run --cwd apps/web test -- src/test/notification-types.test.ts; bun run typecheck; bun run lint | Pass 22/22: mọi NotificationType có nơi tạo trong apps/web/src và apps/worker/src; không loại giá trị nào |
| P1-27 | apps/web/src/test/eval/dispute-eval.test.ts; apps/web/src/test/eval/dispute/*.json (10 file) | bun run --cwd apps/web test -- src/test/eval; bun run typecheck; bun run lint | Pass 10/10: qua analyzeDispute với model mock; có citation giả ở missing-criteria và bad-file-hash bị loại đúng số lượng; có AILog |
| P1-26 | .env.example | grep -rn GOOGLE_GENERATIVE apps/web/src .env.example (rỗng) | Xong: xóa biến và comment Gemini khỏi .env.example; check-env.ts vẫn chặn biến này |
| P1-25 | apps/web/src/test/ai-rate-limit.test.ts | bun run --cwd apps/web test -- src/test/ai-rate-limit.test.ts; bun run typecheck; bun run lint | Pass 2/2: user thường bị RATE_LIMITED ở lượt thứ 11, admin ở lượt thứ 31 |
| P1-24 | apps/web/src/test/content-guard.test.ts; apps/web/src/test/submission.db.test.ts | bun run --cwd apps/web test -- src/test/content-guard.test.ts src/test/submission.db.test.ts; typecheck; lint | Pass: key giả bị che ở createIssue, updateIssue, comment, cover letter, và trước khi băm delivery description |
| P1-23 | apps/web/src/test/audit-hash.test.ts | bun run --cwd apps/web test -- src/test/audit-hash.test.ts; bun run typecheck; bun run lint | Pass 4/4: cùng khóa cùng hash, khác khóa khác hash, không phải SHA-256 thuần, production thiếu khóa thì throw |
| P1-22 | apps/web/src/test/review.db.test.ts; apps/worker/test/effects-resolved.test.ts | bun run --cwd apps/web test -- src/test/review.db.test.ts; bun run --cwd apps/worker test -- test/effects-resolved.test.ts; bun run typecheck; bun run lint | Pass: review trước COMPLETED và người khác bị từ chối, trùng CONFLICT, điểm trung bình và completedTaskCount đúng, release/undo cập nhật số bài |
| P1-21 | apps/web/src/test/issue-hide.db.test.ts | bun run --cwd apps/web test -- src/test/issue-hide.db.test.ts; bun run typecheck; bun run lint | Pass 2/2: issue ẩn không có trong issues, người ngoài nhận null, client/dev/admin vẫn thấy, có AdminLog |
| P1-20 | apps/web/src/test/admin-ops.test.ts | bun run --cwd apps/web test -- src/test/admin-ops.test.ts; bun run typecheck; bun run lint | Pass 5/5: indexerStatus, reconciliationFindings, stuckIntents, contractConfig chỉ cho ADMIN |
| P1-19 | apps/web/src/test/socket-rate-limit.test.ts; apps/web/src/test/socket-session.test.ts | bun run --cwd apps/web test -- src/test/socket-rate-limit.test.ts src/test/socket-session.test.ts; bun run typecheck; bun run lint | Pass 5/5: tin thứ 11 trong 10 giây bị từ chối; tin sau raisedAt có afterDispute = true |
| N-13 | apps/web, apps/worker (dependency) | `grep -n '"socket.io-client@\|"pino@' bun.lock` | Xong: socket.io-client 4.8.4, pino 9.14.0 trong bun.lock |
| E31 | tests/e2e/e31-flow.test.ts | bun run test:e2e:local | Pass: escrow giảm đúng 100 USDC, developer nhận 97.5 USDC, issue COMPLETED |
| E24 | tests/e2e/e24-replay.test.ts | bun run test:e2e:local | Pass: replay xong, checkpoint IDLE, phase và số tiền giữ nguyên |
| E23 | tests/e2e/e23-reconciler.test.ts | bun run test:e2e:local | Pass: finding mở khi amountRaw lệch, đóng khi sửa lại |
| E22 / N-12 | tests/e2e/e22-reorg.test.ts | bun run test:e2e:local | Pass: deposit A non-canonical, deposit B canonical, projection theo B |
| E17 | tests/e2e/e17-arbiter-timeout.test.ts | bun run test:e2e:local | Pass 2/2: timeout 30 ngày từ raise; nhánh CHALLENGED tính từ challengedAt |
| E16 | tests/e2e/e16-challenge.test.ts | bun run test:e2e:local | Pass 2/2: kháng cáo ra final ruling; kháng cáo sau 7 ngày bị từ chối |
| E15 | tests/e2e/e15-dispute-ruling.test.ts | bun run test:e2e:local | Pass: evidence, initial ruling, finalize, 50/48.75/1.25 |
| E14 | tests/e2e/e14-settlement.test.ts | bun run test:e2e:local | Pass 2/2: bên kia chấp nhận đề xuất; người đề xuất không tự chấp nhận và thu hồi được |
| E13 | tests/e2e/e13-review-timeout.test.ts | bun run test:e2e:local | Pass: review timeout sau mốc, developer 97.5 USDC, fee 2.5 USDC |
| E12 | tests/e2e/e12-missed-delivery.test.ts | bun run test:e2e:local | Pass: refund sau deadline, người ngoài gửi tx, client rút 100 USDC |
| E11 | tests/e2e/e11-claim-auth.test.ts | bun run test:e2e:local | Pass: ví khác bị FORBIDDEN, số dư 0 bị NOTHING_TO_CLAIM |
| E15–E17 / gate D | tests/e2e/e15-dispute-ruling.test.ts; e16-challenge.test.ts; e17-arbiter-timeout.test.ts (thay scanner-deposit.ts, đã xóa ở C1) | bun run test:e2e:local; typecheck; lint; web/worker/database/contracts test | Xong: E15–E17 pass trong harness; commit `test(phase-d): exercise dispute chain flows` |
| E8 | tests/e2e/e08-cancel-reservation.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E8 pass, harness còn thiếu kịch bản; commit `test(e8): cover reservation cancellation` |
| E7 | tests/e2e/e07-reservation-expiry.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | Xong: 3 nhánh pass trong harness; commit `test(e7): cover expired reservations` |
| E6 | tests/e2e/e06-mismatched.test.ts; tests/e2e/harness/funding.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E6 pass, harness còn thiếu kịch bản; commit `test(e6): verify mismatched deposits` |
| E5 | tests/e2e/e05-funding.test.ts; tests/e2e/harness/funding.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | Xong: E1–E5 pass trong harness; commit `test(e5): exercise signed escrow funding` |
| E4 | tests/e2e/e04-selection.test.ts; tests/e2e/harness/fixture.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E4 pass, harness còn thiếu kịch bản; commit `test(e4): exercise developer selection` |
| E3 | tests/e2e/e03-criteria.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E3 pass, harness còn thiếu kịch bản; commit `test(e3): exercise acceptance criteria flow` |
| E2 / BUG-7 | tests/e2e/e02-marketplace.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1/E2 pass, harness còn thiếu kịch bản; commit `fix(e2): deduplicate marketplace views` |
| N-8 / E1 / N-3 | tests/e2e/e01-auth.test.ts; tests/e2e/run-local.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | Xong: harness chạy đủ E1–E31; một lần E1 fail HTTP 429 chưa rõ nguyên nhân (xem CODEX); commit `feat(n-8): start guarded local e2e harness` |
| N-9 | tests/e2e/harness/seed.test.ts | check-env; bun test tests/e2e/harness/seed.test.ts | Pass 1/1 và seed trong harness; commit `feat(n-8): start guarded local e2e harness` |
| N-14 / provider guard | tests/e2e/check-env.test.ts | check-env; bun test tests/e2e/check-env.test.ts; bun run typecheck; bun run lint | Pass 17/17; commit `fix(n-14): block real providers during e2e` |
| AI-11 / mock | tests/e2e/mocks/ai-server.test.ts | check-env; bun test tests/e2e/mocks/ai-server.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `fix(ai-11): update local dispute mock` |
| AI-11 | apps/web/src/test/dispute-analysis.test.ts; apps/web/src/test/dispute-analysis.db.test.ts | migrate deploy test/local; bun run --cwd apps/web test -- hai file trên; bun run typecheck; bun run lint | Pass 4/4; commit `fix(ai-11): recover and audit dispute analysis` |
| P1-28 | apps/web/src/test/graphql-schema.test.ts | bun run --cwd apps/web test -- src/test/graphql-schema.test.ts; bun run typecheck; bun run lint | Pass; commit `fix(p1-28): expose dispute bps and raw amounts` |
| P1-18 | apps/web/src/test/dispute-evidence.db.test.ts; apps/web/src/test/storage-config.test.ts; apps/web/src/test/evidence-download.test.ts | bun run --cwd apps/web test -- các file trên; bun run typecheck; bun run lint | Pass 9/9; commit `feat(p1-18): audit admin evidence access` |
| P1-17 / còn lại | apps/web/src/test/dispute-analysis.test.ts | rg BUG-2; bun run --cwd apps/web test -- src/test/dispute-analysis.test.ts; bun run typecheck; bun run lint | Xong: pass 2/2; AI-11 và frontend ở FE-4/FE-6; commit `docs(p1-17): record remaining review` |
| P1-16f | apps/worker/test/effects-dispute.test.ts; apps/worker/test/scanner-projection.test.ts; apps/worker/test/effects-resolved.test.ts | bun run --cwd apps/worker test; bun run typecheck; bun run lint | Pass 70/70; commit `feat(p1-16f): project dispute events with reorg undo`; E15–E17 pass trong harness |
| P1-16e | apps/web/src/test/dispute-ruling.db.test.ts; apps/web/src/test/escrow-availability.test.ts | bun run --cwd apps/web test -- src/test/dispute-ruling.db.test.ts src/test/escrow-availability.test.ts; bun run typecheck; bun run lint | Pass 8/8; commit `feat(p1-16e): prepare ruling actions` |
| P1-16d | apps/web/src/test/dispute-ruling.db.test.ts | bun run --cwd apps/web test -- src/test/dispute-ruling.db.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `feat(p1-16d): draft safe rulings` |
| P1-16a–c | apps/web/src/test/dispute-evidence.db.test.ts | bun run --cwd apps/web test -- src/test/dispute-evidence.db.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `feat(p1-16): prepare dispute evidence` |
| D-DSP-2 | packages/database/test/ | prisma migrate dev --create-only; migrate deploy test/local; db:generate; bun run typecheck; bun run lint; database test | Pass; commit `feat(d-dsp-2): add on-chain dispute records` |
| Gate phase 0 | web, worker, database, contracts | bun run typecheck; bun run lint; web/worker/database/contracts test | Pass 489/69/3/35; E2E local xanh sau C3; commit `docs(phase-0): record gate` |
| Z-7 | apps/web/src/test/graphql-schema.test.ts | bun run typecheck; bun run lint; bun run --cwd apps/web test -- src/test/graphql-schema.test.ts | Pass; commit `chore(z-7): remove obsolete e2e scripts` |
| Z-6 | xong | K1: bun run --cwd apps/web build exit 0 với NODE_ENV=production; analytics-projection.test.ts 4/4 pass; commit của K1 |
| K2 | xong | escrow-reservation.test.ts: query clientWallet/developerWallet khi AWAITING_FUNDING |
| K3 | xong | wallet-signer.test.ts: ví khác tài khoản thì từ chối ký |
| K4 | xong | github-webhook.test.ts: giữ commitSha, redelivery sau lỗi, latest submission |
| Z-5 | docs/plan/parallel/reports/CODEX.md | bun run typecheck; bun run lint; đối chiếu LOCAL_TEST_MATRIX.md | Pass; commit `docs(z-5): correct task status table` |
| Z-4 | apps/worker/test/intents.test.ts; apps/worker/test/rpc.test.ts | bun run --cwd apps/worker test -- test/intents.test.ts test/rpc.test.ts; bun run typecheck; bun run lint | Pass 14/14; commit `fix(z-4): confirm approvals at finality` |
| Z-3 / ui | apps/web/src/test/ui-preferences.test.tsx | bun run typecheck; bun run lint; web/worker/database/contracts test | Pass; merge `2f27bc2`, sửa kỳ vọng `fix(z-3): align merged ui checks` |
| Z-3 / a5 | — | Gate phase 0 sau ba merge | Pass gate; commit `merge(z-3): integrate dispute chat ai` |
| Z-3 / a1 | — | Gate phase 0 sau ba merge | Pass gate; commit `merge(z-3): integrate platform` |
| Z-2 | tests/e2e/check-env.ts; tests/e2e/scanner-deposit.ts | bun run tests/e2e/check-env.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts; bun run typecheck; bun run lint | Pass với bloody_codex_test; commit `fix(z-2): run scanner with managed hardhat` |
| Z-1 / BE-35 | apps/worker/test/intent-race.test.ts | bun run --cwd apps/worker test -- test/intent-race.test.ts; bun run typecheck; bun run lint | Pass; commit `fix(be-35): reconcile indexed intents in batches`; E2E xanh sau Z-2 |
| 2.2 | — | — | Xong: manifest local và tài khoản Hardhat đã dùng trong harness (gate xanh) |
| N-14 | tests/e2e/check-env.test.ts | bun test tests/e2e/check-env.test.ts | Pass 10/10; `79c14b4` |
| N-1 / P0-9 | packages/database/test/test-guard.test.ts; apps/web/src/test/escrow-reservation.db.test.ts | bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts; bun run --cwd apps/worker test | Pass; `6080c61` |
| Review: local DB | — | bun run --cwd packages/database db:migrate:prod | Pass; bloody_codex_local |
| Review: runtime ignore | — | git check-ignore tests/e2e/.run/example.pid | Pass; `6080c61` |
| P0-1 | — | — | Xong: template đã gỡ ở `3118318` |
| P0-2 | apps/worker/test/effects-escrow.test.ts | bun run --cwd apps/worker test | Pass 45/45; `fe78f0e` |
| P0-3 | apps/worker/test/effects-escrow.test.ts; apps/web/src/test/escrow-core/fold.test.ts | bun run --cwd apps/worker typecheck | Pass; `d39cc3b`, `d8fc33e` |
| N-2 | apps/web/src/test/escrow-integration.test.ts; apps/worker/test/config.test.ts | bun run --cwd apps/web test -- src/test/escrow-integration.test.ts | Pass; `f9903af` |
| N-3 | apps/web/src/test/issue-terms.test.ts; apps/web/src/test/escrow-reservation.test.ts | bun run --cwd apps/web test -- src/test/issue-terms.test.ts src/test/escrow-reservation.test.ts | Pass; `e19d656` |
| N-5 | — | PORT=4012 bun run --cwd apps/web serve:local; GET /api/health | Pass; `c21c18d` |
| N-7 | tests/e2e/mocks/ai-server.test.ts | bun test tests/e2e/mocks/ai-server.test.ts | Pass; `3858428` |
| P0-5 | apps/web/src/test/escrow-token.test.ts; apps/web/src/test/escrow-reservation.test.ts | bun run --cwd apps/web test -- src/test/escrow-token.test.ts src/test/escrow-reservation.test.ts | Pass; `deb01d4` |
| P0-6 | apps/web/src/test/escrow-release.test.ts | bun run --cwd apps/web test -- src/test/escrow-release.test.ts | Pass; `fb0a25f` |
| P0-7 | packages/database/test/notifications.test.ts | bun run --cwd packages/database test | Pass; `c9eb936` |
| P0-8 | apps/worker/test/reorg.test.ts | bun run --cwd apps/worker test -- test/reorg.test.ts | Pass; `8301319` |
| P0-4 | apps/web/src/test/graphql-schema.test.ts | bun run --cwd apps/web test -- src/test/graphql-schema.test.ts | Xong: backend `2c0e108`; graphql-schema.test.ts khẳng định các trường cũ đã gỡ |
| P1-17 | apps/web/src/test/dispute-analysis.test.ts | bun run --cwd apps/web test -- src/test/dispute-analysis.test.ts | Xong: backend `2c0e108`; frontend ở FE-4/FE-6 |
| N-4 | apps/worker/test/scanner.test.ts; apps/worker/test/rpc.test.ts | bun run --cwd apps/worker test -- test/scanner.test.ts test/rpc.test.ts test/config.test.ts | Pass 13/13; `42f4335` |
| P1-6 | apps/worker/test/scheduler.test.ts | bun run --cwd apps/worker test | Pass 48/48; `f287f80` |
| P1-7 | apps/worker/test/rpc.test.ts | bun run --cwd apps/worker test | Pass 48/48 và smoke Hardhat; `5468126` |
| P1-1 | apps/worker/test/scanner-projection.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/worker test -- test/scanner-projection.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass với database test và Hardhat local; `8a3c28d` |
| 2.3 | tests/e2e/scanner-deposit.ts | bun run --cwd apps/contracts deploy:local; eth_accounts | Pass vai trò #0/#5/#6; `9f85dfc` |
| P1-2 | apps/worker/test/scanner-projection.test.ts; apps/worker/test/reorg.test.ts; apps/worker/test/replay.test.ts | bun run --cwd apps/worker test; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass deposit reorg/replay; `50df7d0` |
| E22 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass Hardhat snapshot/revert deposit; `50df7d0` |
| E24 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass replay CLI; `50df7d0` |
| P1-3 | apps/worker/test/reconciliation.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/worker test; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass; `eb13815` |
| E23 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass mismatch projection, claimable, solvency; `eb13815` |
| P1-4 | apps/worker/test/intents.test.ts | bun run --cwd apps/worker test -- test/intents.test.ts | Pass 7/7; `df7418b`; trace không hỗ trợ thì lý do chung |
| P1-5 | apps/worker/test/reservations.test.ts; apps/worker/test/deadline-notifications.test.ts; apps/worker/test/effects-escrow.test.ts | bun run --cwd apps/worker test | Pass; `1fb8c75` |
| E7 | apps/worker/test/reservations.test.ts | bun run --cwd apps/worker test -- test/reservations.test.ts | Pass job/idempotency; E2E e07 pass trong harness |
| E30 | apps/worker/test/deadline-notifications.test.ts | bun run --cwd apps/worker test -- test/deadline-notifications.test.ts | Pass job/pg_notify; E2E e30 pass trong harness |
| P1-8 | apps/web/src/test/escrow-deposit.test.ts; apps/worker/test/effects-escrow.test.ts | bun run --cwd apps/web test -- src/test/escrow-deposit.test.ts; bun run --cwd apps/worker test | Pass; `a777558` |
| E5 | tests/e2e/e05-funding.test.ts | bun run test:e2e:local | Xong: deposit thực và thông báo pass trong harness (scanner-deposit.ts đã xóa ở C1); `a777558` |
| P1-9 | apps/web/src/test/submission-draft.test.ts; apps/worker/test/scanner-projection.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/submission-draft.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass; `e538635`, `2c417cd` |
| E9 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass Hardhat với fixture deposit, reorg và resubmit; `2c417cd` |
| P1-10 | apps/worker/test/effects-resolved.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/worker test -- test/effects-resolved.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 7/7 và release/reorg Hardhat; `ffb6f50` |
| E10 | tests/e2e/e10-release-claim.test.ts | bun run test:e2e:local | Xong: release và claim pass trong harness; `ffb6f50` |
| P1-11 | apps/web/src/test/settlement.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/settlement.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 5 test và settlement/reorg Hardhat; `eebb77e` |
| E14 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass với fixture deposit, accept/revoke và reorg; `eebb77e` |
| P1-12 | apps/web/src/test/escrow-availability.test.ts; apps/web/src/test/issue-availability.test.ts; apps/web/src/test/escrow-chain-time.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/escrow-availability.test.ts src/test/issue-availability.test.ts src/test/escrow-chain-time.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 12/12, Hardhat tăng thời gian; `f875b62`, `7cd68e3` |
| P1-13 | apps/web/src/test/test-case-terms.db.test.ts; apps/web/src/test/ai-test-cases.test.ts; apps/web/src/test/ai-testgen.test.ts | bun run --cwd apps/web test -- src/test/test-case-terms.db.test.ts | Pass test DB thật và race; `07397ca` |
| P1-9 deadline | apps/web/src/test/submission-draft.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/submission-draft.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 11/11 và evm_increaseTime; `321d55b` |
| P1-14 | apps/web/src/test/analytics-projection.test.ts; apps/web/src/test/analytics-projection.db.test.ts | bun run --cwd apps/web test -- src/test/analytics-projection.test.ts src/test/analytics-projection.db.test.ts | Pass unit và PostgreSQL test; `1fce246` |
| P1-15 | apps/web/src/test/submission.db.test.ts; apps/web/src/test/escrow-reservation.db.test.ts | bun run --cwd apps/web test -- src/test/submission.db.test.ts src/test/escrow-reservation.db.test.ts | Pass 3/3 trên test DB; `9c0da1e` |
| P1-36 | packages/shared/src/escrow/abi.ts; apps/contracts/contracts/BloodyRoarEscrow.sol | bun -e kiểm số event ABI/contract | Pass 19 = 15 + 4; `bd198a6` |
| P1-37 / D5 | apps/web/src/test/issue-pagination-files.db.test.ts; apps/web/src/test/graphql-schema.test.ts | bun run --cwd apps/web test -- src/test/issue-pagination-files.db.test.ts | Pass DB và schema; `dde1bc7` |
| D4 | apps/web/src/test/profile-input.test.ts | bun run --cwd apps/web test -- src/test/profile-input.test.ts | Pass 4/4; đã có validation/unique |
| BE-48 / E10 / E11 | apps/worker/test/effects-claimed.test.ts; apps/worker/test/reorg.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/worker test -- test/effects-claimed.test.ts test/reorg.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass claim/reorg Hardhat; fixture reservation; `3c872b3` |
| BE-45/BE-46 / E12/E13 | apps/web/src/test/escrow-release.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/escrow-release.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 18/18 và Hardhat; `6a44ad2` |
