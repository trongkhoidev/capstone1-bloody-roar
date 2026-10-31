# Bàn giao cuối cho Haiku: sửa lỗi sau review và đóng dự án

Thư mục làm việc: `/Users/admin/repos/capstone1-wt/integration`, nhánh `be/integration`.

File này tự đủ. Quy tắc chạy lệnh, ủy quyền, việc cấm, cách tự quyết và khi nào được dừng **giữ nguyên như Phần B của `docs/plan/parallel/HAIKU_CONTINUE.md`** (đọc B0–B6 ở đó một lần trước khi bắt đầu). Chỉ có hai thay đổi so với Phần B đó, ghi ở mục 2 bên dưới.

Không đọc lại `FINISH_PLAN.md`, `FIX_LIST.md` hay Phần C của `HAIKU_CONTINUE.md`. Mọi việc còn lại nằm trong file này.

---

## 1. Trạng thái lúc bàn giao (2026-10-31)

- HEAD `29bc205`. `git status` sạch.
- Gate B0.2 exit 0 ở lần chạy cuối của phiên trước: web 584, worker 72, database 3, contracts 35, E2E 40 pass (E1–E31).
- Review sau phiên trước tìm ra 9 vấn đề, liệt kê ở mục 3. Tất cả đã có quyết định. Không mục nào cần hỏi lại người dùng.

### Những gì review đã kiểm và thấy ổn (không sửa)

- `submitReview` và `recalcReputation`: quyền, trạng thái, transaction, lỗi trùng `P2002`.
- Upload hai bước: kiểm kích thước, tính sha256, gán avatar trong cùng transaction.
- Session: `verifyJWT` có kiểm `revokedAt` và `expiresAt` (`apps/web/src/lib/auth.ts:92`), nên `revokeSession` có tác dụng thật.
- Job `cleanup`, rate limit socket, cờ `afterDispute`, `auditHash`.
- `assertChainConfig`.
- Lỗi `P2034` khi tạo reservation đã được đổi thành `ISSUE_NOT_OPEN` (`select.module.ts:217`). Dòng log "write conflict or deadlock" ở e04 là lỗi đã được xử lý, không cần sửa.

---

## 2. Thay đổi so với Phần B của HAIKU_CONTINUE.md

**2.1 Gate mới (thay B0.2).** Thêm `next build` vào giữa. Build đã được xác minh chạy qua sau khi sửa K1.

```bash
bun run typecheck && bun run lint && bun run --cwd apps/web build && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test && bun run test:e2e:local
```

Vẫn đặt biến môi trường như B0.1 trong cùng lệnh. Build mất khoảng 2–4 phút; chạy cả gate ở foreground với timeout 600000 ms. Nếu hết giờ thì chạy thành hai lệnh: (typecheck, lint, build) rồi (các bộ test).

**2.2 Thêm vào danh sách được phép (B1):**
- Chạy Chrome headless qua Playwright (`channel: "chrome"`). Chrome đã cài ở `/Applications/Google Chrome.app`.
- Nếu `channel: "chrome"` không chạy được: được chạy `cd apps/web && bunx playwright install chromium` (chỉ tải trình duyệt vào cache, không đổi `package.json` hay `bun.lock`).

---

## 3. Việc cần làm, theo đúng thứ tự

Mỗi mục làm theo vòng B3: test, code, typecheck và lint, test của mục, commit một commit, cập nhật `LOCAL_TEST_MATRIX.md` và bảng trong `reports/CODEX.md`. Mã mục dùng tiền tố `K`.

### K0. Kiểm mốc ban đầu

1. `git status` phải sạch, `git log -1` là `29bc205` hoặc mới hơn.
2. Commit file này: `docs(plan): add final haiku handoff`.
3. Không chạy gate ở bước này. Chạy ở K5.

### K1. Sửa `next build` (đóng Z-6)

**Nguyên nhân (đã xác minh):** `@vercel/nft`, công cụ Next dùng để dò file cần đóng gói, tự tính trước giá trị các biến khai báo bằng hằng. Ở `apps/web/src/graphql/modules/analytics/analytics.module.ts` dòng 103:

```ts
const disputes = new Map<string, bigint>(); let duration = 0n, resolvedDisputes = 0n;
```

