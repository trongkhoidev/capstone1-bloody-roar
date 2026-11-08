# Prompt cho AGY: hoàn tất nhánh `be/integration` và mở PR vào `main`

Ngày: 2026-11-01. Đọc kỹ trước khi bắt đầu. Làm đúng thứ tự.

---

## 0. Bối cảnh

- Làm việc trong worktree: `/Users/admin/repos/capstone1-wt/integration`, nhánh `be/integration`.
- Đầu nhánh hiện tại: `9cb5670`. Có 192 commit chưa push. `origin/be/integration` là tổ tiên của nhánh này, nên push sẽ là fast-forward.
- `main` là tổ tiên của `be/integration`, nên PR sẽ không có conflict với `main`. PR có khoảng 318 commit.
- Chỉ làm trong worktree này.
  - Không xóa worktree, nhánh hay tag nào.
  - Không sửa `/Users/admin/repos/capstone1` (worktree chính có thay đổi chưa commit). Đó là nguồn tham chiếu, chỉ đọc.
  - Không sửa `.worktrees/` hay `capstone1-wt/a1..a5`, `a4-int`.
- Plan đầy đủ: `/Users/admin/repos/capstone1/docs/plan/MERGE_TO_BE_INTEGRATION_2026-10-31.md`. Đọc khối "Cập nhật 2026-11-01" ở đầu file.
- Quy tắc dự án: `AGENTS.md`, `CLAUDE.md`.
  - Chỉ dùng `bun`, không dùng `npm` hay `pnpm`.
  - Diff tối giản. Không thêm abstraction, option hay tính năng ngoài danh sách.
  - Chỉ dùng CLI để kiểm tra. Không mở trình duyệt.

## 1. Quyết định đã chốt (không hỏi lại)

- D0: nhánh chung là `be/integration`.
- D1: `prepareClaim` chỉ cho rút số dư của ví đang đăng nhập. Giữ kiểm tra này. Thêm validate định dạng địa chỉ.
- D2: giữ hỗ trợ chạy local bằng Hardhat (chain 31337). Testnet đi trước.
- D3: bỏ `seed-realistic.ts`.
- D4: chuyển docs cũ và file HTML vào repo như mục 3.4.
- D5: push `be/integration` và mở PR vào `main`. Không xóa nhánh nào.

## 2. Đã có sẵn, không làm lại

`be/integration` đã có:

- Toàn bộ backend escrow: release, refund, claim, timeout, reservation, funding intent, indexer, worker.
- Chain local qua `CHAIN_ID` (server) và `NEXT_PUBLIC_CHAIN_ID` (client, biến `ACTIVE_CHAIN` trong `apps/web/src/lib/web3/client.ts`). `apps/web/src/lib/env.ts` nạp `.env` ở gốc.
- Test guard DB ở `packages/database/src/test-guard.ts`.
- `assignDeveloper` đã bị xóa.
- Các migration từ `20260824120000_init` đến `20261031173000_drop_legacy_escrow_tables`.

Không thêm migration nào trong PR này. Không sửa `schema.prisma`.

## 3. Thay đổi cần làm

Kiểm tra trước: `git status --short` trong worktree phải hiện đúng 3 file UI chưa commit (mục 3.1). Nếu khác, dừng và báo lại.

### 3.1 Commit 1: UI và kết nối đúng chain

Ba file đã có sẵn trong worktree, chưa commit:

- `apps/web/src/components/auth/wallet-icons.tsx` (file mới, untracked)
- `apps/web/src/components/auth/connect-modal.tsx`
- `apps/web/src/components/layout/user-menu.tsx`

Sửa thêm trong `apps/web/src/components/auth/connect-modal.tsx`:

- Ở import từ `client`: đổi `ensureBaseSepolia` thành `ensureActiveChain`.
- Ở lời gọi (khoảng dòng 53): `await ensureBaseSepolia(option.id);` đổi thành `await ensureActiveChain(option.id);`.

Trong `apps/web/src/lib/web3/client.ts`: xóa dòng `export const ensureBaseSepolia = ...` nếu `git grep -n ensureBaseSepolia -- apps` không còn caller nào. Giữ `BASE_SEPOLIA_CHAIN`, vì `ACTIVE_CHAIN` đang dùng nó.

Message: `feat(ui): wallet logos and icon-only copy button; connect to the active chain`

### 3.2 Commit 2: validate địa chỉ ở prepareClaim

File: `apps/web/src/graphql/modules/escrow/release.module.ts`. Trong `builder.mutationField("prepareClaim", ...)`, ngay sau dòng `const recipient = String(args.recipient);` và trước `if (!sameWallet(recipient, user.walletAddress))`, thêm:

```ts
      if (!/^0x[0-9a-fA-F]{40}$/.test(recipient))
        throw gqlError("Địa chỉ nhận không hợp lệ", "BAD_USER_INPUT");
```

Giữ nguyên kiểm tra `sameWallet`. Không nới quyền.

