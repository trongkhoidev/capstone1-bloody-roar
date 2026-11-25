# Prompt cho Codex: US-106 đăng nhập Google qua thirdweb

Dán nguyên khối dưới đây vào Codex, chạy ở root repo `capstone1`.

---

Bạn làm ticket Jira US-106: "[FE] Đăng nhập Google qua thirdweb in-app wallet". Repo là monorepo Bun (luôn dùng `bun`, không dùng npm/pnpm). Đọc `AGENTS.md` trước, sau đó đọc kỹ plan `docs/plan/THIRDWEB_GOOGLE_LOGIN_PLAN_2026-11-23.md`. Plan là spec, làm đúng theo đó. Chỗ nào plan ghi "Codex kiểm" thì kiểm bằng type/code thật của gói đã cài, không đoán.

## Mục tiêu
Tab "Google · coming soon" trong `apps/web/src/components/auth/connect-modal.tsx` thành đăng nhập Google thật qua thirdweb SDK v5 in-app wallet (ví EOA). Người dùng Google phải đăng nhập (SIWE), ký giao dịch escrow và ký EIP-712 funding intent được như người dùng MetaMask.

## Ràng buộc cứng
1. **Chỉ EOA.** Không bật smart account / sponsored gas / account abstraction. Ghi comment một dòng lý do: chữ ký ERC-1271 làm hỏng SIWE và đổi msg.sender.
2. **Không sửa server auth:** `app/api/auth/nonce`, `app/api/auth/login`, `lib/auth.ts`, `lib/auth/siwe.ts` giữ nguyên. **Không migration DB.**
3. `thirdweb` chỉ được import trong một file mới `apps/web/src/lib/web3/in-app.ts`. Mọi chỗ khác dùng `import()` động tới file này để route không đăng nhập không phải tải thirdweb.
4. Chain lấy từ `ACTIVE_CHAIN` trong `lib/web3/client.ts` (`defineChain({ id, rpc })`) để chạy được cả Hardhat 31337 lẫn Base Sepolia 84532.
5. Luồng ví injected (MetaMask/Coinbase/Rabby) không đổi hành vi. Test cũ và e2e cũ phải qua.
6. Mọi chuỗi hiển thị cho người dùng viết tiếng Anh.
7. Diff ngắn nhất làm đúng. Không thêm abstraction, option hay tính năng ngoài plan (không GitHub/email social, không gộp tài khoản, không lưu email).
8. Không in hoặc commit secret. `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` đọc từ env. Thiếu biến này thì nút Google bị disable kèm thông báo, không crash.

## Việc cần làm (theo thứ tự)
1. `bun add thirdweb --cwd apps/web` (v5). Đọc type trong `node_modules/thirdweb` để chốt API: `createThirdwebClient`, `defineChain`, `inAppWallet` (`connect` với `strategy: "google"`, `autoConnect`, `disconnect`), `ethers5Adapter.signer.toEthers`, `account.signMessage`.
2. Viết `lib/web3/in-app.ts` gồm `isInAppConfigured`, `connectGoogle`, `restoreInAppAccount` (lỗi thì trả null), `inAppEthersSigner`, `disconnectInApp`. Client và wallet là singleton lazy.
3. Trong `lib/web3/client.ts` thêm `getWalletKind()` / `setWalletKind(kind | null)` dùng `localStorage["bloody-roar-wallet-kind"]` (`"in-app" | "injected"`), bọc try/catch. Xoá `github` và `email` khỏi `SOCIAL_OPTIONS`; nếu không còn ai dùng `SOCIAL_OPTIONS` thì xoá hẳn.
4. `lib/web3/send-prepared.ts` → `walletSigner(expected)`:
   - kind `"in-app"`: `restoreInAppAccount()`. Null thì ném "Your Google wallet session expired. Sign out and sign in with Google again.". Địa chỉ lệch `expected` thì ném lỗi cùng kiểu với nhánh injected. Đúng thì trả signer từ `inAppEthersSigner`. Không gọi `ensureActiveChain` và không đụng `window.ethereum`.
   - nhánh còn lại giữ nguyên code hiện tại.
   - Sửa kiểu trả về để cả `sendPreparedCalls` (gọi `sendTransaction` rồi `.wait(1)`) và `funding-intent.ts` (gọi `_signTypedData`) đều typecheck và **chạy đúng** với signer adapter. Kiểm adapter có `_signTypedData` và `.wait()` không. Thiếu `.wait()` thì dùng `signer.provider.waitForTransaction(hash, 1)` cho cả hai nhánh. Thiếu `_signTypedData` thì ở nhánh in-app ký bằng `account.signTypedData`.
   - Nếu lỗi giao dịch là thiếu tiền (insufficient funds) thì đổi thành câu dễ hiểu kèm tên chain.
