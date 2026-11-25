# Đăng nhập Google qua thirdweb in-app wallet (US-106)

Ngày: 2026-11-23 · Người làm: Khôi · Sprint 7 · Jira: [US-106](https://trongkhoidev.atlassian.net/browse/US-106) (liên quan US-101)

## 1. Bối cảnh

Trong `ConnectModal`, tab Google đang ghi "coming soon". Bấm vào chỉ hiện một dòng chữ rồi chuyển người dùng về tab ví. Lý do cũ (mục W-4, `COMPLETION_PLAN_2026-11-15.md`): đăng nhập kiểu social không có ví nên không ký được giao dịch escrow.

thirdweb SDK v5 có **in-app wallet**. Người dùng đăng nhập Google xong thì thirdweb cấp cho họ một ví EOA, khóa do thirdweb giữ. Ví này ký được:

- message SIWE để đăng nhập (`personal_sign`),
- giao dịch escrow (nạp tiền, nộp bài, release, dispute, claim),
- chữ ký EIP-712 cho funding intent.

Vậy là bỏ được rào cản W-4, mà server auth giữ nguyên.

### Hiện trạng code

| Chỗ | Hiện tại |
|---|---|
| `apps/web/src/lib/auth.ts`, `lib/auth/siwe.ts` | `@thirdweb-dev/auth` v4 chạy phía server: tạo payload SIWE, verify chữ ký, phát JWT. **Không sửa.** |
| `apps/web/src/app/api/auth/nonce`, `.../login` | Nhận địa chỉ, verify chữ ký bằng ecrecover, upsert `users.walletAddress`, tạo `Session`, set cookie `bloody_token`. **Không sửa.** |
| `apps/web/src/lib/store/use-auth-store.ts` → `loginWithSignature(address, signerFn)` | Đã nhận `signerFn` bất kỳ, dùng lại được nguyên vẹn. |
| `apps/web/src/components/auth/connect-modal.tsx` | Chỉ có luồng ví injected. Tab social là placeholder. |
| `apps/web/src/lib/web3/client.ts` | `SOCIAL_OPTIONS` (google/github/email) chỉ khai báo, không nơi nào dùng. `ensureActiveChain()` chỉ làm việc với `window.ethereum`. |
| `apps/web/src/lib/web3/send-prepared.ts` → `walletSigner(expected)` | Lấy signer từ `window.ethereum`. Đây là **điểm nghẽn duy nhất** phía giao dịch: `sendPreparedCalls` (issue-detail-view, dashboard-view) và `signFundingIntent` (funding-intent.ts) đều đi qua hàm này. |
| `packages/database/prisma/schema.prisma` → `User` | `walletAddress @unique`, `email String? @unique` đã có. |
| CSP | Không có header CSP nên iframe/popup của thirdweb không bị chặn. |

## 2. Phạm vi

**Làm:**
- Đăng nhập bằng Google qua thirdweb in-app wallet (EOA) trên chain đang dùng (`ACTIVE_CHAIN`: Base Sepolia 84532, hoặc Hardhat 31337 khi chạy local).
- Người dùng Google ký được mọi giao dịch và chữ ký EIP-712 đang có.
- Giữ ví đã kết nối qua reload trang. Khi logout thì ngắt ví.

**Không làm (YAGNI):**
- Đăng nhập GitHub hoặc email OTP kiểu social. Xoá hai mục này khỏi `SOCIAL_OPTIONS`. Liên kết GitHub trong profile giữ như cũ.
- Smart account, gas sponsorship, account abstraction (lý do ở mục 4, R1).
- Gộp tài khoản Google với tài khoản MetaMask có sẵn.
- Chuyển `@thirdweb-dev/auth` v4 phía server sang v5. Việc này để riêng, xem US-84 / ADR-0012.
- Lưu email Google vào DB (lý do ở mục 3.5).

## 3. Thiết kế

### 3.1 Gói và cấu hình

- `bun add thirdweb --cwd apps/web`, ghim một bản v5 ổn định (`^5.x`). Gói này chạy cùng với các gói `@thirdweb-dev/*` v4 được vì tên khác nhau.
- Env: `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (đã có trong `next.config.mjs` và `.env.example`). **Giữ lại**, bỏ mục "xoá biến THIRDWEB_*" trong US-101. `THIRDWEB_SECRET_KEY` chưa cần.
- thirdweb dashboard:
  1. Tạo project, lấy Client ID.
  2. Allowed domains: `localhost:4000`, domain Railway/production.
  3. In-app wallet: bật Google.

### 3.2 Module mới `apps/web/src/lib/web3/in-app.ts`

Đây là file duy nhất import `thirdweb`. Nó được import động để không làm nặng bundle của trang không cần đăng nhập.

```ts
// API dự kiến (Codex kiểm lại với bản thirdweb cài thật)
export function isInAppConfigured(): boolean            // có NEXT_PUBLIC_THIRDWEB_CLIENT_ID
export async function connectGoogle(): Promise<Account> // inAppWallet({auth:{options:["google"]}}).connect({client, strategy:"google", chain})
export async function restoreInAppAccount(): Promise<Account | null> // wallet.autoConnect({client, chain}), lỗi → null
export async function inAppEthersSigner(account): Promise<ethers.Signer> // ethers5Adapter.signer.toEthers({client, chain, account})
export async function disconnectInApp(): Promise<void>
```

- `client = createThirdwebClient({ clientId })`, tạo lazy một lần.
- `chain = defineChain({ id: ACTIVE_CHAIN.chainId, rpc: ACTIVE_CHAIN.rpcUrl })`. Như vậy chạy được cả Hardhat local lẫn Base Sepolia, không cần sửa chỗ khác.
- `wallet` là singleton trong module.

### 3.3 Đánh dấu kiểu đăng nhập

Lúc gửi giao dịch, client phải biết người dùng đã vào bằng Google hay bằng ví injected.

- Lưu `localStorage["bloody-roar-wallet-kind"] = "in-app" | "injected"` khi login thành công. Đặt hai helper `getWalletKind()` / `setWalletKind()` trong `client.ts`, bọc try/catch vì localStorage có thể ném lỗi.
- Logout thì xoá key và gọi `disconnectInApp()` nếu kind là `"in-app"`.
- Server không cần biết giá trị này. Session vẫn chỉ gắn với địa chỉ ví.

### 3.4 Luồng UI (connect-modal.tsx)

Tab label: **"Google"** (bỏ "coming soon").

Nội dung tab:
1. Nút **"Continue with Google"** (`data-testid="social-btn-google"`).
2. Dòng mô tả ngắn: "We create a wallet for your Google account. You'll need test ETH on {ACTIVE_CHAIN.name} for gas before funding or submitting work."
3. Nếu chưa cấu hình client ID: nút bị disable, ghi "Google sign-in is not configured on this server." Không được crash.

Khi bấm:
```
click → connectGoogle()            // popup Google; status "signing"
      → setWalletKind("in-app")
      → loginWithSignature(account.address, (msg) => account.signMessage({ message: msg }))
      → thành công: đóng modal, router.replace + refresh (giống luồng ví)
      → lỗi: setStatus("error", message dễ hiểu)
```

- **Popup bị trình duyệt chặn:** `connect()` phải được gọi gần như ngay trong click handler. Preload module `in-app.ts` (và `thirdweb`) khi người dùng mở tab Google (`useEffect` theo `activeTab`), để lúc click không phải chờ `import()` lâu.
- Header modal khi đang xử lý: "Signing in with Google…" thay cho "Connecting to wallet…".
- Thông báo lỗi chuyển sang tiếng Anh dễ hiểu:
  - popup bị đóng hoặc người dùng huỷ → "Google sign-in was cancelled."
  - popup bị chặn → "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again."
  - lỗi mạng / thirdweb → "Google sign-in failed. Please try again."
- Xoá `github` và `email` khỏi `SOCIAL_OPTIONS`. Nếu không còn chỗ nào dùng `SOCIAL_OPTIONS` thì xoá luôn.
- Sửa `apps/web/src/test/marketplace.test.tsx:151`: test này đang khẳng định `social-btn-google` **không** có trên trang. Cập nhật lại theo hành vi mới.

### 3.5 Backend và DB

- **Không cần sửa route.** Ví in-app là EOA, chữ ký SIWE verify bằng ecrecover giống MetaMask. `/api/auth/nonce` và `/api/auth/login` chạy nguyên trạng.
- **Không cần migration.** Địa chỉ ví in-app ghi vào `users.walletAddress` qua upsert sẵn có. Người dùng mới có tài khoản ngay ở lần đăng nhập đầu.
- **Không lưu email Google.** Client tự báo email thì không tin được. Muốn có email đáng tin phải gọi `getUser()` của thirdweb phía server bằng `THIRDWEB_SECRET_KEY`, nhưng hiện chưa tính năng nào cần email nên bỏ qua.
- Rate limit, ban, admin promote áp dụng y như ví thường vì đều dựa trên địa chỉ.

### 3.6 Ký giao dịch (send-prepared.ts)

Sửa `walletSigner(expected)`:

```
kind = getWalletKind()
if kind === "in-app":
    account = await restoreInAppAccount()
    if !account → throw "Your Google wallet session expired. Sign out and sign in with Google again."
    if account.address.lower !== expected.lower → throw "...not the signed-in account..."
    return inAppEthersSigner(account)   // ethers v5 Signer, đã trên ACTIVE_CHAIN
else:
    giữ nguyên luồng window.ethereum hiện tại
```

- Đổi kiểu trả về từ `JsonRpcSigner` sang `ethers.Signer` (đủ cho `sendTransaction`). `funding-intent.ts` gọi `signer._signTypedData`, nên kiểu cần là `ethers.Signer & TypedDataSigner` (`@ethersproject/abstract-signer`).
- **Phải kiểm bằng code thật:** signer adapter của thirdweb có `_signTypedData` không, và `sendTransaction()` có trả `TransactionResponse` kèm `.wait()` không. Nếu không có `.wait()`, đổi `sendPreparedCalls` sang `signer.provider!.waitForTransaction(tx.hash, 1)`. Cách này dùng được cho cả hai loại signer.
- `ensureActiveChain()` chỉ gọi ở nhánh injected. Ví in-app đã gắn `chain` lúc connect.

### 3.7 Logout và phiên

- `use-auth-store.ts` `logout()`: nếu kind là `"in-app"` thì `import("@/lib/web3/in-app").then(m => m.disconnectInApp())`, nuốt lỗi. Sau đó xoá kind.
- Cookie session (24h) và phiên thirdweb tách nhau. Có thể cookie còn hạn mà phiên thirdweb đã hết; khi đó `walletSigner` báo lỗi rõ ràng (3.6) để người dùng đăng nhập lại. Không tự mở popup trong `walletSigner`, vì lúc đó đã qua vài `await` và popup gần như chắc chắn bị chặn.

## 4. Rủi ro và cách xử lý

| # | Rủi ro | Ảnh hưởng | Cách xử lý |
|---|---|---|---|
| R1 | Bật smart account / sponsored gas | Địa chỉ ký là contract, chữ ký kiểu ERC-1271. Server SIWE (ecrecover) từ chối. `msg.sender` trong escrow là smart account, lệch `users.walletAddress`. | **Chỉ dùng EOA.** Không truyền `smartAccount` vào `inAppWallet()`. Ghi comment ở chỗ khởi tạo. |
| R2 | Ví Google mới có 0 ETH, 0 USDC | Không nạp escrow, không trả được gas. | Ghi rõ trong tab Google. Nếu giao dịch lỗi `insufficient funds`, đổi thành "Your wallet needs {chain} ETH for gas. Address: 0x…". Local: dùng `hardhat_setBalance` và mint MockUSDC (mục 6.3). Testnet: faucet Base Sepolia. |
| R3 | Trình duyệt chặn popup | Không đăng nhập được. | Preload module khi mở tab và gọi `connect()` ngay trong click. Bắt lỗi rồi báo hướng dẫn cho phép popup. |
| R4 | Phiên thirdweb hết hạn trong khi cookie còn | Bấm nạp tiền thì lỗi. | `restoreInAppAccount()` trả null → thông báo đăng nhập lại (3.6, 3.7). |
| R5 | `ethers5Adapter` không đủ API ethers v5 (`_signTypedData`, `.wait()`) | Funding intent hoặc chờ receipt hỏng. | Kiểm bằng test khi cài (3.6). Có phương án dự phòng `provider.waitForTransaction`. Nếu thiếu `_signTypedData` thì gọi thẳng `account.signTypedData` trong nhánh in-app. |
| R6 | Cùng một người có 2 tài khoản (MetaMask và Google) | Hai địa chỉ thành hai user khác nhau. | Chấp nhận, không gộp. Ghi trong `/guide` nếu cần. |
| R7 | Bundle `thirdweb` lớn | Trang chậm. | Chỉ import động `in-app.ts` khi mở tab Google, khi gửi giao dịch với kind in-app, hoặc khi logout. Kiểm `bun run build`: các route không đăng nhập không có chunk thirdweb. |
| R8 | Thiếu client ID / domain chưa allowlist | Popup báo lỗi hoặc kết nối bị từ chối. | `isInAppConfigured()` thì disable nút. Checklist dashboard ở mục 3.1. Domain deploy phải thêm trước demo. |
| R9 | thirdweb giữ khóa (custodial một phần) | Phụ thuộc bên thứ ba cho tiền thật. | Hiện chạy testnet nên chấp nhận được. Ghi chú trong `/guide` hoặc FAQ rằng người giữ nhiều tiền nên dùng ví riêng. |
| R10 | Lẫn kind: login Google xong, sau đó login MetaMask trên cùng trình duyệt | `walletSigner` đi sai nhánh. | Mọi lần login thành công đều ghi đè kind (`"injected"` ở luồng ví). |
| R11 | Xung đột với kế hoạch cũ (US-101 W-4: ẩn tab, xoá biến) | Hai người sửa ngược nhau. | Đã link US-106 ↔ US-101. Người làm US-101 bỏ hai mục đó. |

## 5. Danh sách file

| File | Thay đổi |
|---|---|
| `apps/web/package.json`, `bun.lock` | thêm `thirdweb` v5 |
| `apps/web/src/lib/web3/in-app.ts` | **mới**: client, chain, connect/restore/signer/disconnect |
| `apps/web/src/lib/web3/client.ts` | `getWalletKind`/`setWalletKind`; xoá github/email khỏi `SOCIAL_OPTIONS` (hoặc xoá hẳn nếu không dùng) |
| `apps/web/src/components/auth/connect-modal.tsx` | tab Google thật; luồng ví ghi kind `"injected"` |
| `apps/web/src/lib/web3/send-prepared.ts` | `walletSigner` tách nhánh; kiểu trả về; chờ receipt |
| `apps/web/src/lib/web3/funding-intent.ts` | chỉ sửa kiểu nếu cần |
| `apps/web/src/lib/store/use-auth-store.ts` | logout ngắt ví in-app |
| `apps/web/src/test/marketplace.test.tsx` | sửa assertion `social-btn-google` |
| `apps/web/src/test/*` | test mới (mục 6.1) |
| `.env.example` | comment cho `THIRDWEB_CLIENT_ID`: cần cho Google login |
| DB / API routes | **không đổi** |

## 6. Kiểm thử

### 6.1 Unit (vitest, `bun run --cwd apps/web test`)

Mock `@/lib/web3/in-app` để không gọi thirdweb thật.

1. **Tab Google, thành công:** click `social-btn-google` → `connectGoogle` được gọi → `loginWithSignature` nhận đúng địa chỉ, `signerFn` gọi `account.signMessage` → modal đóng, kind = `"in-app"`.
2. **Huỷ popup:** `connectGoogle` reject → hiện "Google sign-in was cancelled.", modal vẫn mở, nút bấm lại được.
3. **Chưa cấu hình:** `isInAppConfigured()` false → nút disable, có thông báo.
4. **walletSigner nhánh in-app:** kind `"in-app"`, `restoreInAppAccount` trả account cùng địa chỉ → trả signer adapter, **không** đụng `window.ethereum`.
5. **walletSigner lệch địa chỉ:** account khác `expected` → ném lỗi "not the signed-in account".
6. **walletSigner phiên hết:** `restoreInAppAccount` → null → ném lỗi "session expired".
7. **walletSigner nhánh injected:** kind `"injected"` hoặc không có → hành vi cũ, test cũ vẫn qua.
8. **Logout:** kind `"in-app"` → `disconnectInApp` được gọi, kind bị xoá.
9. **Server (tuỳ chọn):** ký SIWE bằng một `ethers.Wallet.createRandom()` rồi gọi login route. Chứng minh EOA bất kỳ đăng nhập được. Có thể test hiện có đã phủ, Codex kiểm trước.

### 6.2 Regression tự động

- `bun run typecheck`, `bun run lint`, `bun run --cwd apps/web test`.
- `bun run test:e2e:backend` (login SIWE + issue flow) phải qua không đổi.
- Playwright `apps/web/ui-e2e` (ví injected giả) phải qua, chứng minh luồng MetaMask không hỏng.
- `bun run build`: build được, kiểm chunk thirdweb chỉ nằm ở chunk lazy.

### 6.3 Kiểm tay (không tự động được Google OAuth)

Chuẩn bị: client ID thật trong `.env`, `localhost:4000` đã allowlist, chain local (`bun run contracts:deploy`, `db:seed:local`) hoặc Base Sepolia.

Nạp tiền cho ví Google trên Hardhat local (thay `0xADDR`):
```bash
curl -s -X POST http://127.0.0.1:8545 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"hardhat_setBalance","params":["0xADDR","0x8AC7230489E80000"]}'
# MockUSDC: ai cũng mint được, xem tests/e2e/harness/funding.ts → mintUsdc
```

Checklist:
- [ ] Đăng nhập Google lần đầu → có user mới, cookie `bloody_token`, UserMenu hiện địa chỉ.
- [ ] Reload trang → vẫn đăng nhập. Mở issue và bấm hành động on-chain mà không phải đăng nhập lại.
- [ ] Logout rồi đăng nhập Google lại → **cùng địa chỉ** như lần trước.
- [ ] Client (Google): tạo bounty, ký funding intent, nạp escrow.
- [ ] Developer (Google, tài khoản thứ hai): nộp bài.
- [ ] Client release, developer claim trên dashboard.
- [ ] Raise dispute và nộp evidence bằng tài khoản Google.
- [ ] Ví 0 ETH → thông báo thiếu gas dễ hiểu, không phải lỗi thô.
- [ ] Đóng popup giữa chừng → thông báo huỷ, thử lại được.
- [ ] Chặn popup trong trình duyệt → thông báo hướng dẫn.
- [ ] MetaMask đăng nhập và giao dịch như cũ. Đổi qua lại Google ↔ MetaMask trên cùng trình duyệt không bị lẫn nhánh ký.
- [ ] Safari / mobile: đăng nhập Google được (popup trên mobile hay gặp lỗi nhất).
- [ ] Không có client ID → nút disable, trang không crash.

## 7. Thứ tự làm

1. Cài `thirdweb`, viết `in-app.ts`, đọc type thật của bản cài để chốt API (`connect`, `autoConnect`, `ethers5Adapter`).
2. `walletSigner` + `getWalletKind`, kèm unit test 4–7.
3. Tab Google trong modal, kèm unit test 1–3, sửa `marketplace.test.tsx`.
4. Logout, kèm test 8.
5. Typecheck, lint, test, build, e2e backend, Playwright.
6. Kiểm tay theo 6.3 trên local, rồi trên Base Sepolia.
7. Cập nhật US-101 (bỏ ẩn tab, bỏ xoá biến), chuyển US-106 sang Done.

## 8. Xong khi

- Mọi mục 6.1 và 6.2 qua. Checklist 6.3 tick hết, trừ Safari/mobile nếu không có máy (ghi rõ trong PR).
- PR mô tả cách cấu hình thirdweb dashboard và env.