Test: `apps/web/src/test/escrow-release.test.ts`, trong `describe("prepareClaim and myClaimable (BE-48)")`. Thêm một test cạnh `refuses to claim another wallet's balance`, dùng cùng cách gọi `execute(CLAIM, ...)`. Input là địa chỉ sai định dạng, ví dụ `"0x1234"`. Kết quả mong đợi: `result.errors?.[0]?.extensions?.code` bằng `"BAD_USER_INPUT"`.

Message: `fix(escrow): reject malformed claim recipient addresses`

### 3.3 Commit 3: chạy local bằng Hardhat

a) `apps/contracts/scripts/deploy.ts`. Trong nhánh `if (!tokenAddress)` của `if (isLocal)`, ngay sau dòng `console.log(\`Local MockUSDC deployed to ${tokenAddress}\`);`, thêm:

```ts
      // No faucet in the app: fund the default Hardhat accounts so local deposits work.
      for (const signer of signers.slice(0, 10)) {
        await (await token.mint(signer.address, 1_000_000n * 10n ** 6n)).wait();
      }
```

Dùng biến `signers` có sẵn (khai báo khoảng dòng 39). Không khai báo lại.

b) Copy `/Users/admin/repos/capstone1/packages/database/src/seed-local-token.ts` sang `packages/database/src/seed-local-token.ts`. Sửa dòng comment `with ESCROW_CHAIN_ID=31337` thành `with CHAIN_ID=31337`. Giữ nguyên logic. Manifest là `apps/contracts/deployments/localhost.json`, trường `token` ở cấp cao nhất, `chainId` là chuỗi.

c) `packages/database/package.json`: thêm dòng sau ngay dưới `"db:seed:demo"`:

```json
    "db:seed:local": "bun --env-file=../../.env run src/seed-local-token.ts",
```

d) `package.json` gốc: thêm dòng sau ngay dưới `"db:seed:demo"`:

```json
    "db:seed:local": "bun run --cwd packages/database db:seed:local",
```

Message: `feat(local): mint MockUSDC to Hardhat accounts and register the local bounty token`

### 3.4 Commit 4: docs và file HTML

- Copy `/Users/admin/repos/capstone1/docs/plan/BACKEND_STATUS_2026-10-27.md` sang `docs/plan/archive/2026-10-27/BACKEND_STATUS_2026-10-27.md`.
- Copy cả thư mục `/Users/admin/repos/capstone1/docs/plan/parallel/` (6 file) sang `docs/plan/archive/2026-10-27/parallel/`.
- Copy `/Users/admin/repos/capstone1/Bloody-Roar Marketplace - revised.html` sang `docs/design/bloody-roar-marketplace-revised.html`.
- Không sửa `docs/plan/README.md`.

Message: `docs: archive 27/10 plans and store the marketplace design file`

### 3.5 Không port (đã loại có chủ ý)

- `packages/database/src/seed-realistic.ts` và mọi dòng `db:seed:realistic`.
- Mọi thay đổi trong `apps/web/scripts/e2e-*.ts`.
- `apps/web/next.config.mjs`, `apps/web/src/lib/auth/siwe.ts`, `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/nonce/route.ts`, `apps/web/src/graphql/modules/issue/issue.module.ts`, `packages/shared/src/constants/index.ts`.
- Mọi biến và hàm `ESCROW_CHAIN_ID`, `NEXT_PUBLIC_ESCROW_CHAIN_ID`, `activeChainId`, `authChainId`, `PRODUCT_CHAIN`.
- Mọi thay đổi trong `fix/backend-review` và `52f5fae` (đã được xử lý trong plan).
- Migration `20261029000000_review_blockers`.

Nếu thấy cần port thứ không có trong danh sách 3.1 đến 3.4, dừng và báo lại. Không tự thêm.

## 4. Kiểm tra (gate). Chạy đúng thứ tự, ghi lệnh và kết quả thật

- G1: `bun install --frozen-lockfile`. Kết quả: `bun.lock` không đổi.
- G2: `bun run typecheck`.
- G3: `bun run lint`. Cảnh báo được chấp nhận, exit code phải bằng 0.
- G4: `cd apps/web && bunx vitest run`. Chạy toàn bộ unit test.
- G5: `bun run --cwd packages/database test` và `bun run --cwd apps/worker test`.
- G6: `bun run contracts:test`.
- G7: kiểm tra migration.
  1. Tạo hai database trên Postgres local: `bloody_roar_verify` (đích) và `bloody_roar_shadow` (shadow).
  2. Áp toàn bộ migration lên DB trống: `DATABASE_URL=<url bloody_roar_verify> bun run --cwd packages/database db:migrate:prod`. Không dùng `db:migrate`, vì `prisma migrate dev` có thể reset dữ liệu.
  3. So sánh migration với schema: `cd packages/database && bunx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <url bloody_roar_shadow>`. Kết quả phải là `No difference detected`.
