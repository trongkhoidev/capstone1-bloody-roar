# Prompt cho AGY: nạp dữ liệu demo bằng account test của Hardhat

Ngày: 2026-11-05. Đọc hết rồi mới làm. Làm theo thứ tự các bước.

Mục tiêu: dùng các account mặc định của Hardhat (có sẵn 10.000 ETH thật trên chain local) để tạo thật nhiều dữ liệu qua API thật: bài, bình luận, đơn ứng tuyển, phòng chat, bài nộp, escrow, settlement, tranh chấp, đánh giá, thông báo. Mọi thứ phải vào DB Supabase dùng chung để cả team mở app là thấy. Tiền on-chain phải là ETH/mUSDC thật trên Hardhat, không giả lập.

---

## 0. Điều kiện trước khi bắt đầu

1. Người dùng đã chạy `bash scripts/demo/local-up.sh`. Kiểm lại cả 3 lệnh sau phải thành công:
   ```bash
   curl -s -X POST 127.0.0.1:8545 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}'   # 0x7a69
   curl -sf localhost:4000/api/health
   lsof -ti tcp:4300 -sTCP:LISTEN    # worker
   ```
   Nếu một trong ba lệnh fail thì dừng và báo lại, không tự dựng môi trường khác.
2. Địa chỉ escrow **mới** nằm ở `apps/contracts/deployments/localhost.json` và `.env` (`ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK`). Lấy từ đó, **không** dùng `0xB7f8…4F5e` của lần trước.
3. MockUSDC vẫn ở `0x5FbDB2315678afecb367f032d93F642f64180aa3` (nonce 0 của Hardhat #0), có `mint(address,uint256)` mà ai gọi cũng được.
4. Đã có sẵn bộ công cụ, **dùng lại, không viết mới**:
   - `scripts/demo/populate.ts` gồm 9 wave W1–W9 (profile → bài → bình luận → ứng tuyển → funding → chat → nộp bài → release/settlement/dispute → review/ban)
   - `scripts/demo/wallets.ts`, `fund.ts`, `verify.ts`
   - `scripts/demo/lib/` (`gql.ts`, `session.ts`, `socket.ts`, `chain.ts`, `state.ts`)
   - `scripts/demo/content/*.json`
   - Báo cáo lần trước, gồm các lỗi đã gặp và cách vượt qua: `docs/plan/DEMO_DATA_2026-11-04.md` §3. Đọc kỹ trước khi chạy.
5. Quyết định đã chốt: client và dev **cùng quyền**. Account nào cũng vừa đăng bài vừa ứng tuyển được, miễn không tự apply vào bài của chính mình. Nhãn `CLIENT`/`DEVELOPER` chỉ để hiển thị.

## 1. Luật an toàn (bắt buộc)

1. **DB dùng chung cho cả team.** Cấm `migrate reset`, `migrate dev`, `db push`, `TRUNCATE`, `DELETE`, `deleteMany`, và mọi script seed có bước dọn dữ liệu.
2. Dữ liệu chỉ được tạo qua API thật: GraphQL `/api/graphql`, upload `/api/uploads`, Socket.IO cho chat, ký giao dịch on-chain bằng ethers. **Không** insert thẳng bằng Prisma hay SQL. Ngoại lệ duy nhất là thao tác chain local: `hardhat_setBalance`, `evm_increaseTime`, `evm_mine`.
3. Không in private key ra log hay báo cáo. Key Hardhat tuy công khai nhưng vẫn chỉ lưu trong `demo-wallets/` (đã gitignore).
4. Supabase pooler chỉ cho 15 connection. Chạy tuần tự (`await` từng bước), không dùng `Promise.all` cho query DB. Giữ `INDEXER_RANGE_SIZE=5`.
5. Chạy lại không được nhân đôi dữ liệu. Dùng `lib/state.ts` để ghi lại bước đã xong, với file state riêng (xem §2).
6. Không commit `demo-wallets/`, không commit `.env`.

## 2. Bước 1: account từ Hardhat

Hardhat dùng mnemonic công khai `test test test test test test test test test test test junk`, path `m/44'/60'/0'/0/i`. `wallets.ts` đã làm đúng như vậy cho admin (khoảng dòng 53–80). Mở rộng theo đúng kiểu đó, với một cờ mới `DEMO_ACCOUNTS=hardhat`:

| Index | Vai trò | Ghi chú |
|---|---|---|
| #0 | deployer | Đã deploy MockUSDC + escrow. Không dùng làm user |
| #1 | owner (on-chain) | Không dùng làm user |
| #2 | admin + arbiter | Có trong `ADMIN_WALLETS`. Ra ruling, kiểm duyệt |
| #3 | fee recipient | Chỉ để claim phí |
| #4–#19 | **16 user chính** `hh04`…`hh19` | Có sẵn 10.000 ETH, import được vào MetaMask để demo trực tiếp |
| #20–#49 | 30 user phụ `hh20`…`hh49` | Cùng mnemonic. Nạp 100 ETH bằng `hardhat_setBalance` (ETH thật trên node) |

- Ghi vào `demo-wallets/keys-hardhat.json`, kèm state riêng `demo-wallets/state-hardhat.json`. **Không ghi đè** `keys.json`/state của bộ 40 ví cũ.
- Mint mUSDC cho mọi user: 50.000 cho #4–#19, 5.000 cho #20–#49. Gọi `mint` on-chain thật, không giả số dư.
- Nhãn hiển thị: một nửa `CLIENT`, một nửa `DEVELOPER`, đặt qua `updateProfile(role)`. Nhưng phải có bài mà người mang nhãn DEVELOPER đăng, và đơn mà người mang nhãn CLIENT nộp, để chứng minh cùng quyền.
- Có 1 ví spam (#49), bị admin ban ở W9.

## 3. Bước 2: dữ liệu cũ trên DB (chỉ báo cáo, không xoá)

Chain đã reset, nên các escrow của lần nạp trước (escrow cũ `0xB7f8…4F5e`, 35 dòng `escrow_projections`, cùng các issue `IN_PROGRESS`, `DISPUTED`… gắn với chúng) không còn trên chain. Làm như sau:
1. Đếm và in ra: số `escrow_projections`, `chain_events`, `transaction_intents`, `claimable_balances` có `contractAddress` = escrow cũ, và số issue đang ở trạng thái cần chain (`AWAITING_FUNDING`, `IN_PROGRESS`, `DISPUTED`) gắn với chúng.
2. **Dừng lại, hỏi người dùng** chọn một trong hai:
   - (a) để nguyên, dữ liệu cũ chỉ để xem
   - (b) viết script dọn, chỉ đụng các dòng có `contractAddress` = escrow cũ

   Chưa có câu trả lời thì không làm (b). Phần dữ liệu off-chain cũ (user, bài `OPEN`, bình luận) luôn giữ nguyên.

## 4. Bước 3: nội dung mới

- Viết nội dung mới vào `scripts/demo/content/hardhat/` (`issues.json`, `comments.json`, `profiles.json`, `chat.json`). Không dùng lại tiêu đề trong `content/issues.json`, để team không thấy bài trùng.
- Viết như người thật, đa dạng: tiếng Việt và tiếng Anh, có bug fix, feature, smart contract audit, frontend, devops. Bounty từ 20 đến 2.000 mUSDC. Có cả bài mô tả ngắn và bài mô tả dài kèm code block.
- Dùng `generate-content.ts` nếu nó tạo được nội dung theo cấu trúc này. Thêm tham số thư mục đích thay vì copy script.

## 5. Bước 4: chạy các wave

Sửa `populate.ts` sao cho nhận `DEMO_ACCOUNTS=hardhat` (đọc keys/state/content ở chỗ mới). Diff nhỏ nhất, giữ nguyên các wave. Chạy từng wave, mỗi wave kiểm số lượng rồi mới sang wave tiếp theo:

```bash
export BASE_URL=http://localhost:4000 CHAIN_ID=31337 DEMO_ACCOUNTS=hardhat
bun run scripts/demo/populate.ts --wave W1 --dry-run   # chạy thử trước
bun run scripts/demo/populate.ts --wave W1
# ... lần lượt W2 → W9
bun run scripts/demo/verify.ts
```

| Wave | Mục tiêu tối thiểu |
|---|---|
| W1 Profile | 46 user (#4–#49) có tên, avatar (upload thật), bio, skills, location |
| W2 Bài | 200 bài. Mỗi bài có ≥2 tiêu chí kiểm thử tạo bằng `createTestCase` và duyệt bằng `updateTestCase` (AI đang tắt) |
| W3 Bình luận | 800 bình luận, có reply lồng nhau, rải đều trên các bài `OPEN` |
| W4 Ứng tuyển | 600 đơn, đủ `PENDING`, `REJECTED`, `WITHDRAWN`, `ACCEPTED` |
| W5 Funding | 60 bài được `selectDeveloper`, trong đó 50 bài nạp escrow on-chain thật (approve + deposit), 5 bài để `AWAITING_FUNDING`, 5 bài bị huỷ reservation (`cancelReservation`) |
| W6 Phòng chat | Mỗi task đã nạp tiền có phòng chat 8–30 tin qua socket, cả hai bên cùng nhắn, có tin kèm file |
| W7 Nộp bài | 40 bài nộp on-chain (`prepareSubmitWork`), 10 bài có `requestChanges` rồi nộp lại |
| W8 Kết thúc | 25 release + claim, 6 settlement, 4 dispute đang mở, 3 dispute có initial ruling, 3 dispute đã finalize, 2 missed-delivery refund, 2 review-timeout |
| W9 Review | Review 2 chiều cho mọi task `COMPLETED`, admin ban ví spam |

- Sau mỗi giao dịch on-chain, chờ worker index xong (projection khớp) rồi mới gọi bước tiếp theo. Nếu lệch thì xem `docs/plan/DEMO_DATA_2026-11-04.md` §3.
- Tua thời gian bằng `evm_increaseTime` **chỉ** cho các bài cần timeout. Gom các bài cần tua về cuối W8 để không làm hết hạn các bài khác (lần trước bị `DEADLINE_PASSED` vì tua sớm).
- Notification phải tự sinh từ API và worker. Không tạo tay.

## 6. Kiểm tra

```bash
bun run scripts/demo/verify.ts           # projection khớp chain cho escrow mới
bun run typecheck && bun run lint
bun test scripts/demo                    # test cũ của bộ demo vẫn PASS
```

Kiểm thêm bằng CLI:
- `issues` query qua GraphQL trả đủ số bài mới.
- Lấy ngẫu nhiên 5 escrow, đọc `getEscrow(escrowId)` trên contract mới, so trạng thái và số tiền với `escrow_projections`.
- Đăng nhập bằng 1 ví #4–#19, gọi `myClaimable` và `notifications`, kết quả không rỗng.

## 7. Báo cáo

Ghi vào `docs/plan/DEMO_DATA_HARDHAT_2026-11-05.md`:
1. Cảnh báo đầu trang: on-chain chỉ có trên Hardhat của máy này. Restart node là mất: dùng database mới, xoá `demo-wallets/state-hardhat.json` rồi chạy lại W1–W9.
2. Địa chỉ escrow mới, deploy block.
3. Bảng số dòng trước/sau của các bảng: `users`, `issues`, `applications`, `issue_comments`, `messages`, `submissions`, `escrow_projections`, `disputes`, `reviews`, `notifications`, `attachments`.
4. Phân bố trạng thái issue so với mục tiêu ở §5.
5. Bảng account: index, địa chỉ, tên hiển thị, nhãn, số bài đã đăng, số đơn đã nộp. **Chỉ địa chỉ, không kèm key.** Ghi chú cách import vào MetaMask: dùng mnemonic Hardhat, chọn account index tương ứng.
6. Lỗi gặp phải và cách xử lý.
7. Kết quả câu hỏi ở §3 và người dùng đã chọn gì.

Commit phần sửa script lên nhánh `chore/demo-data-local` với message `chore(demo): hardhat account mode`. Không push.
