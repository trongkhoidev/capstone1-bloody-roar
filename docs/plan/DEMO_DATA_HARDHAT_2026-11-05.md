# Báo Cáo Nạp Demo Data Hardhat (Local Node) — 2026-11-05

> [!WARNING]
> **Cảnh báo quan trọng**: Toàn bộ dữ liệu giao dịch on-chain chỉ tồn tại trên Hardhat node cục bộ (`http://127.0.0.1:8545`, Chain ID `31337`). Nếu tắt hoặc restart Hardhat node, trạng thái trên chain sẽ bị mất và không khớp với database Supabase. Trong trường hợp cần tạo lại trạng thái on-chain, chạy lại các Wave W5–W9 qua `scripts/demo/populate.ts`.

---

## 1. Thông Tin Triển Khai On-chain

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| **Mạng** | Hardhat Local Node | RPC: `http://127.0.0.1:8545`, Chain ID: `31337` |
| **BloodyRoarEscrow** | `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0` | Triển khai tại block **13** |
| **MockUSDC** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | 6 decimals, cấp sẵn 50,000 mUSDC/client |
| **Admin Safe / Platform** | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Hardhat #2 (`ADMIN_WALLETS`) |
| **Contract Arbiter Safe** | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Hardhat #5 (arbiter ký phán quyết on-chain) |
| **Contract Owner** | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Hardhat #1 |
| **Fee Recipient** | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Hardhat #3 |

---

## 2. Bảng Số Lượng Dòng Database (Trước / Sau)

Toàn bộ dữ liệu được nạp vào cơ sở dữ liệu dùng chung (Supabase PostgreSQL qua cổng transaction pooler `6543`), giữ nguyên dữ liệu đã có từ trước (lựa chọn mục §3):

| Bảng Database | Trước nạp | Sau nạp | Tăng trưởng | Mục tiêu §5 | Đánh giá |
|---|:---:|:---:|:---:|:---:|:---:|
| `users` | 48 | **94** | +46 | ≥ 46 | **PASS** |
| `issues` | 155 | **357** | +202 | ≥ 200 | **PASS** |
| `applications` | 385 | **996** | +611 | ≥ 600 | **PASS** |
| `issue_comments` | 500 | **1300** | +800 | ≥ 800 | **PASS** |
| `messages` | 461 | **1114** | +653 | 50 phòng | **PASS** |
| `submissions` | 28 | **80** | +52 | ≥ 40 | **PASS** |
| `escrow_projections` | 35 | **87** | +52 | ≥ 50 on-chain | **PASS** |
| `disputes` | 7 | **17** | +10 | ≥ 10 | **PASS** |
| `reviews` | 14 | **48** | +34 | ≥ 34 | **PASS** |
| `notifications` | 1219 | **2549** | +1330 | Tự sinh từ hệ thống | **PASS** |
| `attachments` | 0 | **186** | +186 | Avatar + Deliverables | **PASS** |

---

## 3. Phân Bố Trạng Thái Bài Toán (Issue Status Distribution)

Phân bố chi tiết của **200 bài toán Hardhat mới** tạo:

| Trạng thái bài toán | Số lượng thực tế | Mục tiêu §5 | Ghi chú quy trình |
|---|:---:|:---:|---|
| `OPEN` | **143** | ~140 | Có test criteria được duyệt, comment phân luồng và đơn ứng tuyển |
| `AWAITING_FUNDING` | **5** | 5 | Đã gọi `selectDeveloper`, client chưa nạp escrow |
| `IN_PROGRESS` | **7** | ~7 | Đã ký quỹ on-chain thành công, developer đang thực hiện |
| `COMPLETED` | **38** | 34 | Gồm 25 release, 6 settlement, 3 finalized ruling, 2 missed-delivery refund, 2 review-timeout |
| `DISPUTED` | **7** | 7 | Gồm 4 open dispute và 3 initial ruling đang chờ thử thách |
| **Tổng cộng bài Hardhat** | **200** | **200** | Đủ 9 danh mục phân bố đồng đều |

---

## 4. Phân Bố Trạng Thái Escrow On-Chain (`BloodyRoarEscrow`)

