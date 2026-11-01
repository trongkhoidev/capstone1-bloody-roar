# Kế hoạch đợt R: chạy trên Base Sepolia và tạo dữ liệu thật

Thư mục `/Users/admin/repos/capstone1-wt/integration`, nhánh `be/integration`. Ngày lập: 31/10/2026.

Đợt M đã xong. Đợt R có hai việc: bù phần còn thiếu để app chạy được trên Base Sepolia, và tạo dữ liệu thật. Dữ liệu thật ở đây nghĩa là ví thật đăng nhập bằng SIWE, gọi đúng API mà người dùng gọi, và mọi khoản tiền đi qua contract trên chain. Không ghi thẳng dữ liệu nghiệp vụ vào DB.

**Quy tắc làm việc:** giữ nguyên mục 3 của `docs/plan/parallel/AGY_FINISH.md`, gồm 3.1 env, 3.2 gate, 3.3 được phép, 3.4 cấm, 3.5 vòng làm, 3.6 tự quyết và 3.7 khi kẹt. Mục 4 dưới đây bổ sung và nới vài điểm riêng cho đợt R. Mã mục dùng tiền tố `R`. Bảng trạng thái trong `reports/CODEX.md` có tên `R0–R9`.

---

## 1. Kết quả rà soát ngày 31/10

**Đã kiểm:**
- `be/integration` ở `b7c1a67`, working tree sạch, `bun run typecheck` exit 0.
- Có 37 mutation và 27 query, đủ luồng chọn developer, nạp tiền, giao việc, release, claim, settlement, dispute và ruling.
- Nhánh `feat/ledger-palette-copy` ở checkout chính là tổ tiên của `be/integration` và chậm hơn 262 commit.

**Chưa chạy lại:** gate đầy đủ và E2E. Kết quả gần nhất là của M6 trong `CODEX.md`.

**Phần còn thiếu để chạy trên testnet:**