nft coi `resolvedDisputes` là hằng `0n` và tính `duration / resolvedDisputes` ở dòng 118 mà bỏ qua điều kiện `resolvedDisputes ?`. Phép chia BigInt cho `0n` ném `RangeError: Division by zero` và làm build hỏng.

**Sửa (đã thử, build qua):**
- Dòng 103: `let duration = 0n, resolvedDisputes = 0;` (đếm bằng number).
- Dòng 113 giữ `resolvedDisputes++`.
- Dòng 118: `meanDisputeResolutionSeconds: resolvedDisputes ? (duration / BigInt(resolvedDisputes)).toString() : null`.
- Thêm một dòng comment phía trên dòng 103: `// Count as a number: nft folds a 0n literal and crashes the build on the guarded division below.`

**Kiểm:** `bun run --cwd apps/web build` exit 0. Test analytics hiện có vẫn pass (`grep -rln meanDisputeResolutionSeconds apps/web/src/test`).

**Sau đó:** trong `reports/CODEX.md` chuyển Z-6 từ "Bị chặn" sang "xong" kèm hash commit. Xóa dòng Z-6 khỏi mục "Bị chặn".

Commit: `fix(z-6): avoid nft constant-folding a bigint division by zero`.

### K2. Khách hàng không nạp tiền được từ giao diện

**Lỗi:** `fundEscrow` trong `apps/web/src/components/marketplace/issue-detail-view.tsx` (~dòng 329) lấy ví developer từ `issue?.developer?.walletAddress`. Lúc reservation đang chờ nạp (`AWAITING_FUNDING`), `issue.developerId` vẫn là `null`, vì chỉ worker gán nó khi escrow đã được nạp (`apps/worker/src/effects/escrow.ts:118`). Hàm vì thế `return` ngay, không báo lỗi gì, và nút "Fund" bấm không có tác dụng. E2E không bắt được vì harness tự ký và tự gửi giao dịch, không đi qua UI.

**Sửa:**
1. `apps/web/src/graphql/modules/escrow/reservation.module.ts`: thêm vào type `FundingReservation` hai field:
   - `clientWallet: String!` lấy `walletAddress` của user `clientId`.
   - `developerWallet: String!` lấy `walletAddress` của user `developerId`.
   Resolver đọc qua `ctx.db.user.findUniqueOrThrow({ where: { id }, select: { walletAddress: true } })`. Không thêm dataloader; mỗi màn hình chỉ có một reservation.
2. `issue-detail-view.tsx`:
   - Thêm `clientWallet developerWallet` vào `RESERVATION_QUERY` (dòng 52) và type `ReservationRow`.
   - `fundEscrow` bỏ hai dòng đọc `issue?.client?.walletAddress` và `issue?.developer?.walletAddress`, cùng dòng `if (!clientWallet || !developerWallet) return;`.
   - Gọi `signFundingIntent(reservation, reservation.clientWallet, reservation.developerWallet)`.
   - Không còn nhánh `return` im lặng nào trong `fundEscrow`. Mọi trường hợp thiếu dữ liệu phải `throw new Error(...)` để hiện qua `setError`.
3. `FundingReservation` type trong `apps/web/src/lib/web3/funding-intent.ts` giữ nguyên. Hàm đã nhận địa chỉ client và developer qua tham số.
4. Rà các hàm hành động khác trong `issue-detail-view.tsx` và `dashboard-view.tsx` có `if (!x) return;` ở đầu sau khi người dùng đã bấm nút. Nếu điều kiện đó có thể sai trong trạng thái mà nút đang hiện, đổi thành `setError("<lý do ngắn tiếng Việt>")` rồi `return`. Nếu không thể xảy ra thì để nguyên.

**Test:**
- `apps/web/src/test/fe-operations.test.ts` sẽ tự kiểm `RESERVATION_QUERY` mới hợp lệ với schema.
- Thêm một case vào test DB của reservation (tìm bằng `grep -rln "reservation(issueId" apps/web/src/test`): query `reservation { clientWallet developerWallet }` khi đang `AWAITING_FUNDING` trả đúng hai địa chỉ.
- Luồng UI thật được kiểm ở K8.

