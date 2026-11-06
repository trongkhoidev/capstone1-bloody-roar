# Gộp về một nhánh chung: `be/integration`

- Ngày lập: 2026-11-01. Số liệu đối chiếu lấy ngày 2026-10-31.
- Trạng thái: kế hoạch, chưa thực hiện. Chưa commit, chưa push, chưa xóa gì.
- Đối chiếu tại thời điểm lập: HEAD `feat/ledger-palette-copy` @ `3bf6aab`; `be/integration` @ `9cb5670`; `origin/main` @ `33aed2e`.

> **Cập nhật 2026-11-01: quyết định đã chốt và sửa sai**
>
> - Đã chốt: D0 nhánh chung là `be/integration`. D1 giữ kiểm tra "chỉ ví mình" và thêm validate địa chỉ. D2 giữ hỗ trợ local Hardhat. D3 bỏ `seed-realistic.ts`. D4 chuyển docs và file HTML. D5 push `be/integration` và mở PR vào `main`, chưa xóa nhánh nào. Worktree không cần dọn.
> - Sửa sai ở mục 3.2 (B-1): test guard đã có ở `packages/database/src/test-guard.ts`. Bỏ port.
> - Sửa sai ở mục 5: `be/integration` đã có cơ chế chain local qua `CHAIN_ID` (server) và `NEXT_PUBLIC_CHAIN_ID` (client, `ACTIVE_CHAIN`). `lib/env.ts` nạp `.env` gốc trước khi server khởi động. Không port nhóm `ESCROW_CHAIN_ID`, `activeChainId()`, `authChainId()`, `PRODUCT_CHAIN`, và loader trong `next.config.mjs`. Lỗi thật cần sửa là `connect-modal.tsx` gọi `ensureBaseSepolia` khi kết nối ví, nên ví local bị ép sang Base Sepolia. Đổi sang `ensureActiveChain`.
> - Port thêm cho local: `deploy.ts` mint MockUSDC cho signer Hardhat, `seed-local-token.ts`, script `db:seed:local`. Lý do: `seed.ts` gán USDC cố định địa chỉ Base Sepolia cho mọi chain, kể cả 31337.
> - Prompt thực hiện: `docs/plan/AGY_PROMPT_MERGE_2026-11-01.md`. Prompt này thay thế các bước thực hiện ở mục 8.

---

## 1. Kết luận

**Nhánh chung đề xuất: `be/integration`** (worktree `/Users/admin/repos/capstone1-wt/integration`).

Lý do:

- `be/integration` chứa toàn bộ HEAD hiện tại. `feat/ledger-palette-copy` là tổ tiên của nó.
- `be/integration` đã chứa nội dung mọi nhánh backend: `be/a1-platform` đến `be/a5-dispute-chat-ai`, `fix/backend-review`, và commit `52f5fae`. So sánh theo patch-id cho kết quả 0 commit thiếu.
- Gộp các nhánh này về `be/integration` không cần resolve conflict ở mức commit. Phần còn lại là việc port thủ công các thay đổi chưa commit.

Phần chưa được gộp không nằm trong commit. Nó nằm trong **52 mục chưa commit** ở 4 worktree:

| Worktree | Mục chưa commit | Ghi chú |
|---|---|---|
| Worktree chính (`feat/ledger-palette-copy`) | 23 | 16 file sửa, 7 mục untracked |
| `.worktrees/backend-fixes` (`fix/backend-review`) | 13 | Phần lớn đã có ở `be/integration` |
| `capstone1-wt/a4-int` (`52f5fae`, detached) | 13 | Phần lớn đã bị thay thế hoặc mâu thuẫn |
| `capstone1-wt/integration` (`be/integration`) | 3 | Cùng nội dung với 3 file UI ở worktree chính |

Sau khi đối chiếu từng dòng với `be/integration`, phần thực sự cần port nhỏ hơn nhiều. Các mục còn lại cần quyết định (mục 7).

Hai việc phải làm trước khi gộp:

1. **Sao lưu.** 192 commit trên `be/integration` chưa được push. Các thay đổi chưa commit chưa có bản sao nào.
2. **Kiểm tra DB trước khi migrate.** Migration `20261031173000_drop_legacy_escrow_tables` xóa bảng `escrows`, `transactions` và cột `disputes.escrowId`. Nếu một DB đã chạy theo HEAD có dữ liệu cần giữ, migrate sẽ làm mất dữ liệu đó.