| Mã | Vấn đề | Mức |
|---|---|---|
| G1 | `DEPLOYER_PRIVATE_KEY` trong `.env` là private key công khai `0x…01` (địa chỉ `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf`). ETH gửi vào ví này sẽ bị bot rút ngay. Phải tạo deployer mới. | Cao |
| G2 | Chưa có escrow trên Base Sepolia. Địa chỉ trong `ESCROW_CONTRACT_ADDRESS_SEPOLIA` không có bytecode. Muốn deploy phải qua `deployment-checks.ts`: USDC canonical `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, ba Safe v1.4.1 dạng 2-of-3 (owner, arbiter, fee), mỗi Safe một bộ owner riêng, không module, không guard, fallback handler đúng hằng số, và `ALLOW_BASE_SEPOLIA_DEPLOYMENT=true`. | Cao |
| G3 | Chưa có bộ env cho chain 84532. `.env` đang là Hardhat (`CHAIN_ID=31337`, `FINALITY=latest`). `.gitignore` chưa chặn `.env.demo` và thư mục khóa ví. | Cao |
| G4 | Harness chỉ đăng nhập được qua `personal_sign` của Hardhat, trỏ cứng cổng 4012. Chưa có helper ký bằng private key cục bộ. | Trung bình |
| G5 | Ruling trên testnet cần hai owner của arbiter Safe ký SafeTx rồi gọi `execTransaction`. Harness hiện chỉ có `arbiterPost` chạy bằng impersonation trên Hardhat. | Trung bình |
| G6 | Không tua được thời gian trên testnet. Review timeout 7 ngày, challenge 7 ngày, arbiter stall 30 ngày chỉ xảy ra khi đủ ngày thật. | Thấp (ghi nhận) |

**Không coi là thiếu:**
- Phòng chat của một bài chỉ mở cho client, developer đã chọn và admin (`canAccessIssue`). Trước khi chọn developer, hai bên trao đổi qua bình luận. Đây là thiết kế hiện tại, giữ nguyên.
- Rate limit lấy IP từ hop cuối của `x-forwarded-for`. Cách này đúng khi app chạy sau một proxy. Ghi vào phần việc của người dùng lúc deploy.

**Việc của người dùng ở checkout chính, không thuộc đợt R:** file chưa track `packages/database/src/seed-realistic.ts` ghi escrow giả và dùng `EscrowStatus`, enum đã bị xóa ở M4. File này trái với M1. Nên xóa file đó và bỏ script `db:seed:realistic` trong hai `package.json`.

---

## 2. Định nghĩa xong

Tất cả số liệu đếm bằng `scripts/demo/verify.ts` trên DB `bloody_demo`, đối chiếu với chain 84532.

| Nhóm | Tối thiểu |
|---|---|
| Ví người dùng có profile (tên, bio, kỹ năng, avatar) | 40 |
| Bài đăng (issue) | 150, đủ 9 `IssueCategory`, 20% có ảnh đính kèm |
| Bình luận | 500, trong đó ít nhất 100 là trả lời |
| Ứng tuyển | 350, có cả `withdrawApplication` và `rejectApplication` |
| Reservation | 45. Trong đó 35 nạp tiền on-chain, 4 bị hủy, 3 để tự hết hạn sau 24 giờ |
| Phòng chat có tin nhắn | 35, mỗi phòng 10–40 tin, có file, reply, sửa và xóa |
| Submission on-chain | 28, có 5 lần `requestChanges` rồi nộp lại |
| Kết cục escrow | release và claim ≥ 16; settlement ≥ 4 (1 lần revoke); dispute ≥ 5 (≥ 3 initial ruling qua Safe, ≥ 1 challenge, ≥ 1 final ruling); missed-delivery refund ≥ 2 |
| Để dở có chủ đích | ≥ 5 bài `IN_PROGRESS`, ≥ 4 bài đã nộp và đang chờ review (sẽ thành review timeout sau 7 ngày thật) |
| Review sau khi xong | ≥ 14 |
| Admin | 2 bài spam bị ẩn, 1 ví bị ban, ≥ 1 `draftRuling` cho mỗi dispute |

Điều kiện kèm theo:
- `reconciliationFindings` rỗng.
- Số dư USDC của escrow trên chain khớp `accountedBalance`.
- Mọi tx hash nằm trong `demo-wallets/ledger.jsonl`.
- Gate 3.2 (local Hardhat) vẫn exit 0.

Giữ số liệu tiền nhỏ: mỗi bounty từ 0,5 đến 5 USDC. Dùng lại tiền theo vòng: developer đã nhận tiền sẽ đăng bài và nạp tiền cho bài của mình. QĐ-21 cho phép việc này. Nhờ vậy cần ít USDC từ faucet.

---

## 3. Đặc tả từng mục

### R0. Kiểm mốc

1. `git log -1` là `b7c1a67` hoặc mới hơn.
2. `git status` chỉ có hai file plan của đợt này.
3. Commit `AGY_FINISH_R.md` và `AGY_PROMPT_R.md` với message `docs(plan): add r-series testnet data plan`.

### R1. Kho ví và gitignore

1. Thêm vào `.gitignore` ba dòng: `.env.demo`, `demo-wallets/`, `docs/demo/*.local.md`. Kiểm lại bằng `git check-ignore .env.demo demo-wallets/keys.json`. Lệnh phải in ra cả hai đường dẫn.
2. Viết `scripts/demo/wallets.ts`. Script tạo khóa bằng `ethers.Wallet.createRandom()` (ethers 5.7.2 đã có trong `apps/web`) và ghi `demo-wallets/keys.json` với quyền `0600`. Chạy lại không tạo khóa mới cho vai trò đã có.

   | Vai trò | Số ví |
   |---|---|
   | `deployer` | 1, thay cho G1 |
   | `treasury` | 1, nhận ETH và USDC từ faucet rồi chia lại |
   | `admin` | 1, ghi vào `ADMIN_WALLETS` của `.env.demo` |
   | `ownerSafe1..3`, `arbiterSafe1..3`, `feeSafe1..3` | 9, ba bộ tách rời nhau |
   | `user01..user40` | 40. Gán sẵn persona: 10 thiên về client, 22 thiên về developer, 8 làm cả hai |
   | `spammer` | 1, dùng cho kịch bản admin |
3. Ghi `docs/demo/WALLETS.md` (file được commit), chỉ gồm vai trò, địa chỉ và persona. Không có khóa.

Kiểm: một test nhỏ `scripts/demo/wallets.test.ts`. Chạy hai lần thì địa chỉ không đổi. Không có địa chỉ nào là `0x7E5F…5Bdf`. File `keys.json` có mode `600`.

Commit: `feat(r1): add demo wallet store`.

### R2. Faucet và chia tiền

Viết `scripts/demo/fund.ts`.

**Chặn sai chain:**
- Mọi lần gửi phải kiểm `provider.getNetwork().chainId === 84532`. Sai chain thì throw.
- Không ký giao dịch bằng `DEPLOYER_PRIVATE_KEY` trong `.env`.

**Thứ tự lấy ETH cho `treasury`:**
1. Đọc số dư trước. Đủ thì bỏ qua.
2. Coinbase CDP Faucet API, nếu `.env.demo` có `CDP_API_KEY_ID` và `CDP_API_KEY_SECRET`.
   - Gọi `requestFaucet` cho `base-sepolia`, token `eth`, và `usdc` cho USDC.
   - Đọc giới hạn mỗi lần nhận trong tài liệu CDP rồi ghi vào `DECISIONS.md`. Không đoán.
   - Không thêm SDK. Gọi REST bằng `fetch`, ký JWT bằng `crypto` có sẵn của Bun/Node theo tài liệu CDP.
   - Nếu không làm được bằng `fetch`, ghi "Bị chặn" và chuyển sang bước 3.
3. Faucet web không cần đăng nhập, không có captcha và không đòi số dư mainnet. Có thể dùng trình duyệt của Antigravity để nhận về `treasury`.
4. Không có nguồn nào dùng được thì dừng R2. In địa chỉ `treasury` và số ETH, USDC cần, ghi "Cần người dùng nạp" ở dòng đầu `CODEX.md`, rồi làm các mục không cần tiền (R4 phần env và DB, R5 phần off-chain).

**Thứ tự lấy USDC (canonical) cho `treasury`:** CDP Faucet API trước, sau đó trang faucet của Circle (`faucet.circle.com`, chọn Base Sepolia). Nếu trang có captcha thì dừng và để người dùng tự bấm. Ghi rõ vào báo cáo.

**Giới hạn khi dùng faucet:**
- Chỉ nhận về `treasury`.
- Không xoay vòng 40 ví người dùng để lách giới hạn theo địa chỉ.
- Không giải captcha bằng công cụ.
- Không tạo tài khoản bằng thông tin giả.
- Nếu một lần nhận không đủ thì chờ hết thời gian giới hạn rồi nhận tiếp. Làm R5 off-chain trong lúc chờ.

**Chia tiền:**
- Đo `gasPrice` và phí L1 thực tế bằng một giao dịch thử.
- Nạp thêm cho mỗi ví đến mức mục tiêu: user 0,0005 ETH, owner Safe 0,0003 ETH, deployer 0,003 ETH.
- Lúc rà soát, gas price là 0,006 gwei, nên tổng nhu cầu ước khoảng 0,03 ETH. Nếu số đo được khác nhiều, tính lại theo số đo và ghi vào báo cáo.
- USDC chỉ chia cho ví đang cần nạp bài, theo từng đợt.
- Script chạy lại an toàn: chỉ nạp phần còn thiếu.
- Mọi giao dịch ghi một dòng JSON vào `demo-wallets/ledger.jsonl` với các trường `ts, from, to, asset, amount, txHash, purpose`.

Commit: `feat(r2): fund demo wallets from faucet treasury`.

### R3. Safe và deploy escrow lên Base Sepolia

1. Viết `scripts/demo/create-safes.ts` để tạo ba Safe v1.4.1 bằng `SafeProxyFactory.createProxyWithNonce`. Dùng ethers, không thêm SDK.
   - Singleton và fallback handler lấy đúng từ `SAFE_V141_SINGLETONS` và `SAFE_COMPATIBILITY_FALLBACK_HANDLER` trong `apps/contracts/scripts/deployment-checks.ts`.
   - Địa chỉ factory lấy theo Safe deployments v1.4.1 cho chain 84532. Kiểm bytecode trước khi gọi.
   - `setup` gồm owners là ba ví của từng bộ, threshold 2, không module, không guard. `saltNonce` cố định, để chạy lại thì ra cùng địa chỉ và bỏ qua Safe đã có.
2. Deploy bằng lệnh sau, trong cùng một lệnh. `DEPLOYER_PRIVATE_KEY` được lấy từ `keys.json` qua `$(bun -e ...)`, không echo ra:

   ```
   ALLOW_BASE_SEPOLIA_DEPLOYMENT=true USDC_ADDRESS=<canonical> OWNER_SAFE=… ARBITER_SAFE=… FEE_RECIPIENT=<feeSafe> bun run --cwd apps/contracts deploy:base-sepolia
   ```

   `FEE_RECIPIENT` là Safe thứ ba, vì `assertProductionSafes` kiểm cả ba vai trò.
3. Manifest phải có `address`, `deployBlock`, `token`, các Safe và `chainId` 84532. Nếu `deploy.ts` chưa ghi `deployBlock` thì sửa, kèm test.
4. Có `BASESCAN_API_KEY` thì verify. Không có thì ghi vào phần việc của người dùng.

Kiểm:
- Gọi `token()`, `arbiterSafe()` và các getter khác, kết quả phải khớp.
- `bun run contracts:test` vẫn pass.

Commit: `feat(r3): create role safes and deploy escrow to base sepolia`. Không commit `deployments/`.

### R4. Môi trường demo

1. Tạo `.env.demo` từ `.env`, đổi các biến sau. Không in giá trị.
   - `DATABASE_URL` và `DIRECT_URL` trỏ sang DB mới `bloody_demo`, cùng server Postgres local.
   - `CHAIN_ID=84532`, `NEXT_PUBLIC_CHAIN_ID=84532`.
   - `RPC_URL=https://sepolia.base.org`. Nếu worker gặp 429 liên tục thì dừng và nhờ người dùng cấp URL Alchemy.
   - `ESCROW_ADDRESS` và `ESCROW_DEPLOY_BLOCK` lấy từ R3.
   - `FINALITY=safe`.
   - `ADMIN_WALLETS` là địa chỉ ví admin.
   - `AI_BASE_URL` trỏ mock 4019. Không gọi AI provider thật.
   - `PORT=4100`, `WORKER_PORT=4101`, `NEXT_PUBLIC_APP_URL=http://localhost:4100`.
   - `UPLOADS_DIR` là thư mục local.
2. Tạo DB `bloody_demo`, chạy `migrate deploy`, rồi `seed-prod.ts` để có dòng token USDC 84532.
3. Viết `scripts/demo/up.sh` để bật mock AI (4019), worker (4101) và web (4100) với `.env.demo`. Ghi PID vào `demo-wallets/*.pid`. Viết thêm `down.sh` chỉ dừng các PID đó.
4. Kiểm:
   - `/api/health` trả 200.
   - `indexerStatus` có checkpoint tăng dần.
   - `contractConfig` khớp chain (job L4).
   - Không có `ReconciliationFinding`.

Commit: `feat(r4): add base sepolia demo environment scripts`. Không commit `.env.demo`.

### R5. Script tạo dữ liệu

Viết `scripts/demo/populate.ts` và tách module theo đợt: `scripts/demo/lib/{session,gql,socket,chain,safe,state}.ts`.

**Ràng buộc:**
- Dữ liệu nghiệp vụ chỉ được tạo qua HTTP API và socket của app ở cổng 4100.
- Đăng nhập: gọi `/api/auth/nonce`, dựng message bằng `createLoginMessage`, ký bằng `wallet.signMessage`, rồi POST `/api/auth/login`. Copy cách làm của `tests/e2e/harness/wallet.ts`, đổi phần ký và base URL.
- Giao dịch on-chain: luôn đi theo `prepareX`. Ví ký và gửi `data` của `PreparedCall` tới `to`, rồi gọi `recordTransactionSubmitted`. Không tự encode lời gọi escrow. Nạp tiền làm đúng luồng FE-1c: ký funding intent (`submitFundingIntent`), approve, rồi deposit.
- Prisma chỉ được dùng để đọc, khi chờ projection hoặc khi verify.
- Mỗi request gửi `x-forwarded-for` riêng cho từng ví, ví dụ `10.77.<i>.1`. Lý do: 40 người dùng thật có 40 IP, còn script chạy trên một máy. Chỉ dùng với server local. Không sửa code rate limit.
- Tôn trọng giới hạn: socket 10 tin mỗi 10 giây, AI mutation theo user, GraphQL 600 mỗi phút. Thêm độ trễ ngẫu nhiên 300–1500 ms giữa các hành động.
- Lưu tiến độ vào `demo-wallets/state.json` (khóa nghiệp vụ → id). Chạy lại thì làm tiếp, không tạo trùng.
- Lệnh chạy: `bun scripts/demo/populate.ts --wave W3`. Có `--dry-run` để in kế hoạch mà không gọi API.

**Nội dung:**
- AGY tự viết nội dung trong `scripts/demo/content/`, gồm `issues.json`, `comments.json`, `chat.json` và `profiles.json`.
- Trộn tiếng Việt và tiếng Anh, viết như bài thật của dev và client: lỗi cụ thể, stack, tiêu chí nghiệm thu, đường dẫn repo giả dạng `github.com/demo-org/...`.
- Không lorem ipsum.
- Không dùng tên người thật, tên công ty hay thương hiệu thật làm chủ bài.
- Không đưa email hay số điện thoại vào nội dung. AI Guard sẽ che, nhưng nên có 3–5 tin cố ý chứa liên hệ để thể hiện guard hoạt động.
- Ảnh đính kèm và avatar: sinh PNG bằng script (ảnh khối màu và chữ). Không tải ảnh từ Internet.

**Các đợt:**

| Đợt | Việc |
|---|---|
| W1 | Đăng nhập 40 ví, `updateProfile`, upload avatar |
| W2 | 150 bài, rải đều 9 category. Ngân sách 0,5–5 USDC. `deliveryDeadline` 3–14 ngày, riêng 2 bài để 1–2 ngày cho kịch bản missed delivery. Tạo tiêu chí và test case cho 40 bài (AI mock và tạo tay) |
| W3 | 500 bình luận có reply, `recordIssueView` từ nhiều ví |
| W4 | 350 ứng tuyển, mỗi bài 0–6 người. 15 lần withdraw, 20 lần reject |
| W5 | `selectDeveloper` 45 bài. Nạp 35 bài, `cancelReservation` 4 bài, để 3 bài tự hết hạn |
| W6 | Chat trong 35 phòng qua socket `task:join` và `message:send`. Có file, reply, sửa, xóa. Có 3–5 tin chứa liên hệ để AI Guard che |
| W7 | Submission draft rồi `prepareSubmitWork` cho 28 bài. 5 bài bị `requestChanges` rồi nộp lại |
| W8 | Kết cục: release ≥ 16 kèm `prepareClaim`; settlement ≥ 4; dispute ≥ 5 (xem R6); missed-delivery refund 2 bài, chạy khi deadline đã qua |
| W9 | Review ≥ 14. Ví `spammer` đăng 2 bài spam, admin ẩn và ban ví này |

Sau mỗi bước on-chain, chờ projection ở safe head bằng `waitFor` đọc `EscrowProjection`. Base Sepolia có safe head chậm, timeout tối thiểu 10 phút. Nếu quá hạn thì ghi vào state và làm bài khác. Không dừng cả đợt.

Kiểm: `scripts/demo/populate.test.ts` chạy `--dry-run` và kiểm kế hoạch đủ số lượng ở mục 2. Thêm một test cho `session.ts` dùng ví ngẫu nhiên, chạy với server E2E ở 4012.

Commit theo từng đợt: `feat(r5-w1): ...` đến `feat(r5-w9): ...`.

### R6. Dispute và ruling qua Safe

1. `scripts/demo/lib/safe.ts`:
   - Nhận `safeTransactionJson` mà `draftRuling` trả về.
   - Tính SafeTx hash theo EIP-712 của Safe v1.4.1, lấy `nonce` từ Safe.
   - Ký bằng 2 trong 3 ví owner của arbiter Safe, sắp chữ ký theo địa chỉ owner tăng dần.
   - Gọi `execTransaction` từ một owner.
2. Viết test trước. Trên Hardhat, deploy Safe singleton thật thì phức tạp, nên kiểm hàm tính hash bằng một test vector cố định lấy từ tài liệu Safe. Thêm một lần chạy thật trên Base Sepolia, ghi tx hash vào báo cáo.
3. Kịch bản dispute:
   - 5 bài: hai bên nộp evidence.
   - Admin chạy `draftRuling`. Arbiter Safe đăng initial ruling cho 3 bài.
   - Bên thua challenge 1 bài.
   - Admin `draftRuling` FINAL, Safe đăng final ruling.
   - Các bài còn lại để ở `DISPUTED` hoặc `INITIAL_RULING`.
4. Bên được nhận tiền gọi `prepareClaim`.

Commit: `feat(r6): post arbiter rulings through the arbiter safe`.

### R7. Sửa lỗi phát hiện khi tạo dữ liệu

Mỗi lỗi của app phát hiện trong R5 hoặc R6 được xử lý như sau:
- Viết test tái hiện trước, sửa theo 3.5, mỗi lỗi một commit `fix(r7-<n>): ...`.
- Ghi lỗi vào `LOCAL_TEST_MATRIX.md`.
- Không chỉnh script cho vòng qua lỗi.
- Nếu là lỗi của contract hoặc cần sửa `.sol` thì ghi "Bị chặn", vì sửa `.sol` vẫn bị cấm.

### R8. Kiểm chứng và báo cáo dữ liệu

1. `scripts/demo/verify.ts` in:
   - Bảng số lượng so với mục 2.
   - `reconciliationFindings`.
   - Số dư USDC của escrow trên chain so với `accountedBalance`.
   - Số intent bị kẹt.

   Exit khác 0 nếu có dòng nào chưa đạt.
2. `docs/demo/DEMO_DATA_REPORT.md` (commit) gồm:
   - Địa chỉ contract và Safe, có link BaseScan.
   - Bảng số lượng.
   - 10 tx tiêu biểu cho mỗi loại kết cục.
   - Tổng ETH và USDC đã nhận từ faucet và đã tiêu.
   - Danh sách việc sẽ tự xảy ra theo thời gian thật: review timeout sau 7 ngày, hết hạn challenge, arbiter stall.
3. `docs/LOCAL_DEV.md` thêm mục "Demo trên Base Sepolia": các lệnh `up.sh`, `populate.ts --wave`, `verify.ts`, `down.sh`.

Commit: `docs(r8): add base sepolia demo data report`.

### R9. Tài liệu và gate

1. `DECISIONS.md`: thêm BỔ SUNG R2 (faucet), R4 (env demo), R5 (forwarded-for theo ví), R6 (ký Safe), cùng các BỔ SUNG khác phát sinh.
2. Chạy gate 3.2 trên local Hardhat. Phải exit 0.
3. Chạy `verify.ts` với `.env.demo`. Phải exit 0.
4. Dòng đầu `CODEX.md`: `HOÀN TẤT <ngày giờ> (đợt R; gate exit 0; verify demo exit 0)`. Thêm bảng R0–R9 kèm hash commit.
5. Mục `## Việc người dùng tự làm`:
   - Thay `DEPLOYER_PRIVATE_KEY` trong `.env` (G1).
   - Backup `demo-wallets/keys.json` ra chỗ an toàn. Mất file thì mất quyền điều khiển các Safe.
   - Xóa `seed-realistic.ts` ở checkout chính.
   - Bảo đảm proxy khi deploy ghi đúng `x-forwarded-for`.
   - Verify contract nếu R3 chưa làm.
   - Mở PR.

Commit chung: `docs(r9): final status after r-series`.

---

## 4. Bổ sung và nới quy tắc cho đợt R

**Được phép thêm (ngoài 3.3):**
- Gửi giao dịch trên Base Sepolia (chain 84532), chỉ bằng ví trong `demo-wallets/keys.json`.
- Tạo, migrate và ghi DB `bloody_demo`, chỉ qua API của app. Ngoại lệ: `migrate deploy` và `seed-prod.ts` ở R4.
- Bật và tắt process trên cổng 4100 và 4101.
- Gọi CDP Faucet API, faucet web không có captcha, và RPC công khai `https://sepolia.base.org`.

**Vẫn cấm:**
- Mainnet, hoặc bất kỳ chain nào khác 84532 và 31337.
- In, log hay commit private key. Nếu `keys.json` hoặc `.env.demo` lọt vào `git status` thì dừng ngay.
- Gửi tiền vào hoặc ký bằng ví `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf`.
- Ghi `bloody_codex_local`, `bloody_codex_test` (trừ khi chạy gate) và mọi DB khác.
- Thêm dependency. Đã có ethers 5.7.2, viem 2.57.5, socket.io-client.
- Sửa `.sol`.
- Gọi AI provider thật, S3 hay GitHub.
- Lách captcha, hoặc dùng ví người dùng để lách giới hạn faucet.

**Khi kẹt vì thiếu tiền hoặc RPC:** đây là lý do dừng hợp lệ duy nhất ngoài 3.7. Ghi dòng đầu `CODEX.md` là `CẦN NGƯỜI DÙNG: <việc cụ thể, địa chỉ, số tiền>`. Commit, làm hết phần không cần tiền, rồi dừng.