Commit: `fix(fe-4): fund from the reservation's wallets instead of the unassigned issue developer`.

### K3. Ví đang chọn sai tài khoản

**Lỗi:** `walletSigner()` trong `apps/web/src/lib/web3/send-prepared.ts` lấy tài khoản đang chọn trong ví mà không so với tài khoản đang đăng nhập. Nếu MetaMask đang chọn tài khoản khác, giao dịch được gửi từ địa chỉ sai: contract revert, hoặc chữ ký funding intent bị server từ chối với một lỗi khó hiểu.

**Sửa:**
- Đổi chữ ký thành `walletSigner(expected: string)`. Sau `eth_requestAccounts`, lấy `await signer.getAddress()`. Nếu khác `expected` (so chữ thường), ném `new Error(\`Ví đang chọn tài khoản ${short(actual)}, khác tài khoản đăng nhập ${short(expected)}. Đổi tài khoản trong ví rồi thử lại.\`)`, với `short(a) = a.slice(0, 6) + "…" + a.slice(-4)`.
- `sendPreparedCalls(calls, record, expected: string)`: thêm tham số thứ ba, truyền xuống `walletSigner`.
- `signFundingIntent(reservation, client, developer)`: gọi `walletSigner(client)`.
- Mọi chỗ gọi `sendPreparedCalls` (`issue-detail-view.tsx`, `dashboard-view.tsx`, và nơi khác nếu `grep -rn "sendPreparedCalls(" apps/web/src` tìm thấy) truyền `user.walletAddress` lấy từ `useAuthStore`. Nếu component chưa có `user`, lấy bằng `useAuthStore((s) => s.user)` như các component khác đang làm.

**Test:** thêm `apps/web/src/test/wallet-signer.test.ts` (vitest, jsdom). Gán `globalThis.ethereum` là một object có `request` giả: trả `["0xbbbb…"]` cho `eth_requestAccounts` và `eth_accounts`, trả `"0x7a69"` cho `eth_chainId`, trả `null` cho `wallet_switchEthereumChain`. Gọi `walletSigner("0xaaaa…")` và kiểm promise reject với message chứa `khác tài khoản đăng nhập`. Một case khớp địa chỉ thì resolve. Nếu `ensureActiveChain` gọi thêm method khác, cho mock trả giá trị hợp lý cho method đó.

Commit: `fix(fe-1b): refuse to sign or send from a wallet account other than the signed-in one`.

### K4. Webhook GitHub

Ba lỗi trong `apps/web/src/app/api/webhooks/github/route.ts`:

1. **Ghi đè `commitSha` đã giao.** Dòng 67 `...(pr?.head?.sha ? { commitSha: pr.head.sha } : {})` thay `submission.commitSha` bằng head mới của PR mỗi lần có push. Nhưng `commitSha` là một phần của `manifest`, và `deliveryHash` của manifest đã được ghi on-chain lúc `submitWork`. Sau khi bị ghi đè, cột `commitSha` không còn khớp với bản đã giao. **Sửa:** xóa dòng đó. Webhook chỉ cập nhật `prNumber`, `prState`, `mergedAt`.
2. **Mất event khi xử lý lỗi.** Delivery được ghi vào `githubWebhookDelivery` trước khi xử lý. Nếu bước sau ném lỗi (DB chập chờn), GitHub gửi lại nhưng route trả `duplicate: true` và event mất hẳn. **Sửa:** bọc toàn bộ phần sau `createMany` trong `try { ... } catch (error) { await prisma.githubWebhookDelivery.delete({ where: { deliveryId } }).catch(() => undefined); throw error; }`. Các nhánh `return` hợp lệ bên trong (ignored, unmatched) vẫn giữ delivery.
3. **Chọn submission không ổn định.** `findFirst` theo `pullRequestUrl` không có `orderBy`; một PR có nhiều bản giao (bản sửa lại) thì kết quả tùy ý. **Sửa:** thêm `orderBy: { submittedAt: "desc" }`.