Kết quả đồng bộ giữa smart contract `0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0` và bảng `escrow_projections`:

- `RESOLVED (RELEASE)`: **25** escrows (giải ngân trực tiếp, client duyệt hoặc developer claim)
- `RESOLVED (SETTLEMENT)`: **6** escrows (thoả thuận phân chia ngân sách được developer chấp thuận)
- `DISPUTED (NONE)`: **4** escrows (khiếu nại đang mở, chưa có initial ruling)
- `INITIAL_RULING (NONE)`: **3** escrows (trọng tài đưa ra phán quyết sơ bộ)
- `RESOLVED (RULING)`: **3** escrows (phán quyết chung cuộc sau khi hết hạn challenge)
- `RESOLVED (MISSED_DELIVERY_REFUND)`: **2** escrows (hoàn tiền client do quá hạn bàn giao)
- `RESOLVED (REVIEW_TIMEOUT)`: **2** escrows (tự động giải ngân do client quá hạn nghiệm thu)
- `FUNDED (NONE)`: **7** escrows (đang trong quá trình bàn giao hoặc sửa đổi)
- **Tổng số escrow trên contract mới**: **52**

---

## 5. Danh Sách Tài Khoản Demo (Hardhat Accounts)

> [!NOTE]
> Để đăng nhập các ví này vào MetaMask:
> 1. Dùng Seed Phrase (Mnemonic) mặc định của Hardhat: `test test test test test test test test test test test junk`
> 2. Thêm mạng RPC: `http://127.0.0.1:8545`, Chain ID `31337`, Currency `ETH`.
> 3. Chọn chức năng "Add Account" trong MetaMask để lấy lần lượt các ví theo đúng số thứ tự `Index` dưới đây:

