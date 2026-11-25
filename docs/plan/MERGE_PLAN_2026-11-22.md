# Kế hoạch merge PR · 22/11/2026

Người lập: Khôi (qua Claude Code). Chưa merge gì. Chỉ làm theo file này khi đã được duyệt "OK merge".

## 1. Trạng thái origin/main (105526a, Merge PR #24)

Chạy trong worktree sạch từ origin/main, Postgres local `localhost:5433` (DB `bloody_mr_main_test`), env giống CI. Không chạm Supabase.

| Lệnh | Kết quả |
|---|---|
| `bun run typecheck` | xanh |
| `bun run lint` | xanh, không cảnh báo |
| `bun run build` | xanh |
| `bun run --cwd apps/web test` | 107 file, 667/667 pass |
| `DOCKER_TESTS=1 bun run --cwd apps/worker test` (có `TEST_DATABASE_URL`) | 99 pass, 1 skip, 0 fail |
| `bun run --cwd packages/database test` | 6 pass, 0 fail |
| `prisma migrate diff` (schema so với migrations, như job `database` của CI) | No difference detected |
| `bun run contracts:test` | 36 passing |
| `bun run test:e2e:backend` (Hardhat + Postgres test + AI mock, toàn bộ local) | 43 pass + 3 pass UI, 0 fail, "E2E scenarios passed (E1–E34)". Lần chạy đầu 35 pass / 8 fail chỉ vì tôi thiếu `AUTH_PRIVATE_KEY`. CI cũng tự tạo khóa này, nên đó không phải lỗi của main. |

Không có test đỏ sẵn trên main trong các bộ trên. Không chạy: `forge test`, coverage, Slither, deploy dry-run (CI contracts có, đề bài không yêu cầu; không PR nào đang mở sửa `apps/contracts`).

## 2. Bảng PR

