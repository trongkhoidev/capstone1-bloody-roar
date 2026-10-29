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
| P0-3 | apps/worker/test/effects-escrow.test.ts | bun run --cwd apps/worker test; bun run --cwd apps/worker typecheck | Dở: test 45/45 pass; typecheck còn 2 lỗi effect; `d39cc3b` |