**Test** (`apps/web/src/test/github-webhook.test.ts`, theo mock sẵn có trong file):
- Event `synchronize` với `head.sha` mới: `submission.update` được gọi mà `data` không có `commitSha`.
- `submission.update` ném lỗi: route ném lỗi, `githubWebhookDelivery.delete` được gọi với đúng `deliveryId`. Gửi lại cùng delivery thì được xử lý (không trả `duplicate`).
- `findFirst` được gọi với `orderBy: { submittedAt: "desc" }`.

Commit: `fix(p1-31): keep delivered commit, retry failed deliveries, pick latest submission`.

### K5. Lỗi 429 chập chờn trong E2E

**Nguyên nhân:** `clientIp()` (`apps/web/src/lib/rate-limit.ts`) trả `"unknown"` khi request không có `x-forwarded-for`. Mọi request của harness vì thế dùng chung một bucket: `graphql:unknown` (600 điểm/phút) và `nonce:ip:unknown` (30 lần/phút). Test thứ hai của E27 cố ý bắn GraphQL tới khi hết điểm, và mọi request trong vòng một phút sau đó đều có thể nhận 429. Đó là lỗi `GraphQL HTTP 429` từng gặp ở E1. Ngoài ra `login()` gọi `/api/auth/nonce` cho mỗi user của mỗi file, nên giới hạn 30 lần/phút trên bucket chung có thể bị chạm khi suite chạy nhanh.

**Sửa (chỉ sửa test, không đổi code chạy thật):**
- `tests/e2e/harness/gql.ts`: hàm `gql` thêm header `"x-forwarded-for": randomTestIp()`, với `randomTestIp = () => \`10.${b()}.${b()}.${b()}\`` và `b = () => Math.floor(Math.random() * 254) + 1`. Mỗi request được một IP riêng, nên các file test không còn dùng chung bucket.
- `tests/e2e/harness/wallet.ts`: cả request nonce và login cũng gửi header đó. Đặt `randomTestIp` trong một file chung `tests/e2e/harness/ip.ts` rồi import ở cả hai nơi.
- `tests/e2e/e27-rate-limit.test.ts`: mọi `fetch` trong E27 gửi header cố định `x-forwarded-for: 203.0.113.27`, để E27 có bucket riêng và vẫn kiểm đúng giới hạn. Bỏ bước `probe` + `waitFor` ở test nonce, vì bucket riêng không cần chờ.
- Comment một dòng trong `ip.ts`: `// Each harness request gets its own client IP so per-IP limits never couple scenarios; E27 pins its own IP to test them.`

**Không làm:** không đổi `clientIp`, không thêm biến môi trường nới giới hạn. Production chạy sau proxy (Vercel), proxy luôn gắn `x-forwarded-for`.

**Kiểm:** chạy `bun run test:e2e:local` ba lần liên tiếp. Cả ba phải pass và log không có `429` ngoài E27 (`grep -c "HTTP 429" <log>` phải bằng 0).

Sau K5 chạy **gate mới (2.1)** một lần.

Commit: `fix(test): give each harness request its own client IP`.

### K6. Tải được file upload chưa hoàn tất

**Lỗi:** `GET /api/uploads` (`apps/web/src/app/api/uploads/route.ts`, hàm `canDownload`) không kiểm `attachment.status`. Bản ghi `PENDING` (chưa qua `/api/uploads/complete`, chưa có sha256) với `purpose: AVATAR` hoặc `ISSUE_IMAGE` công khai vẫn tải được.

**Sửa:** trong `GET`, ngay sau đoạn kiểm `attachment` tồn tại: nếu `attachment.status === "PENDING"` và người gọi không phải người upload (`user?.id !== attachment.uploaderId`), trả 404 `File not found`. Người upload vẫn tải được để xem lại.

**Test:** thêm hai case vào `apps/web/src/test/upload-access.test.ts`: `PENDING` + AVATAR + khách thì 404; `PENDING` + người upload thì 200.

Commit: `fix(p1-30b): hide pending uploads from everyone but the uploader`.

### K7. Form tạo bài chặn sai role

**Lỗi:** `apps/web/src/components/issues/create-issue-form.tsx:176` chặn người có `user.role !== "CLIENT"`. Backend đã bỏ chặn theo role (QĐ-21, xem `DECISIONS.md` mục BỔ SUNG C2): mọi người dùng không bị ban, trừ ADMIN, đều được tạo bài.