- G8: `bun run test:e2e:backend` (chạy `tests/e2e/run-local.ts`, dựng Hardhat local, server và DB test).
  - Đọc `tests/e2e/check-env.ts` và `tests/e2e/run-local.ts` để biết biến môi trường cần đặt. `TEST_DATABASE_URL` phải trỏ đến DB có tên kết thúc bằng `_test`, host `localhost`.
  - Nếu không chạy được vì thiếu hạ tầng, ghi rõ lý do. Không ghi là đã pass.

Nếu gate nào fail: ghi lỗi, xác định xem lỗi có sẵn trên `be/integration` trước khi làm hay do thay đổi của bạn. Chỉ sửa lỗi do thay đổi của bạn.

## 5. Vòng ponytail-review (lặp, tối đa 5 vòng)

Phạm vi mỗi vòng: `git diff main...be/integration`, cả PR. Chia thành bốn nhóm để review:

- (a) Escrow, claim, chain: `apps/web/src/graphql/modules/escrow`, `apps/web/src/lib/escrow`, `apps/worker`, `packages/shared/src/escrow`.
- (b) Migration và schema: `packages/database`.
- (c) Auth, web3, UI: `apps/web/src/lib/auth`, `apps/web/src/app/api/auth`, `apps/web/src/lib/web3`, `apps/web/src/components`.
- (d) Phần còn lại.

Chạy skill `ponytail:ponytail-review` trên từng nhóm. Nếu không có skill, tự kiểm tra theo năm tiêu chí: logic đúng, an toàn (phân quyền, validate ở biên, rò rỉ khóa), chịu tải và race condition, có test cho phần rủi ro, tối giản.

Với mỗi finding:

1. Kiểm chứng trước khi sửa: đọc code, chạy test nếu cần. Finding sai thì bỏ và ghi lý do.
2. Finding đúng và thuộc nhóm correctness, security, data loss, migration hoặc auth: sửa tối giản. Nếu là logic mới thì thêm test. Commit riêng với message `fix(<scope>): ...`.
3. Finding về style, hoặc lỗi có sẵn ở code không thuộc diff PR và không ảnh hưởng luồng mới: ghi vào mục "Known issues" của PR body. Không sửa trong PR này.

Sau mỗi vòng sửa, chạy lại G2 đến G6. Chạy lại G7 và G8 nếu vòng đó đụng schema, migration, escrow, auth hoặc chain.

Kết thúc vòng lặp khi cả hai điều kiện đúng:

- Không còn finding nghiêm trọng (correctness, security, data loss, migration, auth).
- Gate đều pass.

Nếu sau 5 vòng vẫn còn finding nghiêm trọng hoặc gate fail: dừng. Không push, không mở PR. Báo danh sách còn lại.

## 6. Push và mở PR (chỉ khi mục 4 và 5 đều đạt)

1. `git fetch origin`. Xác nhận fast-forward: `git merge-base --is-ancestor origin/be/integration be/integration`. Không dùng `--force`.
2. `git push -u origin be/integration`.
3. Kiểm tra chưa có PR: `gh pr list --head be/integration --state all`. Nếu đã có PR mở, báo lại thay vì tạo trùng.
4. Viết PR body vào file trong scratchpad, không ghi vào repo. Nội dung:
   - Tóm tắt phạm vi: khoảng 318 commit so với `main`, gồm 40 commit của `feat/ledger-palette-copy` và 278 commit của `be/integration`.
   - Danh sách 13 migration có trong nhánh.
   - Các nhóm thay đổi ở mục 3.1 đến 3.4, kèm commit hash.
   - Bảng gate G1 đến G8, mỗi dòng có kết quả thật.
   - Số vòng ponytail-review, finding đã sửa, finding đã bỏ và lý do.
   - Mục "Known issues".
   - Lưu ý cho người review:
     - Migration `20261031173000_drop_legacy_escrow_tables` xóa bảng `escrows`, `transactions` và cột `disputes.escrowId`.
     - Quyết định D1 về `prepareClaim`.
   - PR body viết tiếng Việt. Không dùng `@tên` (tránh thông báo nhầm).
5. `gh pr create --base main --head be/integration --title "<tiêu đề>" --body-file <đường dẫn file>`.
   - Tiêu đề gợi ý: `Consolidate backend escrow flow, chat, AI and UI into main`.
   - Mở PR thường, không mở draft.
6. In URL PR.

## 7. Ràng buộc

- Không xóa nhánh, worktree, hay tag.
- Không `git push --force`.
- Không commit file `.env`, khóa riêng, hay `.worktrees/`.
- Commit từng nhóm riêng, không gộp.
- Commit message bằng tiếng Anh, theo Conventional Commits.

## 8. Báo cáo cuối

- Bảng commit: hash và message.
- Bảng gate: lệnh, exit code, kết quả chính. Ghi rõ gate nào chưa chạy được và vì sao.
- Số vòng ponytail-review, finding đã sửa, finding đã bỏ kèm lý do.
- URL PR.
- Những gì chưa xác minh.
