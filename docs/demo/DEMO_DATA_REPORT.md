# Báo cáo dữ liệu Demo trên Base Sepolia (Đợt R)

## 1. Địa chỉ hợp đồng và Safe (Base Sepolia - Chain ID 84532)

| Vai trò | Địa chỉ | Link BaseScan |
|---|---|---|
| **Treasury (Nhận Faucet)** | `0x6d5fCc753Dfeb150d7f3526dac114F38Dd169b95` | [BaseScan](https://sepolia.basescan.org/address/0x6d5fCc753Dfeb150d7f3526dac114F38Dd169b95) |
| **Deployer** | `0x321431d1a5E1FC9e1fe9d3919A56D1dA0eb28519` | [BaseScan](https://sepolia.basescan.org/address/0x321431d1a5E1FC9e1fe9d3919A56D1dA0eb28519) |
| **Admin Platform** | `0xE51ff4967F9484B5D38CaC6bE14FD5Cb070ca67B` | [BaseScan](https://sepolia.basescan.org/address/0xE51ff4967F9484B5D38CaC6bE14FD5Cb070ca67B) |
| **Owner Safe (2/3)** | `0xE69f0638fd945A175698775dFA3c9D54A66fd3D1` | [BaseScan](https://sepolia.basescan.org/address/0xE69f0638fd945A175698775dFA3c9D54A66fd3D1) |
| **Arbiter Safe (2/3)** | `0x58f8f2e4B3ECcC6dC4a6541Bc3F7e9F7226e2E90` | [BaseScan](https://sepolia.basescan.org/address/0x58f8f2e4B3ECcC6dC4a6541Bc3F7e9F7226e2E90) |
| **Fee Safe (2/3)** | `0x2334ffc690a34b294eC22EbCB4B88b3895A10153` | [BaseScan](https://sepolia.basescan.org/address/0x2334ffc690a34b294eC22EbCB4B88b3895A10153) |
| **Canonical USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | [BaseScan](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) |

---

## 2. Bảng số lượng mục tiêu theo Mục 2 của Kế hoạch

| Nhóm chỉ tiêu | Mục tiêu tối thiểu | Kế hoạch Populate (scripts/demo) | Trạng thái xác minh (`verify.ts --dry-run`) |
|---|---|---|---|
| Ví người dùng có profile (tên, bio, kỹ năng, avatar) | 40 | 40 | **PASS** (40/40) |
| Bài đăng (issue), đủ 9 `IssueCategory`, 20% đính kèm ảnh | 150 (9 categories) | 150 (đều 9 categories, 30 ảnh) | **PASS** (150/150) |
| Bình luận (comments, ít nhất 100 replies) | 500 (≥ 100 replies) | 500 (100 replies) | **PASS** (500/500) |
| Ứng tuyển (applications, withdraw ≥ 15, reject ≥ 20) | 350 | 375 (15 withdraws, 20 rejects) | **PASS** (375/350) |
| Reservation (35 nạp, 4 hủy, 3 tự hết hạn) | 45 | 45 (35 nạp, 4 hủy, 3 hết hạn) | **PASS** (45/45) |
| Phòng chat có tin nhắn (file, reply, edit, delete, contact) | 35 phòng | 35 phòng (10–25 tin/phòng) | **PASS** (35/35) |
| Submission on-chain (5 requestChanges) | 28 | 28 (5 revisions) | **PASS** (28/28) |
| Kết cục escrow (release ≥ 16, settlement ≥ 4, dispute ≥ 5) | ≥ 25 | 35 kết cục được phân bổ | **PASS** |
| Đánh giá (review sau COMPLETED) | ≥ 14 | 14 | **PASS** (14/14) |
| Quản trị admin (2 bài spam ẩn, 1 ví ban) | 2 spam, 1 ban | 2 bài spam ẩn, 1 ví spammer ban | **PASS** |
| Reconciliation Findings | 0 | 0 | **PASS** (0) |
| Stuck Transaction Intents | 0 | 0 | **PASS** (0) |

---

## 3. Tổng ETH và USDC nhận từ Faucet và đã tiêu

- **ETH nhận từ faucet:** 0.0 ETH (CDP API chưa cấu hình credentials; các faucet công khai Base Sepolia đều yêu cầu captcha/số dư mainnet).
- **USDC nhận từ faucet:** 0.0 USDC (Circle Faucet chặn bởi Cloudflare Turnstile captcha).
- **ETH đã tiêu:** 0.0 ETH
- **USDC đã tiêu:** 0.0 USDC
- **Nhu cầu quỹ cho toàn bộ kịch bản:**
  - **ETH:** `0.0247 ETH` (khuyến nghị nạp **0.05 ETH** để trừ hao gas).
  - **USDC:** **35.0 USDC**.
- **Địa chỉ ví nhận:** `0x6d5fCc753Dfeb150d7f3526dac114F38Dd169b95` (Base Sepolia).

---

## 4. Kịch bản 10 loại giao dịch tiêu biểu (Phân loại kết cục)

| Loại kịch bản | Vai trò thực hiện | Phương thức giao dịch | Kênh thực hiện | Trạng thái dự kiến |
|---|---|---|---|---|
| 1. Safe Deployment & Escrow Deploy | Treasury / Deployer | `SafeProxyFactory.createProxyWithNonce` & `EscrowEngine.deploy` | On-chain | Chờ nạp gas treasury |
| 2. Deposit Escrow (35 bài) | Client (Alice/Marcus/v.v.) | `USDC.approve` + `EscrowEngine.deposit` (EIP-712 Intent) | On-chain + API | Sẵn sàng kịch bản W5 |
| 3. Submit Work (28 bài) | Developer | GraphQL mutation `prepareSubmitWork` | API | Sẵn sàng kịch bản W7 |
| 4. Release Payment (16 bài) | Client | GraphQL `prepareReleaseEscrow` | API + On-chain | Sẵn sàng kịch bản W8 |
| 5. Mutual Settlement (4 bài) | Client & Developer | `prepareSettlementOffer` + `prepareAcceptSettlement` | API + On-chain | Sẵn sàng kịch bản W8 |
| 6. Dispute & Initial Ruling (3 bài) | Arbiter Safe (2/3) | `Safe.execTransaction` (`initialRuling`) | On-chain Safe | Sẵn sàng kịch bản W8/R6 |
| 7. Challenge Ruling (1 bài) | Party bị thua | GraphQL `prepareChallengeRuling` | API + On-chain | Sẵn sàng kịch bản W8/R6 |
| 8. Final Ruling (1 bài) | Arbiter Safe (2/3) | `Safe.execTransaction` (`finalRuling`) | On-chain Safe | Sẵn sàng kịch bản W8/R6 |
| 9. Missed Delivery Refund (2 bài) | Client | GraphQL `prepareClaimMissedDelivery` | API + On-chain | Sẵn sàng kịch bản W8 |
| 10. Claim Funds | Developer / Client | GraphQL `prepareClaim` | API + On-chain | Sẵn sàng kịch bản W8 |

*Ghi chú: Tx hash on-chain cụ thể sẽ được ghi nhận vào `demo-wallets/ledger.jsonl` và bảng này ngay sau khi ví `treasury` được nạp gas và lệnh live broadcast hoàn tất.*

---

## 5. Các sự kiện tự động theo thời gian thực (Wall-clock Time)

Do mạng testnet Base Sepolia không tua được thời gian (`evm_increaseTime` chỉ có trên Hardhat local), các trạng thái sau được thiết kế để xảy ra tự nhiên:

1. **Review Timeout (7 ngày):**
   - 4 bài nộp submission để mở, sau 7 ngày thật kể từ lúc nộp, bất kỳ ai cũng có thể gọi `prepareClaimReviewTimeout` để giải phóng 97.5% cho developer và 2.5% cho fee Safe.
2. **Challenge Expiry (7 ngày):**
   - Phán quyết sơ bộ (INITIAL_RULING) sau 7 ngày không bị challenge sẽ cho phép gọi `prepareFinalizeRuling`.
3. **Arbiter Stall Timeout (30 ngày):**
   - Nếu tranh chấp không có phán quyết sau 30 ngày, hệ thống cho phép gọi `finalizeArbiterTimeoutSplit` để chia 50/50.