Kết quả local là của nhánh PR (mọi PR đều đã chứa main hiện tại, merge thử với main không có conflict, trừ #23).

| PR | Tiêu đề | Tác giả | Base | CI GitHub | Test local | Conflict | Lỗi review | Đề xuất |
|---|---|---|---|---|---|---|---|---|
| #25 | fix: sprint 7 safety (US-17, 20, 21, 22) | trongkhoidev | main | xanh | tc/lint/build xanh; web 667/667; worker 113 pass 1 skip; db 13 pass | không với main; **có với #28** ở `packages/database/package.json` | 1 nhỏ | **Merge** (đầu tiên) |
| #26 | fix(worker): stop patches from changing runner config (US-105) | trongkhoidev | chore/sprint-7-safety | xanh | tc/lint/build xanh; web 667/667; worker 120 pass 1 skip; db 13 pass | không | 2 nhỏ | **Merge** sau #25, đổi base trước |
| #27 | feat(web): checkIssueScope mutation (US-86) | trongkhoidev | main | xanh | tc/lint/build xanh; web 674/674; worker 99 pass 1 skip; db 6 pass | không | 1 nhỏ | **Merge** |
| #28 | fix: align wallet sign-in and prevent stale snapshot writes | KudoDo221b (Hiếu) | main | **đỏ** (web: typecheck) | **typecheck đỏ, build đỏ** (`framer-motion`); lint xanh; web 698/698; worker 101 pass 1 skip; db 6 pass; contracts 36 passing | **có với #25** | 4 chặn merge, 3 nên sửa | **Chưa merge**, nhờ Hiếu sửa |
| #23 | feat(ui): remove Vietnamese language support | dtngochan (Hân) | main | xanh (cũ, 09/11) | không chạy (conflict) | 16 file conflict với main | — | **Đóng, lỗi thời**: main đã chỉ còn tiếng Anh (`root.lang = "en"` trong `ui-preferences.tsx`, đổi ở faef7ba) |
| #14 | feat(escrow-core) … (A2) | trongkhoidev | feat/claude-ui-redesign | chỉ GitGuardian | không chạy | — | — | **Đóng, đã có trên main**: head `3eda37d` là tổ tiên của main |
| #15 | feat(indexer) … (A3) | trongkhoidev | feat/claude-ui-redesign | chỉ GitGuardian | không chạy | — | — | **Đóng, đã có trên main**: head `0f3f139` là tổ tiên của main |
| #16 | feat(platform) … (A1), draft | trongkhoidev | feat/claude-ui-redesign | GitGuardian đỏ (cũ) | không chạy | — | — | **Đóng, đã có trên main**: head `d820705` là tổ tiên của main |
| #17 | feat(dispute-chat-ai) … (A5), draft | trongkhoidev | feat/claude-ui-redesign | GitGuardian đỏ (cũ) | không chạy | — | — | **Đóng, đã có trên main**: head `8426085` là tổ tiên của main |
| #18 | feat(escrow-flow) … (A4), draft | trongkhoidev | feat/claude-ui-redesign | chỉ GitGuardian | không chạy | — | — | **Đóng, đã có trên main**: head `371c6b9` là tổ tiên của main |

Base `feat/claude-ui-redesign` của #14–#18 cũng đã nằm trong main. Diff trên GitHub của các PR này trông còn lớn chỉ vì so với base cũ. Tôi không tự đóng PR nào.

Bản gộp thử cả 4 PR theo thứ tự #25 → #26 → #27 → #28 (giải conflict như mục 4.4, bỏ `hero-highlight.tsx`): typecheck và build xanh, web 705/705, worker 122 pass 1 skip, db 13 pass, schema khớp, contracts 36 passing. Ngoài lỗi `framer-motion` và conflict `package.json`, các PR không làm hỏng nhau.

## 3. Lỗi review

### #25 (US-17, 20, 21, 22)

- **Nhỏ** · `apps/worker/src/alerts.ts:57`: dấu `QUEUED_RUN_OVERDUE` được ghi vào `testRun.log`. Nếu run vẫn `QUEUED` và người dùng mở log, họ thấy chuỗi nội bộ này. Khi run chạy thật thì log bị ghi đè, nên chỉ lộ trong lúc chờ.
- Đã kiểm, không lỗi: danh sách test truyền cho Vitest/Pytest luôn hợp lệ vì `validTestPath` bắt buộc tiền tố `__bloodyroar__/`. Quét secret chỉ báo mã, không ghi giá trị secret vào log hay DB. Guard `db:migrate` chặn trước khi gọi Prisma (test có giả lập binary `prisma`).

### #26 (US-105)

- **Nhỏ** · `apps/worker/src/runner/sandbox.ts:78`: `git apply --numstat` gọi `execFile` với toàn bộ `process.env`, bỏ qua helper `command()`. Sau khi #28 vào, `command()` chỉ cho subprocess một danh sách env cho phép, còn lệnh này thì vẫn nhận hết. Nên đổi sang `command()` trong PR sau.
- **Nhỏ** (ghi vào Known limits): patch không sửa được file config, nhưng vẫn sửa được file mà config trước patch trỏ tới (`setupFiles`, `globalSetup` của Vitest, module trong `pytest_plugins`). Patch kiểu đó vẫn đổi được kết quả test. Nên mở ticket riêng.

### #27 (US-86 backend)

- **Nhỏ** · `apps/web/src/graphql/modules/ai/ai.module.ts:128`: log dưới task `TESTGEN`, nên thống kê AI gộp chung hai loại việc. PR đã ghi chú điều này. Ranh giới AI vẫn đúng: `requireAuth`, `aiRateLimit`, `scanAndMask` trước `completeAI`.

### #28 (Hiếu)

> **Cập nhật 22/11 tối, head `39c98e3`:** CI GitHub xanh. Lỗi 1 đã sửa (xóa `hero-highlight.tsx`). Lỗi 3 đã sửa: claim ghi `processingToken`, lần ghi cuối dùng `updateMany` có token trong `where`, `setIssueSource` reset token, test `does not overwrite a replacement…` pass 2/2 ở máy. Lỗi 2 **còn**: `fileTree.push` vẫn chạy bất kể `collect`, test dòng 97 vẫn đòi `dist/generated.js` trong cây. Lỗi 4 **còn**: thử merge origin/main ở máy, conflict duy nhất là `packages/database/package.json`, `db:migrate` vẫn không có guard. Commit này thêm migration `20261122120000_source_snapshot_processing_token` (xem mục 5). Ở máy: typecheck, lint, build xanh; web 698/698, worker 103 pass 1 skip, database 6 pass (ít hơn main vì branch chưa có #25–#27).

**Chặn merge:**

1. **CI đỏ.** `apps/web/src/components/ui/hero-highlight.tsx:3` import `framer-motion`, gói này không có trong dependency. Typecheck và `next build` đều fail. Commit cuối `04d4f78` lại *thêm* file này, trong khi mô tả PR nói đã xóa nó. File cũng không được dùng ở đâu, xóa là xong.
2. **fileTree có cả `node_modules`, `dist`, `.venv`, `.git`.** `apps/worker/src/jobs/source-snapshot.ts:35` push mọi file vào `fileTree`, còn cờ `collect` ở dòng 31 chỉ chặn việc đọc nội dung. Test `apps/worker/test/source-snapshot.test.ts:88` còn khẳng định `dist/generated.js` phải có trong cây. Tình huống lỗi: owner upload zip có sẵn `node_modules` (hàng chục nghìn file), cột JSONB và response GraphQL `issueSource.fileTree` phình theo, và picker focus file của US-44 sẽ hiện file build hoặc thư viện. Sửa: chỉ push khi `collect` đúng, và sửa test cho khớp.
3. **Không có token chống ghi đè snapshot cũ, dù mô tả PR nói có.** `source-snapshot.ts:87` vẫn update theo `where: { id: snapshot.id }`. Tình huống lỗi: job A đang `PROCESSING` repo cũ; owner gọi `setIssueSource` (`issue-source.module.ts:58`) đổi repo, row về `PENDING`; job A xong và ghi `READY` cùng `storagePath`, `context`, `fileTree` của repo cũ. Repo mới không bao giờ được xử lý, và test sẽ chạy trên mã nguồn sai. Sửa: lưu một claim token (hoặc `attempts`/`updatedAt` lúc claim) và đưa nó vào điều kiện `where` của lần ghi cuối (`updateMany` rồi kiểm `count`). Cần thêm một test cho đúng tình huống này.
4. **Conflict với #25 làm mất guard.** `packages/database/package.json`: #28 đổi `db:migrate` thành `bun --env-file=../../.env run prisma migrate dev` và không có `assert-local-db`. Trên máy này, root `.env` và `packages/database/.env` đều trỏ Supabase. Nếu giải conflict bằng cách lấy bản của #28, `bun run db:migrate` sẽ chạy `prisma migrate dev` thẳng lên Supabase. Cách giải đề xuất ở mục 4.4.

**Nên sửa:**

5. `apps/web/package.json:16`: `serve:local` ghi cứng `PORT=4010`, trong khi mô tả nói "preserve PORT overrides". Thêm nữa, `NEXT_PUBLIC_APP_URL` lấy từ root `.env` (đang là `http://localhost:4000`), nên `authUri()` ra domain 4000 trong khi trang chạy ở 4010. Ví sẽ cảnh báo SIWE sai domain. Nên dùng `PORT=${PORT:-4010}` và đặt `NEXT_PUBLIC_APP_URL` theo port.
6. `apps/worker/src/runner/command.ts:3`: danh sách env cho phép bỏ mất `DOCKER_CONTEXT`, `DOCKER_CERT_PATH`, `DOCKER_TLS_VERIFY`, `XDG_RUNTIME_DIR`. Docker rootless hoặc Docker qua TLS sẽ không tìm được daemon nữa. Hướng sửa (giới hạn env) là đúng, chỉ cần bổ sung các biến này.
7. `apps/web/src/components/marketplace/issue-detail-view.tsx:193`: `onExecutableChange` gọi `load()` mỗi lần danh sách test case đổi. Trong khi `TestCasePanel` poll 5 giây một lần chờ `baseStatus`, toàn bộ issue cũng bị tải lại 5 giây một lần.

**Đã kiểm, không thấy lỗi:** đổi SIWE (`authUri`/`authDomain` dùng chung một nguồn cho nonce, verify và `ThirdwebAuth`, test `siwe` và `auth-nonce-route` xanh) không làm hỏng đăng nhập khi `NEXT_PUBLIC_APP_URL` là URL http(s) hợp lệ. Nếu biến này sai định dạng, nonce và login trả 500 thay vì âm thầm dùng `localhost:4000`; đó là cố ý. Supersede draft chạy trong transaction `Serializable`, và worker vẫn nhận hash cũ đã lên chuỗi (`effects-work.test.ts`). Migration `fileTree` chỉ thêm cột JSONB nullable, không phá dữ liệu. `fileTree` chỉ trả cho owner (test DB). `bun --env-file` không ghi đè biến đã có trong shell và bỏ qua file thiếu, nên `start` trên Railway (không có `.env`) không hỏng.

## 4. Thứ tự merge và lệnh

Repo dùng merge commit, tắt tự xóa branch, main không có branch protection. Không dùng `--delete-branch` cho PR nào: (a) xóa `chore/sprint-7-safety` khi #26 còn trỏ base vào nó sẽ làm GitHub đóng #26; (b) `feat/US-86-check-my-scope` đang là branch checkout ở working tree chính, và `gh pr merge --delete-branch` sẽ xóa branch local rồi chuyển working tree đang có thay đổi chưa commit. Xóa branch remote để cuối, xem mục 6.

### 4.1 · #25 (đầu tiên: #26 xếp chồng lên nó, và #28 phải giải conflict trên nền của nó)

Trước: `gh pr view 25 --json headRefOid` phải là `8a95dbc9…`.
```
gh pr merge 25 --merge
```
Sau: fetch, worktree từ origin/main mới, `bun install --frozen-lockfile && bun run db:generate`, rồi typecheck, lint, build, `apps/worker` test (DOCKER_TESTS=1), `packages/database` test.

### 4.2 · #26 (ngay sau #25)

Trước:
```
gh pr view 26 --json headRefOid          # fb406f2d…
gh pr edit 26 --base main
gh pr view 26 --json commits --jq '.commits[].messageHeadline'   # chỉ còn 3 commit US-105
gh pr diff 26 --name-only                # chỉ apps/worker/src/runner/sandbox.ts và apps/worker/test/sandbox.test.ts
```
Đổi base không kích hoạt lại CI (workflow chỉ nghe `opened/synchronize/reopened`). Check xanh hiện có tính trên base cũ, vì vậy bước kiểm local sau merge là bắt buộc.
```
gh pr merge 26 --merge
```
Sau: như 4.1, và chạy thêm `DOCKER_TESTS=1 bun run --cwd apps/worker test test/sandbox.test.ts`.

### 4.3 · #27 (không phụ thuộc PR nào, để sau #26 cho mỗi lần merge chỉ có một thay đổi)

Trước: `headRefOid` phải là `2e511934…`.
```
gh pr merge 27 --merge
```
Sau: typecheck, lint, build, `bun run --cwd apps/web test`.

### 4.4 · #28 (chỉ khi Hiếu đã sửa và CI xanh)

Nhờ Hiếu: sửa 4 lỗi chặn merge (mục 3), rồi merge origin/main (đã có #25) vào branch. Giải conflict `packages/database/package.json` bằng cách giữ guard và cho guard đọc đúng nguồn env Prisma sẽ dùng. Với bun, `--env-file` sau thắng `--env-file` trước, nên chạy guard theo cả hai thứ tự; file nào trỏ remote cũng bị chặn:
```
"db:migrate": "bun --env-file=../../.env --env-file=.env run scripts/assert-local-db.ts && bun --env-file=.env --env-file=../../.env run scripts/assert-local-db.ts && bun --env-file=../../.env run prisma migrate dev",
```
Làm tương tự cho `db:push` và `db:reset`. Tôi đã thử cách này trong bản gộp: `packages/database` test 13 pass, gồm cả test guard của #25.

Trước: `headRefOid` mới, `gh pr checks 28` xanh hết.
```
gh pr merge 28 --merge
```
Sau: chạy lại toàn bộ mục 1. Rồi chạy `git grep -n fileTree origin/main -- packages/database/prisma/schema.prisma`, có kết quả là US-44 được mở khóa.

## 5. Migration cần áp lên Supabase (người làm tay, tôi không chạy)

| Sau khi merge | Migration | Ghi chú |
|---|---|---|
| #25, #26, #27 | không có | Mô tả #25 nói Supabase còn thiếu 3 migration *đã có trên main*. Có thể là `20261110175315_checkpoint_block_hashes`, `20261110175415_snapshot_processing`, `20261110180408_snapshot_attempts`, nhưng tôi chưa kiểm vì không kết nối Supabase. |
| #28 | `20261118090000_source_snapshot_file_tree` | `ADD COLUMN "fileTree" JSONB`, nullable, không khóa bảng lâu. Không cần backfill để chạy, nhưng snapshot `READY` cũ sẽ có `fileTree = NULL`. US-44 sẽ từ chối `focusFiles` trên các snapshot đó cho đến khi owner đặt lại source. |
| #28 | `20261122120000_source_snapshot_processing_token` | `ADD COLUMN "processingToken" TEXT`, nullable. Thêm ở commit `39c98e3`. Áp cùng lúc với migration trên. |

Cách làm: backup Supabase trước. Chạy `prisma migrate status` để xem danh sách thiếu, rồi `bun run --cwd packages/database db:migrate:prod` với env production. Sau đó chạy lại `migrate status`, phải báo up to date.

## 6. Không merge lúc này, và việc dọn sau

- **#28**: CI đỏ và có 4 lỗi chặn merge (mục 3). US-44, US-45, US-48 vẫn bị chặn cho đến khi #28 vào main.
- **#23**: lỗi thời, đề xuất Hân đóng.
- **#14–#18**: đề xuất đóng vì nội dung đã vào main.
- Branch remote có thể xóa sau khi xong (cần duyệt riêng): `chore/sprint-7-safety`, `fix/US-105-runner-config-isolation` (sau #26). `feat/US-86-check-my-scope` để lại, vì branch này đang checkout ở máy và còn phần UI của US-86.
