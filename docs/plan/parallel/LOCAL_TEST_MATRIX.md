# Ma trận test local

| Mã | File test | Lệnh | Trạng thái |
| --- | --- | --- | --- |
| E15–E17 / gate D | tests/e2e/scanner-deposit.ts | check-env; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts; typecheck; lint; web/worker/database/contracts test | Pass scanner và 499/70/3/35; upload hai bước chờ P1-30a; commit `test(phase-d): exercise dispute chain flows` |
| E6 | tests/e2e/e06-mismatched.test.ts; tests/e2e/harness/funding.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E6 pass, harness còn thiếu kịch bản; commit `test(e6): verify mismatched deposits` |
| E5 | tests/e2e/e05-funding.test.ts; tests/e2e/harness/funding.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E5 pass, harness còn thiếu kịch bản; commit `test(e5): exercise signed escrow funding` |
| E4 | tests/e2e/e04-selection.test.ts; tests/e2e/harness/fixture.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E4 pass, harness còn thiếu kịch bản; commit `test(e4): exercise developer selection` |
| E3 | tests/e2e/e03-criteria.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1–E3 pass, harness còn thiếu kịch bản; commit `test(e3): exercise acceptance criteria flow` |
| E2 / BUG-7 | tests/e2e/e02-marketplace.test.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | E1/E2 pass, harness còn thiếu kịch bản; commit `fix(e2): deduplicate marketplace views` |
| N-8 / E1 / N-3 | tests/e2e/e01-auth.test.ts; tests/e2e/run-local.ts | check-env; bun run test:e2e:local; bun run typecheck; bun run lint | Dở: E1 pass, harness fail vì còn thiếu E2–E17/E22–E24/E31; commit `feat(n-8): start guarded local e2e harness` |
| N-9 | tests/e2e/harness/seed.test.ts | check-env; bun test tests/e2e/harness/seed.test.ts | Pass 1/1 và seed trong harness; commit `feat(n-8): start guarded local e2e harness` |
| N-14 / provider guard | tests/e2e/check-env.test.ts | check-env; bun test tests/e2e/check-env.test.ts; bun run typecheck; bun run lint | Pass 17/17; commit `fix(n-14): block real providers during e2e` |
| AI-11 / mock | tests/e2e/mocks/ai-server.test.ts | check-env; bun test tests/e2e/mocks/ai-server.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `fix(ai-11): update local dispute mock` |
| AI-11 | apps/web/src/test/dispute-analysis.test.ts; apps/web/src/test/dispute-analysis.db.test.ts | migrate deploy test/local; bun run --cwd apps/web test -- hai file trên; bun run typecheck; bun run lint | Pass 4/4; commit `fix(ai-11): recover and audit dispute analysis` |
| P1-28 | apps/web/src/test/graphql-schema.test.ts | bun run --cwd apps/web test -- src/test/graphql-schema.test.ts; bun run typecheck; bun run lint | Pass; commit `fix(p1-28): expose dispute bps and raw amounts` |
| P1-18 | apps/web/src/test/dispute-evidence.db.test.ts; apps/web/src/test/storage-config.test.ts; apps/web/src/test/evidence-download.test.ts | bun run --cwd apps/web test -- các file trên; bun run typecheck; bun run lint | Pass 9/9; commit `feat(p1-18): audit admin evidence access` |
| P1-17 / còn lại | apps/web/src/test/dispute-analysis.test.ts | rg BUG-2; bun run --cwd apps/web test -- src/test/dispute-analysis.test.ts; bun run typecheck; bun run lint | Pass 2/2; AI-11 và frontend chờ; commit `docs(p1-17): record remaining review` |
| P1-16f | apps/worker/test/effects-dispute.test.ts; apps/worker/test/scanner-projection.test.ts; apps/worker/test/effects-resolved.test.ts | bun run --cwd apps/worker test; bun run typecheck; bun run lint | Pass 70/70; commit `feat(p1-16f): project dispute events with reorg undo`; E15–E17 chờ harness |
| P1-16e | apps/web/src/test/dispute-ruling.db.test.ts; apps/web/src/test/escrow-availability.test.ts | bun run --cwd apps/web test -- src/test/dispute-ruling.db.test.ts src/test/escrow-availability.test.ts; bun run typecheck; bun run lint | Pass 8/8; commit `feat(p1-16e): prepare ruling actions` |
| P1-16d | apps/web/src/test/dispute-ruling.db.test.ts | bun run --cwd apps/web test -- src/test/dispute-ruling.db.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `feat(p1-16d): draft safe rulings` |
| P1-16a–c | apps/web/src/test/dispute-evidence.db.test.ts | bun run --cwd apps/web test -- src/test/dispute-evidence.db.test.ts; bun run typecheck; bun run lint | Pass 2/2; commit `feat(p1-16): prepare dispute evidence` |
| D-DSP-2 | packages/database/test/ | prisma migrate dev --create-only; migrate deploy test/local; db:generate; bun run typecheck; bun run lint; database test | Pass; commit `feat(d-dsp-2): add on-chain dispute records` |
| Gate phase 0 | web, worker, database, contracts | bun run typecheck; bun run lint; web/worker/database/contracts test | Pass 489/69/3/35; E2E local chờ G1; commit `docs(phase-0): record gate` |
| Z-7 | apps/web/src/test/graphql-schema.test.ts | bun run typecheck; bun run lint; bun run --cwd apps/web test -- src/test/graphql-schema.test.ts | Pass; commit `chore(z-7): remove obsolete e2e scripts` |
| Z-6 | — | bun run build (worktree, tracing root, tracing exclusions); bun run typecheck; bun run lint | Bị chặn: build Division by zero cả ba cách; commit `docs(z-6): record build tracing failure` |
| Z-5 | docs/plan/parallel/reports/CODEX.md | bun run typecheck; bun run lint; đối chiếu LOCAL_TEST_MATRIX.md | Pass; commit `docs(z-5): correct task status table` |
| Z-4 | apps/worker/test/intents.test.ts; apps/worker/test/rpc.test.ts | bun run --cwd apps/worker test -- test/intents.test.ts test/rpc.test.ts; bun run typecheck; bun run lint | Pass 14/14; commit `fix(z-4): confirm approvals at finality` |
| Z-3 / ui | apps/web/src/test/ui-preferences.test.tsx | bun run typecheck; bun run lint; web/worker/database/contracts test | Pass; merge `2f27bc2`, sửa kỳ vọng `fix(z-3): align merged ui checks` |
| Z-3 / a5 | — | Gate phase 0 sau ba merge | Pass gate; commit `merge(z-3): integrate dispute chat ai` |
| Z-3 / a1 | — | Gate phase 0 sau ba merge | Pass gate; commit `merge(z-3): integrate platform` |
| Z-2 | tests/e2e/check-env.ts; tests/e2e/scanner-deposit.ts | bun run tests/e2e/check-env.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts; bun run typecheck; bun run lint | Pass với bloody_codex_test; commit `fix(z-2): run scanner with managed hardhat` |
| Z-1 / BE-35 | apps/worker/test/intent-race.test.ts | bun run --cwd apps/worker test -- test/intent-race.test.ts; bun run typecheck; bun run lint | Pass; commit `fix(be-35): reconcile indexed intents in batches`; E2E chờ Z-2 |
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
| P1-9 | apps/web/src/test/submission-draft.test.ts; apps/worker/test/scanner-projection.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/web test -- src/test/submission-draft.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass; `e538635`, `2c417cd` |
| E9 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass Hardhat với fixture deposit, reorg và resubmit; `2c417cd` |
| P1-10 | apps/worker/test/effects-resolved.test.ts; tests/e2e/scanner-deposit.ts | bun run --cwd apps/worker test -- test/effects-resolved.test.ts; NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Pass 7/7 và release/reorg Hardhat; `ffb6f50` |
| E10 | tests/e2e/scanner-deposit.ts | NODE_ENV=test bun run tests/e2e/scanner-deposit.ts | Dở: release và credit pass, effect claim chưa triển khai; `ffb6f50` |
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