**Trạng thái gate hiện tại trên `be/integration`** (chạy trong worktree `integration`, gồm cả 3 file UI chưa commit):

- `bun run typecheck`: pass.
- `bun run lint`: exit 0, chỉ có cảnh báo `no-explicit-any` ở `src/components/ui/moving-border.tsx`.
- `escrow-release.test.ts` và `escrow-reservation.test.ts`: 35/35 pass.
- Chưa chạy: toàn bộ unit test, e2e backend (cần DB), migrate từ DB trống, `contracts:test`.

---

## 2. Hiện trạng nhánh và worktree

| Nhánh / worktree | Commit | So với `be/integration` | Việc cần làm |
|---|---|---|---|
| `be/integration` (`capstone1-wt/integration`) | `9cb5670` | Đích. Chứa HEAD và 278 commit khác. 192 commit chưa push. | Commit 3 file UI, push |
| `feat/ledger-palette-copy` (worktree chính) | `3bf6aab` | Tổ tiên của `be/integration`. Khớp với `origin`. | 23 mục chưa commit, xem mục 4–6 |
| `fix/backend-review` (`.worktrees/backend-fixes`) | `0d24826` | 87 commit, nội dung đã có đủ. | 13 mục chưa commit, 2 mục cần quyết định (D1) |
| `52f5fae` (`capstone1-wt/a4-int`, detached) | `52f5fae` | 80 commit, nội dung đã có đủ. | 13 mục chưa commit, bỏ (mục 3.4) |
| `be/a1-platform` (`capstone1-wt/a1`) | `d820705` | 27 commit, đã có đủ. | 6 file docs untracked, archive rồi xóa worktree |
| `be/a2-core` (`capstone1-wt/a2`) | `3eda37d` | 10 commit, đã có đủ. | Sạch, xóa worktree |
| `be/a3-indexer` (`capstone1-wt/a3`) | `0f3f139` | 11 commit, đã có đủ. | Sạch, xóa worktree |
| `be/a4-escrow-flow` (`capstone1-wt/a4`) | `371c6b9` | 14 commit, đã có đủ. | 6 file docs untracked (khác bản ở a1), archive |
| `be/a5-dispute-chat-ai` (`capstone1-wt/a5`) | `8426085` | 23 commit, đã có đủ. | 6 file docs untracked (khác bản ở a1 và a4), archive |
| 15 nhánh còn lại | — | Nằm trọn trong HEAD, nên cũng nằm trong `be/integration`. | Xóa được sau khi chốt (mục 8, bước 4) |

15 nhánh còn lại gồm: `be/base`, `Khoi/backend`, `feat/backend-auth`, `feat/backend-prisma`, `feat/ui-redesign-and-navbar`, `feat/claude-ui-redesign`, `feat/han-auth-homepage`, `feature/marketplace-platform-implementation`, `pr-10-docs`, `pr-11-contracts`, và 5 nhánh remote-only: `origin/feat/backend-escrow`, `origin/feat/backend-marketplace`, `origin/feat/hieu-graphql-auth`, `origin/feat/hieu-marketplace-resolvers`, `origin/feat/tram-login-homepage`.

---

## 3. Backend

### 3.1 Đã có trong `be/integration`: không cần làm

- **Escrow release và claim.** Đủ 5 endpoint `prepareClaimMissedDeliveryRefund`, `prepareClaimReviewTimeout`, `prepareReleaseFunds`, `prepareClaim`, `myClaimable`. `be/integration` so mốc thời gian bằng chain time, không dùng `new Date()`.
- **Người ngoài được kích hoạt refund và timeout.** Test `lets an outsider prepare the refund` và `lets an outsider prepare the timeout claim` có sẵn. Khớp với contract: `claimMissedDeliveryRefund` và `claimReviewTimeout` không kiểm tra `msg.sender`.
- **`assignDeveloper` đã bị xóa.** Không còn hit nào trong `apps/`.
- **Schema review.** Migration `20261029150000_review_schema` đã có `issue_views`, `hiddenAt`, `raisedAt`, và enum `DEPOSIT_MISMATCHED`.
- **Worker reorg.** `be/integration` đã throw khi RPC trả về block rỗng (dòng `RPC returned no block`), và có thêm kiểm tra cho event nằm trước checkpoint.
- **Notification idempotent.** `be/integration` đã dùng `createMany` với `skipDuplicates`.
- **Mẫu thông báo tiếng Việt.** Nằm ở `apps/worker/src/effects/escrow.ts` và `apps/web/src/graphql/modules/escrow/select.module.ts`. File `apps/web/src/lib/notifications/templates.ts` không còn trong `be/integration`, vì commit `3118318` đã xóa template map.
- **Dependency và kiểu dữ liệu.** `apps/worker/package.json` đã có `@bloody-roar/shared`. `fold.ts` và `types.ts` đã có `arbiter`, `feeRecipient`. `schema.ts` đã import `release.module`. `prepare.ts` đã nhận `issueId` và `escrowKey` kiểu nullable.