| Index | Địa chỉ ví | Tên người dùng | Vai trò | Số bài đăng | Số đơn nộp |
|:---:|---|---|:---:|:---:|:---:|
| 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Platform Admin | ADMIN | 0 | 0 |
| 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | Trần Hải Đăng | CLIENT | 5 | 22 |
| 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | Sarah Jenkins (Arbiter) | CLIENT | 5 | 10 |
| 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` | Nguyễn Nhật Nam | CLIENT | 5 | 9 |
| 7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | Marcus Thorne | CLIENT | 5 | 11 |
| 8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` | Lê Hoàng Yến | CLIENT | 5 | 15 |
| 9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | Aiden Gallagher | CLIENT | 5 | 16 |
| 10 | `0xBcd4042DE499D14e55001CcbB24a551F3b954096` | Phạm Minh Khôi | CLIENT | 5 | 16 |
| 11 | `0x71bE63f3384f5fb98995898A86B02Fb2426c5788` | Chloe Zhao | CLIENT | 5 | 16 |
| 12 | `0xFABB0ac9d68B0B445fB7357272Ff202C5651694a` | Đỗ Quốc Bảo | CLIENT | 5 | 16 |
| 13 | `0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec` | Liam O'Connor | CLIENT | 5 | 16 |
| 14 | `0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097` | Vũ Thuỳ Dương | CLIENT | 5 | 16 |
| 15 | `0xcd3B766CCDd6AE721141F452C550Ca635964ce71` | Elena Vasquez | CLIENT | 5 | 16 |
| 16 | `0x2546BcD3c84621e976D8185a91A922aE77ECEc30` | Hoàng Gia Bách | CLIENT | 5 | 15 |
| 17 | `0xbDA5747bFD65F08deb54cb465eB87D40e51B197E` | Julian Sterling | CLIENT | 5 | 14 |
| 18 | `0xdD2FD4581271e230360230F9337D5c0430Bf44C0` | Bùi Phương Linh | CLIENT | 5 | 13 |
| 19 | `0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199` | Naoki Tanaka | CLIENT | 5 | 13 |
| 20 | `0x09DB0a93B389bEF724429898f539AEB7ac2Dd55f` | Đặng Tuấn Anh | CLIENT | 5 | 13 |
| 21 | `0x02484cb50AAC86Eae85610D6f4Bf026f30f6627D` | Maya Lin | CLIENT | 5 | 13 |
| 22 | `0x08135Da0A343E492FA2d4282F2AE34c6c5CC1BbE` | Lý Trường Giang | CLIENT | 5 | 13 |
| 23 | `0x5E661B79FE2D3F6cE70F5AAC07d8Cd9abb2743F1` | Oscar Lindqvist | CLIENT | 5 | 13 |
| 24 | `0x61097BA76cD906d2ba4FD106E757f7Eb455fc295` | Trịnh Kim Ngân | CLIENT | 4 | 12 |
| 25 | `0xDf37F81dAAD2b0327A0A50003740e1C935C70913` | Siddharth Mehta | CLIENT | 4 | 13 |
| 26 | `0x553BC17A05702530097c3677091C5BB47a3a7931` | Vương Đình Trọng | CLIENT | 4 | 12 |
| 27 | `0x87BdCE72c06C21cd96219BD8521bDF1F42C78b5e` | Phan Quốc Huy | DEVELOPER | 4 | 13 |
| 28 | `0x40Fc963A729c542424cD800349a7E4Ecc4896624` | Viktor Novak | DEVELOPER | 4 | 12 |
| 29 | `0x9DCCe783B6464611f38631e6C851bf441907c710` | Đoàn Minh Trí | DEVELOPER | 4 | 13 |
| 30 | `0x1BcB8e569EedAb4668e55145Cfeaf190902d3CF2` | Hannah Schmidt | DEVELOPER | 4 | 12 |
| 31 | `0x8263Fce86B1b78F95Ab4dae11907d8AF88f841e7` | Ngô Đức Thịnh | DEVELOPER | 4 | 13 |
| 32 | `0xcF2d5b3cBb4D7bF04e3F7bFa8e27081B52191f91` | Mateo Rossi | DEVELOPER | 4 | 12 |
| 33 | `0x86c53Eb85D0B7548fea5C4B4F82b4205C8f6Ac18` | Lâm Tuấn Kiệt | DEVELOPER | 4 | 13 |
| 34 | `0x1aac82773CB722166D7dA0d5b0FA35B0307dD99D` | Freja Nielsen | DEVELOPER | 4 | 12 |
| 35 | `0x2f4f06d218E426344CFE1A83D53dAd806994D325` | Tạ Hoàng Long | DEVELOPER | 4 | 13 |
| 36 | `0x1003ff39d25F2Ab16dBCc18EcE05a9B6154f65F4` | Kenji Fujimoto | DEVELOPER | 4 | 12 |
| 37 | `0x9eAF5590f2c84912A08de97FA28d0529361Deb9E` | Trương Vĩnh Phúc | DEVELOPER | 4 | 13 |
| 38 | `0x11e8F3eA3C6FcF12EcfF2722d75CEFC539c51a1C` | Devon Castillo | DEVELOPER | 4 | 12 |
| 39 | `0x7D86687F980A56b832e9378952B738b614A99dc6` | Hồ Thanh Bình | DEVELOPER | 4 | 13 |
| 40 | `0x9eF6c02FB2ECc446146E05F1fF687a788a8BF76d` | Priya Patel | DEVELOPER | 4 | 12 |
| 41 | `0x08A2DE6F3528319123b25935C92888B16db8913E` | Nguyễn Quang Sáng | DEVELOPER | 4 | 13 |
| 42 | `0xe141C82D99D85098e03E1a1cC1CdE676556fDdE0` | Gabriel Santos | DEVELOPER | 4 | 12 |
| 43 | `0x4b23D303D9e3719D6CDf8d172Ea030F80509ea15` | Dương Văn Thắng | DEVELOPER | 4 | 13 |
| 44 | `0xC004e69C5C04A223463Ff32042dd36DabF63A25a` | Lucas Meyer | DEVELOPER | 4 | 12 |
| 45 | `0x5eb15C0992734B5e77c888D713b4FC67b3D679A2` | Châu Quốc Dũng | DEVELOPER | 4 | 13 |
| 46 | `0x7Ebb637fd68c523613bE51aad27C35C4DB199B9c` | Zainab Al-Fassi | DEVELOPER | 4 | 12 |
| 47 | `0x3c3E2E178C69D4baD964568415a0f0c84fd6320A` | Lê Trọng Nghĩa | DEVELOPER | 4 | 13 |
| 48 | `0x35304262b9E87C00c430149f28dD154995d01207` | Dmitri Volkov | DEVELOPER | 4 | 12 |
| 49 | `0xD4A1E660C916855229e1712090CcfD8a424A2E33` | Hoàng Đức Nam (Spammer) | DEVELOPER | 2 | 13 |