**Sửa:**
- Đổi điều kiện thành `user.role === "ADMIN"`, giữ nguyên khối JSX đang hiện. Đổi nội dung hiển thị sang key mới `adminCannotCreateIssue` (vi: "Tài khoản quản trị không đăng bài.", en: "Admin accounts cannot post tasks."). Thêm key vào file i18n đang chứa `switchToClient` (tìm bằng `grep -rn "switchToClient" apps/web/src`).
- Nếu `switchToClient`, `developerRoleExplanation`, `clientWorkspace` không còn chỗ nào dùng thì xóa khỏi file i18n.
- Rà thêm: `grep -rn 'role !== "DEVELOPER"\|role === "DEVELOPER" &&' apps/web/src/components`. Nút ứng tuyển chỉ được ẩn khi người xem là chủ bài hoặc ADMIN, không được ẩn vì role CLIENT. Sửa theo cùng nguyên tắc nếu có.

**Test:** không cần test riêng; typecheck, lint và `fe-operations` đủ.

Commit: `fix(fe): let any non-admin account post a task, matching the API`.

### K8. Test UI thật cho luồng tiền (E32)

Mục đích: thay phần lớn việc thử tay bằng MetaMask. Chạy Chrome headless với một ví giả gắn vào `window.ethereum`. Ví giả chuyển mọi lệnh RPC tới Hardhat, nơi các tài khoản test đã được mở khóa sẵn nên ký và gửi giao dịch được mà không cần private key.

**Đã xác minh:** `import { chromium } from "@playwright/test"` chạy được bằng Bun 1.4 khi file nằm trong `apps/web` (package chỉ resolve được từ đó), với `chromium.launch({ channel: "chrome" })`. `page.exposeFunction` hoạt động.

**File:**
- `apps/web/ui-e2e/wallet.ts`: `injectWallet(context, address)`.
  - `await context.exposeFunction("__hardhatRpc", async (method: string, params: unknown[]) => ...)`. Phía Node: với `eth_requestAccounts` và `eth_accounts` trả `[address]`; với `eth_chainId` trả `"0x7a69"`; với `net_version` trả `"31337"`; với `wallet_switchEthereumChain` và `wallet_addEthereumChain` trả `null`; mọi method khác gọi `rpc(method, params)` từ `tests/e2e/harness/chain.ts`. Nếu Hardhat trả lỗi thì ném `Error` mang message của lỗi đó.
  - `await context.addInitScript(() => { window.ethereum = { isMetaMask: true, request: ({ method, params }) => window.__hardhatRpc(method, params ?? []), on() {}, removeListener() {} }; })`. Khai báo type cho `window` bằng `as unknown as`.
- `apps/web/ui-e2e/e32-ui-flow.test.ts` (bun test):
  - `beforeAll`: `assertTestDatabase(process.env.TEST_DATABASE_URL)`; `browser = await chromium.launch({ channel: "chrome" })`.
  - `afterAll`: `browser.close()`.
  - Helper `asUser(account)`: `login(account)` từ `tests/e2e/harness/wallet.ts` trả cookie dạng `bloody_token=<jwt>`. Tách tên và giá trị rồi `context.addCookies([{ name, value, domain: "localhost", path: "/" }])`. Gọi `injectWallet(context, account)`. Trả `page`.
  - Import harness bằng đường dẫn tương đối `../../../tests/e2e/harness/...`.