### 3.2 Chưa có trong `be/integration`: cần port

| Mã | Nội dung | Nguồn | Ghi chú |
|---|---|---|---|
| B-1 | Test DB từ chối chạy khi tên database không chứa `test` (3 dòng) | `fix/backend-review`, `apps/web/src/test/escrow-reservation.db.test.ts` | Tránh chạy test phá dữ liệu dev. Port nguyên. |
| B-2 | Kiểm tra định dạng địa chỉ ở `prepareClaim`: regex `^0x[0-9a-fA-F]{40}$`, lỗi `BAD_USER_INPUT` | `fix/backend-review`, `release.module.ts` | Port, nhưng giữ kiểm tra "chỉ rút ví của mình". Xem D1. |

### 3.3 Chưa có, cần quyết định (D1)

`fix/backend-review` (chưa commit) làm hai việc ở `prepareClaim`:

- Bỏ kiểm tra "chỉ rút được số dư của ví mình".
- Đổi test `refuses to claim another wallet's balance` thành `allows claiming for another wallet`.

`be/integration` vẫn giữ kiểm tra và test cũ.

Contract `claim(address recipient)` chuyển tiền cho `recipient`, không cho `msg.sender`. Nới quyền vì vậy không làm mất tiền on-chain. Thay đổi này vẫn là chính sách sản phẩm: ví A có thể chuẩn bị giao dịch rút tiền của ví B.

**Khuyến nghị:** giữ kiểm tra "chỉ ví mình", vì test của `be/integration` đang khóa hành vi này. Chỉ thêm B-2.

### 3.4 Bỏ, không port

- **`a4-int/release.module.ts`.** Thêm lại kiểm tra caller cho refund và timeout (`Chỉ khách hàng mới được hoàn tiền`, `Chỉ developer mới được nhận tiền`), dùng `new Date()` thay chain time. Mâu thuẫn với test `lets an outsider…` và test ranh giới chain-time của `be/integration`. Bản này cũ.
- **`a4-int/escrow-release.test.ts`.** Test `lets only the client take the refund` và `lets only the developer take the timeout claim` mâu thuẫn với `be/integration`. Bỏ.
- **`backend-fixes/release.module.ts`, phần refund và timeout.** Đã có tương đương ở `be/integration`. Bỏ phần này.
- **`backend-fixes/migrations/20261029000000_review_blockers/`.** Chứa `ALTER TYPE ... ADD VALUE 'DEPOSIT_MISMATCHED'`, `ADD COLUMN "hiddenAt"`, `ADD COLUMN "raisedAt"`, `CREATE TABLE "issue_views"`. Các thay đổi này đã có trong `20261029150000_review_schema`. Chạy lại sẽ lỗi. Bỏ.
- **Các file có chênh lệch chỉ do định dạng hoặc bản cũ:** `backend-fixes/schema.prisma`, `apps/worker/package.json`, `packages/database/src/notifications.ts`, `apps/worker/src/indexer/reorg.ts`, `apps/web/src/lib/notifications/templates.ts`, `packages/shared/src/escrow/fold.ts`, `types.ts`. Bỏ.
- **File sinh tự động:** `pothos-types.ts`, `bun.lock` ở cả hai worktree. Sinh lại trên `be/integration`, không port.
- **`a4-int/docs/plan/parallel/SCHEMA_REQUESTS.md`.** Các yêu cầu schema đã được áp dụng. Bỏ.
- **Test tùy chọn.** `a4-int/escrow-reservation.test.ts` có test `assignDeveloper is removed (BE-23)`, 3 dòng. Port nếu muốn một test khóa việc xóa `assignDeveloper`.