5. `connect-modal.tsx`:
   - Tab label "Google". Nội dung tab: nút "Continue with Google" (`data-testid="social-btn-google"`) và một dòng giải thích cần test ETH trên `ACTIVE_CHAIN.name` để trả gas.
   - Khi `activeTab === "social"` thì preload `import("@/lib/web3/in-app")`, để lúc click `connectGoogle()` chạy ngay trong click handler và popup không bị chặn.
   - Click: `connectGoogle()` → `loginWithSignature(account.address, (m) => account.signMessage({ message: m }))` → thành công thì `setWalletKind("in-app")`, đóng modal, `router.replace` + `router.refresh()` giống luồng ví.
   - Luồng ví injected thành công thì `setWalletKind("injected")`.
   - Lỗi: popup đóng/huỷ → "Google sign-in was cancelled."; popup bị chặn → "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again."; còn lại → "Google sign-in failed. Please try again.". Dùng `setStatus("error", msg)` như luồng hiện có.
   - Tiêu đề và mô tả modal khi đang xử lý ở luồng Google ghi "Signing in with Google…", không ghi "Connecting to wallet...".
   - Giữ nguyên accessibility đang có (role tab, aria-selected, Escape).
6. `lib/store/use-auth-store.ts` `logout()`: nếu kind là `"in-app"` thì import động `in-app.ts`, gọi `disconnectInApp()` và nuốt lỗi; sau đó `setWalletKind(null)`.
7. `.env.example`: thêm comment cạnh `THIRDWEB_CLIENT_ID` là biến này cần cho Google login (client ID public, allowlist domain trong thirdweb dashboard). Không xoá các biến THIRDWEB.

## Test bắt buộc (vitest, mock `@/lib/web3/in-app`, không gọi thirdweb thật)
- Modal: Google thành công; huỷ popup; chưa cấu hình (nút disable).
- `walletSigner`: nhánh in-app trả signer adapter và không đụng `window.ethereum`; địa chỉ lệch → lỗi; phiên hết → lỗi; nhánh injected không đổi.
- `logout` gọi `disconnectInApp` và xoá kind.
- Sửa `apps/web/src/test/marketplace.test.tsx:151` (đang khẳng định `social-btn-google` không tồn tại) theo hành vi mới.
- Kiểm xem đã có test server nào chứng minh SIWE với một EOA ngẫu nhiên (`ethers.Wallet.createRandom()`) qua được `/api/auth/login` chưa. Chưa có thì thêm một test nhỏ.

## Cổng kiểm trước khi báo xong
Chạy và dán kết quả thật (pass hoặc fail):
```
bun run typecheck
bun run lint
bun run --cwd apps/web test
bun run build
bun run test:e2e:backend
```
Nếu môi trường có Hardhat và Playwright thì chạy thêm Playwright `apps/web/ui-e2e` để chứng minh luồng ví injected không hỏng. Không chạy được thì ghi lý do. Kiểm output build: chunk chứa `thirdweb` chỉ là chunk lazy, không nằm trong bundle chung của layout.

## Báo cáo cuối
- Danh sách file đã đổi, mỗi file một dòng nói đổi gì.
- API thirdweb thực tế đã dùng và kết luận về `_signTypedData` / `.wait()` của adapter.
- Chỗ nào lệch plan và lý do.
- Việc còn lại phải kiểm tay (checklist mục 6.3 của plan): đăng nhập Google thật, reload, logout rồi login lại ra cùng địa chỉ, toàn luồng escrow bằng tài khoản Google, popup bị chặn, Safari/mobile. Codex không tự động được Google OAuth nên ghi rõ những mục này chưa kiểm.

Không commit, không push. Để thay đổi ở working tree cho người review.