**Test 1 – "E32: client funds, developer delivers, client releases, developer claims, all through the UI"** (timeout 300000):
1. `f = await fixture()`. `await f.select(f.applicationId)` để có reservation `AWAITING_FUNDING`.
2. Mint USDC cho client. Tách đoạn mint trong `fund()` của `tests/e2e/harness/funding.ts` thành `export async function mintUsdc(f, to, amount)`, cho `fund()` gọi lại nó, rồi gọi `mintUsdc(f, f.accounts[2], 100000000n)`.
3. Client: mở `http://localhost:4012/issues/${f.issueId}`, bấm nút nạp tiền (nhãn lấy từ `issue-detail-view.tsx` quanh dòng 583; dùng `page.getByRole("button", { name: <nhãn> })`). `waitFor` cho tới khi `escrowProjection.phase === "FUNDED"` (qua `f.prisma`, như trong `fund()`).
4. Developer: context mới, mở cùng trang, chờ thẻ giao việc hiện ra. Điền mô tả (ô mô tả của form giao việc), bấm nút gửi. `waitFor` tới khi projection sang pha đã giao. Pha đúng lấy từ `apps/worker/src` hoặc từ `tests/e2e/e09-work.test.ts`.
5. Client: tải lại trang, bấm duyệt bản giao (nút gọi `reviewDelivery(id, true)`). `waitFor` tới pha đã release, đúng như `e10-release-claim.test.ts` đang chờ.
6. Developer: mở `http://localhost:4012/dashboard`, bấm nút rút tiền (nhãn trong `dashboard-view.tsx` quanh dòng 63–67). Đọc số dư trước và sau bằng `tokenBalance(f, f.accounts[3])` trong `tests/e2e/harness/payout.ts`. Số dư phải tăng đúng `97500000n` (100 USDC 6 số lẻ, trừ phí 250 bps; cùng số E10 đang kiểm).
7. Mỗi bước có `await expect(page.getByRole("alert")).toHaveCount(0)` hoặc kiểm tương đương rằng không có thông báo lỗi trước khi chờ chain.

**Test 2 – "E32: the UI refuses to sign when the wallet account differs from the signed-in account"** (timeout 120000):
1. `f = await fixture()`, `f.select(f.applicationId)`.
2. Đăng nhập cookie của client (`f.accounts[2]`) nhưng `injectWallet` với `f.accounts[4]`.
3. Bấm nút nạp tiền. Trang phải hiện thông báo lỗi chứa `khác tài khoản đăng nhập` (từ K3). Kiểm `fundingReservation` vẫn `AWAITING_FUNDING` và không có `transactionIntent` mới cho issue.

**Nối vào harness** (`tests/e2e/run-local.ts`):
- Sau khi `bun test` của `tests/e2e` pass và **trước khi tắt các service**, chạy `Bun.spawn(["bun", "test", "./ui-e2e"], { cwd: "apps/web", env: { ...env, NODE_ENV: "test" }, stdout: "inherit", stderr: "inherit" })`. Exit khác 0 thì harness exit khác 0.
- Danh sách bắt buộc: giữ kiểm E1–E31 trong `tests/e2e`, thêm kiểm file `apps/web/ui-e2e/e32-ui-flow.test.ts` tồn tại.
- Log cuối đổi thành `E2E scenarios passed (E1–E32)`.
- `apps/web/vitest.config.ts` chỉ include `src/**`, nên vitest không chạy nhầm `ui-e2e`. Nếu `bun run typecheck` báo lỗi type `bun:test` trong `apps/web/ui-e2e`, thêm `"ui-e2e"` vào `exclude` của `apps/web/tsconfig.json`. Không thêm `@types/bun`.

**Khi không chạy được:**
- `channel: "chrome"` lỗi: chạy `cd apps/web && bunx playwright install chromium` rồi bỏ `channel`.
- Nút không thấy: đọc lại JSX, dùng đúng nhãn. Không đổi nhãn hay layout để test dễ viết. Nếu phải thêm selector, chỉ thêm `data-testid` vào nút.
- Chain không đổi pha sau khi bấm: in `page.on("console")` và `page.on("pageerror")` ra file trong `tests/e2e/.run/ui.log` để tìm lỗi. Đây thường là lỗi thật của FE; sửa FE và commit riêng `fix(fe-...)`.
- Thử 3 cách vẫn không qua: ghi "Bị chặn K8" kèm log, gỡ bước nối harness (để gate vẫn xanh), giữ file test, rồi làm K9.

Commit: `test(e32): drive funding, delivery, release and claim through the UI`.

### K9. E28 ở trạng thái đã có escrow

**Thiếu:** E28 chỉ chạy trên issue chưa có escrow, nên người ngoài luôn nhận `NOT_FOUND` từ bước kiểm escrow, chưa bao giờ chạm tới bước kiểm quyền.