### 3.5 Migration

- `be/integration` có 13 migration. Migration mới nhất là `20261031173000_drop_legacy_escrow_tables`.
- Mọi migration mới phải có timestamp lớn hơn `20261031173000`. Không đổi tên migration đã áp dụng.
- Nội dung migration drop: xóa khóa ngoại của `disputes`, `escrows`, `transactions`; xóa index và cột `disputes.escrowId`; xóa bảng `escrows`, `transactions`; xóa enum `EscrowStatus`, `TransactionStatus`.
- Trước khi chạy migration này trên bất kỳ DB nào có dữ liệu thật: dump DB, kiểm tra hai bảng đã không còn dữ liệu cần giữ, và xác nhận code đang chạy không còn đọc các bảng đó.

---

## 4. UI

### 4.1 Đã có trong `be/integration`

- Toàn bộ HEAD, gồm ledger palette, header dropdown, dark theme và design system Claude (các commit `5a0692a` đến `3bf6aab`).
- 26 commit UI có trong `be/integration` nhưng không có trong HEAD. Lệnh để xem đầy đủ:

  ```bash
  git log --oneline HEAD..be/integration -- apps/web/src/components apps/web/src/app apps/web/src/lib/web3 apps/web/src/lib/store
  ```

  Một số commit tiêu biểu:
  - `2f27bc2` merge(z-3): integrate ledger ui
  - `8ed38e7` fix(m1): chỉ hiện dữ liệu thật ở marketplace, home và issue
  - `486a6e0` fix(fe): cho mọi tài khoản không phải admin đăng task
  - `dffc189` feat(fe-1b): gửi prepared call và ký funding intent bằng ethers
  - `0260227` feat(fe-3): hành động escrow theo từng người xem
  - `46f3074` feat(fe-6): hiện trạng thái AI trong màn hình dispute của admin
  - `065d28c` feat(p1-30): upload hai bước

### 4.2 Chưa có trong `be/integration`: cần port

Ba file này giống hệt nhau ở worktree chính và worktree `integration`. Chỉ cần commit trên `be/integration`.

| File | Thay đổi | Kích thước |
|---|---|---|
| `apps/web/src/components/auth/wallet-icons.tsx` | Mới: logo ví (`WalletLogo`) | 68 dòng, untracked |
| `apps/web/src/components/auth/connect-modal.tsx` | Thay chữ M, C, B bằng `WalletLogo` | 9 dòng đổi |
| `apps/web/src/components/layout/user-menu.tsx` | Nút copy địa chỉ chỉ còn icon, có `aria-label`, đổi trạng thái khi đã copy | 15 dòng đổi |

Bước này không phụ thuộc quyết định nào. Có thể làm trước.

### 4.3 Lưu ý

- `.worktrees/` không nằm trong `.gitignore`. Nếu chạy `git add -A` ở worktree chính, worktree lồng sẽ bị thêm vào. Xóa worktree trước khi commit gì ở repo chính, hoặc thêm `.worktrees/` vào `.gitignore`.
- `Bloody-Roar Marketplace - revised.html` (390 dòng, untracked) không phải code. Xem D4.

---

## 5. Chain và cấu hình local (D2)

Worktree chính đang chuyển cách chọn chain từ hằng số sang biến môi trường `ESCROW_CHAIN_ID`. Chuyển đổi này gồm:

| File | Thay đổi |
|---|---|
| `apps/web/next.config.mjs` | Đọc `.env` ở root; thêm `NEXT_PUBLIC_ESCROW_CHAIN_ID` |
| `apps/web/src/lib/auth/siwe.ts` | Thêm `authChainId()` |
| `apps/web/src/app/api/auth/login/route.ts`, `nonce/route.ts` | Dùng `authChainId()` thay cho chuỗi `"84532"` cứng |
| `apps/web/src/lib/web3/client.ts` | Thêm `PRODUCT_CHAIN` (Hardhat 31337 hoặc Base Sepolia) |
| `packages/shared/src/constants/index.ts` | Thay `ACTIVE_CHAIN_ID` bằng hàm `activeChainId()` |
| `apps/web/src/graphql/modules/issue/issue.module.ts` | Dùng `activeChainId()` ở 3 chỗ |
| `apps/contracts/scripts/deploy.ts` | Mint MockUSDC cho 10 signer Hardhat đầu tiên khi deploy local |
| `packages/database/src/seed-local-token.ts` (mới, 41 dòng) | Seed token local; thêm script `db:seed:local` |