*(Lưu ý: Ví #49 đã bị Admin cấm và 2 bài đăng quảng cáo đã bị ẩn khỏi hệ thống).*

---

## 6. Các Lỗi Gặp Phải và Cách Xử Lý

1. **Giới hạn kết nối Supabase Pooler (`EMAXCONNSESSION`)**:
   - *Triệu chứng*: Khi chạy `verify.ts` song song với Web và Worker, Supabase báo lỗi `EMAXCONNSESSION: max clients reached in session mode - pool_size: 15` trên cổng 5432.
   - *Xử lý*: Chuyển kết nối của `verify.ts` sang cổng transaction pooler `6543` kèm query parameter `pgbouncer=true`.
2. **Khác biệt Arbiter Safe vs Platform Admin**:
   - *Triệu chứng*: Khi thực hiện `postInitialRuling` và `postFinalRuling`, contract revert lỗi `NotAuthorized` với địa chỉ Admin #2 (`0x3C44...93BC`).
   - *Nguyên nhân*: Hợp đồng `BloodyRoarEscrow` được deploy với tham số `arbiterSafe` trỏ đến Signer #5 (`0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc`), trong khi quyền admin nền tảng trong `ADMIN_WALLETS` là Signer #2.
   - *Xử lý*: GraphQL mutation `draftRuling` được ký bởi Admin #2; giao dịch on-chain `postInitialRuling` và `postFinalRuling` được ký bởi Signer #5.
3. **Quyền chấp thuận đề xuất Settlement**:
   - *Triệu chứng*: `prepareAcceptSettlement` bị từ chối quyền.
   - *Nguyên nhân*: API yêu cầu bên chấp thuận phải là developer được chỉ định trong escrow (không phải client đưa ra đề xuất).
   - *Xử lý*: Truy vấn chính xác địa chỉ `developer` từ `escrow_projections` để đăng nhập đúng session thực hiện giao dịch.
4. **Quy trình nghiệm thu quá hạn (Review-Timeout Claim)**:
   - *Triệu chứng*: Gọi `prepareClaimReviewTimeout` báo lỗi `INVALID_STATE`.
   - *Nguyên nhân*: Cần có đợt nộp bài trước `deliveryDeadline`, sau đó thời gian EVM phải vượt qua `deliveryDeadline + 7 days` (thời hạn review).
   - *Xử lý*: Đẩy tiến trình bàn giao trước thời hạn, sau đó mới tua thời gian EVM và để developer gọi claim.
5. **Định dạng tải lên PNG (`/api/uploads`)**:
   - *Triệu chứng*: API trả về `400 Bad Request - Missing field`.
   - *Xử lý*: Điều chỉnh schema body của client gửi `{ fileName, fileType, fileSize, purpose }` kèm cookie xác thực thay vì các trường định danh cũ.

---

## 7. Kết Quả Lựa Chọn Phương Án §3

Khi đối chiếu giữa cơ sở dữ liệu dùng chung (Supabase) và local Hardhat chain:
- **Người dùng đã chọn**: **(a) Giữ nguyên dữ liệu cũ, chỉ nạp thêm bài và tài khoản mới cho chế độ Hardhat**.
- **Kết quả thực hiện**: Toàn bộ dữ liệu trước đó (bao gồm các bản ghi mạng Sepolia) được bảo toàn nguyên vẹn. 200 bài toán mới, 46 tài khoản mới cùng các phiên ký quỹ Hardhat được nạp bổ sung độc lập và đồng bộ chính xác.