**Sửa:** thêm một test vào `tests/e2e/e28-authz.test.ts`:
1. `f = await fixture()`, `await fund(f)`.
2. Người ngoài (`f.outsider`) gọi lần lượt mọi mutation `prepare*` nhận `issueId` (lấy danh sách bằng `grep -n "mutationField(\"prepare" apps/web/src/graphql/modules -r`), cùng `createEvidenceManifest`.
3. Mỗi lời gọi phải lỗi với đúng mã mà `docs/AUTHZ_MATRIX.md` ghi cho người ngoài.
4. Nếu code trả mã khác ma trận:
   - Code trả `FORBIDDEN` hoặc `NOT_FOUND`: cả hai đều chặn đúng. Sửa ma trận theo code, ghi `BỔ SUNG K9`.
   - Code **không lỗi** (người ngoài gọi được): đây là lỗ hổng quyền. Sửa code để trả `FORBIDDEN`, commit riêng `fix(authz): ...` kèm test.

Commit: `test(e28): check participant guards on a funded escrow`.

### K10. Đóng tài liệu

1. `DECISIONS.md`, thêm các mục:
   - `## BỔ SUNG FE-LAYOUT — chấp nhận thay đổi thẻ Escrow actions`: thẻ hiện theo `viewerCapabilities` thay vì chỉ với bên tham gia ở `IN_PROGRESS`; thêm nút hủy giữ chỗ và ô mã commit. Lý do: cần cho các hành động mới; không đổi màu hay khung.
   - `## BỔ SUNG FE-2 — chấp nhận`: giữ `load()` và socket, không dùng react-query.
   - Các mục BỔ SUNG mới phát sinh trong K1–K9.
2. `reports/CODEX.md`:
   - Dòng đầu: `HOÀN TẤT <ngày giờ> (gate 2.1 exit 0; E1–E32 pass; build pass)`.
   - Mục "Ghi chú kiểm toán" của phiên trước: đánh dấu đã xử lý cho các dòng về E1 429 (K5), create-issue-form (K7), E28 (K9), layout (K10.1), FE-2 (K10.1).
   - Thêm bảng K0–K10 với hash commit.
   - Mục "Bị chặn" phải trống, hoặc chỉ còn K8 nếu K8 bị chặn.
3. `docs/LOCAL_DEV.md`: thêm một đoạn ngắn "Test UI tự động (E32)": chạy cùng `bun run test:e2e:local`, dùng Chrome headless và ví giả, log ở `tests/e2e/.run/ui.log`.
4. Chạy gate 2.1 lần cuối. Commit `docs(report): final status after review fixes`.

---

## 4. Định nghĩa xong

Tất cả đều phải đúng:

1. Gate 2.1 exit 0, gồm `next build`. `test:e2e:local` in `E2E scenarios passed (E1–E32)`.
2. K5: ba lần chạy `test:e2e:local` liên tiếp đều pass, không có `HTTP 429` ngoài E27.
3. Các lệnh sau đều không in gì:
   ```bash
   grep -n "resolvedDisputes = 0n" apps/web/src/graphql/modules/analytics/analytics.module.ts
   grep -n "issue?.developer?.walletAddress" apps/web/src/components/marketplace/issue-detail-view.tsx
   grep -n "commitSha: pr.head.sha" apps/web/src/app/api/webhooks/github/route.ts
   grep -n 'role !== "CLIENT"' apps/web/src/components/issues/create-issue-form.tsx
   grep -rn "walletSigner()" apps/web/src
   ```
4. `git status` sạch. `reports/CODEX.md` có dòng `HOÀN TẤT` và mục "Bị chặn" trống (hoặc chỉ K8 kèm bằng chứng).
5. Mọi mục `BỔ SUNG` mới nằm trong `DECISIONS.md`.

Khi xong, in đúng ba phần: (1) các mục K đã xong kèm hash; (2) kết quả gate từng lệnh; (3) "Bị chặn" và các mục `BỔ SUNG` mới.

---

## 5. Việc người dùng tự làm (bạn không làm)

- Thử luồng một lần bằng MetaMask thật theo `docs/LOCAL_DEV.md`. Sau K8, việc này chỉ còn để xem giao diện, không cần kiểm logic.
- Xóa các worktree a1–a5 cũ khi không cần nữa.
- Push nhánh, mở PR, deploy.