Hiện trạng `be/integration`: `ACTIVE_CHAIN_ID` xuất hiện ở 9 file. Không có `ESCROW_CHAIN_ID` trong `apps/` và `packages/`. Chain đang bị khóa ở Base Sepolia.

**Nếu giữ local Hardhat (D2 = có):** phải đổi 9 chỗ `ACTIVE_CHAIN_ID`, và sửa `client.ts` bằng tay vì `be/integration` đã thay đổi file này. Đây là phần việc lớn nhất trong kế hoạch.

**Khuyến nghị:** nếu còn chạy `bun run contracts:deploy` cho môi trường local, port đầy đủ. Nếu chỉ dùng Base Sepolia, bỏ cả nhóm này.

---

## 6. Seed, e2e, docs (D3, D4)

| Mục | Hiện trạng | Khuyến nghị |
|---|---|---|
| `packages/database/src/seed-realistic.ts` (mới, 1037 dòng) | Mục đích trùng `seed-demo.ts` đã có ở `be/integration` ("Extensive realistic demo seed") | Bỏ. Kèm bỏ `db:seed:realistic` trong `package.json` gốc và `packages/database/package.json`. |
| `apps/web/scripts/e2e-chat.ts`, `e2e-workflow.ts` | `be/integration` không còn các file này | Bỏ thay đổi. |
| `apps/web/scripts/e2e-issue.ts` | `be/integration` còn file, khác 7 dòng | Bỏ. `be/integration` có thư mục `tests/e2e` riêng. |
| `docs/plan/BACKEND_STATUS_2026-10-27.md` (307 dòng, mới) | Trạng thái ngày 27/10, các việc trong đó đã hoàn thành | Chuyển vào `docs/plan/archive/2026-10-27/`. |
| `docs/plan/parallel/` (6 file mới: A1–A5 và README, khoảng 920 dòng) | Kế hoạch chia việc cho 5 agent, đã thực hiện xong | Chuyển vào `docs/plan/archive/2026-10-27/`. Tên file không trùng với `docs/plan/parallel/` của `be/integration`. |
| `docs/plan/README.md` (2 dòng mới) | Trỏ tới hai file trên | Sửa link theo vị trí archive. |
| `Bloody-Roar Marketplace - revised.html` (390 dòng, untracked) | Không phải code | Đưa vào `docs/design/`, hoặc để ngoài repo. |

---

## 7. Quyết định cần chốt

| Mã | Câu hỏi | Khuyến nghị | Lý do |
|---|---|---|---|
| D0 | Nhánh chung là `be/integration`? | Có | Chứa HEAD và mọi nhánh con. Nếu muốn giữ tên `feat/ledger-palette-copy`: fast-forward nhánh đó lên `be/integration`, nội dung giống hệt. |
| D1 | `prepareClaim` chỉ cho rút ví của mình (giữ) hay cho chuẩn bị claim cho ví khác (nới)? | Giữ, cộng thêm B-2 | `be/integration` đang khóa bằng test. Contract an toàn ở cả hai cách, nên đây là câu hỏi chính sách. |
| D2 | Còn chạy local Hardhat (chain 31337) không? | Nếu còn, port nhóm mục 5 | Khoảng 10 file, `client.ts` phải sửa tay. |
| D3 | Giữ `seed-realistic.ts` không? | Bỏ | Trùng `seed-demo.ts`. |
| D4 | Xử lý docs 27/10 và file HTML thế nào? | Docs vào `docs/plan/archive/`, HTML vào `docs/design/` | Không ảnh hưởng code, giữ được lịch sử quyết định. |
| D5 | Xóa nhánh và worktree khi nào? | Xóa worktree và nhánh local sau khi sao lưu và gate xanh. Xóa nhánh remote chờ xác nhận riêng. | Xóa remote không hoàn tác được và ảnh hưởng người khác. |

---

## 8. Các bước thực hiện

### Bước 0: Sao lưu (không đổi nhánh nào)

1. Tạo thư mục sao lưu:

   ```bash
   mkdir -p ~/backup/capstone1-2026-10-31
   ```

