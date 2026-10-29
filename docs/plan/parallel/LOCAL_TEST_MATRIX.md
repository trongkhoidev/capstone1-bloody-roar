# Ma trận test local

| Mã | File test | Lệnh | Trạng thái |
| --- | --- | --- | --- |
| 2.2 | — | — | Dở: chờ manifest và xác nhận tài khoản hardhat |
| N-14 | tests/e2e/check-env.test.ts | bun test tests/e2e/check-env.test.ts | Pass 10/10; `79c14b4` |
| N-1 / P0-9 | packages/database/test/test-guard.test.ts; apps/web/src/test/escrow-reservation.db.test.ts | bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts; bun run --cwd apps/worker test | Pass; `6080c61` |
| Review: local DB | — | bun run --cwd packages/database db:migrate:prod | Pass; bloody_codex_local |
| Review: runtime ignore | — | git check-ignore tests/e2e/.run/example.pid | Pass; `6080c61` |
| P0-1 | — | — | Dở: xóa template `3118318`; chờ kiểm nơi tạo/E2E |
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
| P0-4 | apps/web/src/test/graphql-schema.test.ts | bun run --cwd apps/web test -- src/test/graphql-schema.test.ts | Dở: backend pass `2c0e108`; frontend/E2E cũ còn tham chiếu |
| P1-17 | apps/web/src/test/dispute-analysis.test.ts | bun run --cwd apps/web test -- src/test/dispute-analysis.test.ts | Dở: backend pass `2c0e108`; frontend cũ còn tham chiếu |
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
| E7 | apps/worker/test/reservations.test.ts | bun run --cwd apps/worker test -- test/reservations.test.ts | Pass job/idempotency; E2E toàn luồng chờ harness |
| E30 | apps/worker/test/deadline-notifications.test.ts | bun run --cwd apps/worker test -- test/deadline-notifications.test.ts | Pass job/pg_notify; E2E toàn luồng chờ harness |
| P1-8 | apps/web/src/test/escrow-deposit.test.ts; apps/worker/test/effects-escrow.test.ts | bun run --cwd apps/web test -- src/test/escrow-deposit.test.ts; bun run --cwd apps/worker test | Pass; `a777558` |
| E5 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass deposit thực và thông báo với fixture reservation; toàn luồng E1–E4 chờ harness; `a777558` |