2. Với 4 worktree có thay đổi (`capstone1`, `.worktrees/backend-fixes`, `capstone1-wt/a4-int`, `capstone1-wt/integration`), lưu patch và file untracked:

   ```bash
   # chạy trong từng worktree, đặt <tên> cho đúng worktree
   git diff > ~/backup/capstone1-2026-10-31/<tên>.patch
   git ls-files --others --exclude-standard -z | tar --null -cf ~/backup/capstone1-2026-10-31/<tên>-untracked.tar -T -
   ```

3. Tạo tag cục bộ cho các đầu nhánh (không push):

   ```bash
   git tag backup/2026-10-31/head 3bf6aab
   git tag backup/2026-10-31/be-integration 9cb5670
   git tag backup/2026-10-31/fix-backend-review 0d24826
   git tag backup/2026-10-31/a4-int 52f5fae
   ```

4. Kiểm tra: thư mục sao lưu có 4 file `.patch` và 4 file `.tar`.

### Bước 1: Chốt D0 đến D5 (mục 7)

### Bước 2: Port trên `be/integration`

Làm trong worktree `capstone1-wt/integration`. Mỗi nhóm một commit.

1. Commit 3 file UI (mục 4.2). Ví dụ message: `feat(ui): wallet logos and icon-only copy button`.
2. Port B-1 (test guard DB). Ví dụ message: `test(escrow): refuse db tests on a database without "test" in its name`.
3. Theo D1: thêm B-2 vào `prepareClaim`. Giữ kiểm tra ví của mình.
4. Theo D2 (nếu giữ local): port nhóm chain (mục 5), đổi 9 chỗ `ACTIVE_CHAIN_ID`, thêm mint trong `deploy.ts`, thêm `seed-local-token.ts` và script tương ứng.
5. Theo D4: chuyển docs vào archive, sửa link trong `docs/plan/README.md`.

### Bước 3: Kiểm tra trên `be/integration`

Chạy sau khi `git status` sạch, trong worktree `integration`:

1. `bun install`. Nếu `bun.lock` đổi, commit riêng và ghi lý do.
2. `bun run typecheck`
3. `bun run lint`
4. `cd apps/web && bunx vitest run`: toàn bộ unit test. Hiện mới chạy 2 file.
5. `bun run contracts:test`
6. Migrate trên DB Postgres trống, không dùng DB dev: `bun run db:migrate`. Xác nhận chuỗi migration chạy hết từ đầu.
7. `bun run test:e2e:backend`: cần DB và biến môi trường. Ghi lại cấu hình đã dùng.

Qua gate khi mọi bước pass. Nếu bước nào fail, ghi rõ lỗi và kiểm tra xem lỗi có tồn tại sẵn trên `be/integration` trước khi làm không.

### Bước 4: Push và thu gọn về một nhánh

1. Quét bí mật trước khi push. Chưa xác nhận đã cài `gitleaks`. Nếu chưa có, quét các pattern khóa riêng và file `.env`.
2. **Cần bạn xác nhận:** `git push origin be/integration`. Đẩy 192 commit cũ và các commit mới.
3. Gỡ worktree sau khi sao lưu xong. Các worktree chưa commit cần `--force`:

   ```bash
   git worktree remove --force /Users/admin/repos/capstone1-wt/a1
   git worktree remove --force /Users/admin/repos/capstone1-wt/a2
   git worktree remove --force /Users/admin/repos/capstone1-wt/a3
   git worktree remove --force /Users/admin/repos/capstone1-wt/a4
   git worktree remove --force /Users/admin/repos/capstone1-wt/a4-int
   git worktree remove --force /Users/admin/repos/capstone1/.worktrees/backend-fixes
   ```

4. Đưa worktree `integration` khỏi `be/integration`, để worktree chính có thể checkout nhánh này:

   ```bash
   git -C /Users/admin/repos/capstone1-wt/integration switch --detach
   ```

   Hoặc gỡ hẳn worktree này rồi làm bước 5.

5. Ở worktree chính, bỏ các thay đổi đã sao lưu và đã port, rồi chuyển nhánh:

   ```bash
   git restore .
   git status --short        # liệt kê các file untracked còn lại
   ```

   Với mỗi file untracked còn lại, kiểm tra nó đã có trong `be/integration` (sau bước 2) hoặc đã nằm trong thư mục sao lưu. Sau đó chuyển file đó vào thư mục sao lưu bằng `mv`. Không dùng `git clean`: lệnh này xóa cả file kế hoạch này nếu chưa commit. Khi `git status` không còn file nào cần giữ, chạy:

   ```bash
   git switch be/integration
   ```

   File kế hoạch `docs/plan/MERGE_TO_BE_INTEGRATION_2026-10-31.md` cũng là file untracked. Commit nó vào `be/integration` ở bước 2, hoặc sao chép đi trước khi `mv`.

6. Xóa nhánh local đã gộp. Trước khi xóa, xác nhận bằng `git cherry`. Các nhánh là tổ tiên của `be/integration` xóa được bằng `-d`. Các nhánh chỉ tương đương về nội dung cần `-D`:

   ```bash
   # tổ tiên của be/integration: -d
   git branch -d Khoi/backend feat/backend-auth feat/backend-prisma \
     feat/ui-redesign-and-navbar feat/claude-ui-redesign \
     feature/marketplace-platform-implementation feat/han-auth-homepage \
     pr-10-docs pr-11-contracts be/base feat/ledger-palette-copy

   # tương đương theo nội dung: kiểm tra 0 dòng '+' rồi -D
   git cherry be/integration fix/backend-review | grep -c '^+'
   git branch -D fix/backend-review be/a1-platform be/a2-core be/a3-indexer be/a4-escrow-flow be/a5-dispute-chat-ai
   ```

7. Dọn worktree đã mất thư mục:

   ```bash
   git worktree prune
   git branch -vv
   ```

### Bước 5: Nhánh remote (chờ xác nhận)

Thao tác này ảnh hưởng người khác, nên làm sau khi team đồng ý.

- Trước khi xóa, chạy `git merge-base --is-ancestor <nhánh> be/integration` cho từng nhánh.
- Các nhánh cần xóa (16): `origin/Khoi/backend`, `origin/be/a1-platform`, `origin/be/a2-core`, `origin/be/a3-indexer`, `origin/be/a4-escrow-flow`, `origin/be/a5-dispute-chat-ai`, `origin/feat/backend-escrow`, `origin/feat/backend-marketplace`, `origin/feat/backend-prisma`, `origin/feat/claude-ui-redesign`, `origin/feat/han-auth-homepage`, `origin/feat/hieu-graphql-auth`, `origin/feat/hieu-marketplace-resolvers`, `origin/feat/tram-login-homepage`, `origin/feat/ui-redesign-and-navbar`, `origin/feat/ledger-palette-copy`.
- Giữ `origin/main` và `origin/be/integration`.

---

## 9. Quy tắc sau khi gộp

- Chỉ làm việc trên `be/integration`. Không tạo nhánh hay worktree mới nếu không có lý do rõ ràng.
- Commit nhỏ, mỗi commit một việc, message theo Conventional Commits như lịch sử hiện tại.
- Migration mới: timestamp lớn hơn `20261031173000`. Không sửa migration đã áp dụng.
- Trước khi chạy migration có `DROP`: dump DB trước.
- Trước khi kết thúc mỗi việc: `bun run typecheck` và `bun run lint` (AGENTS.md).
- Không commit `.worktrees/`, file `.env`, hay khóa riêng.
- Plan lưu trong `docs/plan/` dạng Markdown (CLAUDE.md).

---

## 10. Ngoài phạm vi

- **Gộp về `main`.** `origin/main` đang ở `33aed2e` và chưa có các thay đổi này. Sau khi `be/integration` ổn định, mở PR riêng. PR này sẽ có khoảng 318 commit (40 commit của HEAD và 278 commit của `be/integration`).
- **Triển khai.** Không đụng tới production hay deploy Base Sepolia. Guard `ALLOW_BASE_SEPOLIA_DEPLOYMENT` trong `deploy.ts` vẫn giữ nguyên.

---

## 11. Điều chưa kiểm tra

- Đối chiếu theo patch-id và theo từng dòng. Chưa chạy toàn bộ unit test, e2e, hay migrate từ DB trống.
- Quét bí mật mới chỉ trên các dòng thêm vào của `be/integration`. Kết quả khớp đều là fixture test hoặc khóa sinh lúc chạy. Chưa quét toàn bộ lịch sử.
- Chưa kiểm tra giao diện trên trình duyệt. Theo CLAUDE.md, việc test chỉ chạy bằng CLI.
- Số commit chưa push (192) lấy từ `origin/be/integration` sau `git fetch --all --prune`. Cần chạy lại lệnh đếm trước khi push.
