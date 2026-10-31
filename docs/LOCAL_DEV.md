# Chạy local để thử luồng escrow

Tài liệu này chạy tay từng dịch vụ (không qua harness). Mọi lệnh đã được dùng trong `bun run test:e2e:local`. Chạy từ thư mục gốc repo, chỉ dùng `bun`.

## 1. Yêu cầu

- Postgres chạy ở `localhost:5433` (user `postgres`, mật khẩu `postgres`).
- Bun và Hardhat (đã có trong repo qua `apps/contracts`).
- File `.env` tạo từ `.env.example`. Không ghi khóa riêng tư hay secret vào tài liệu hay commit.

## 2. Lệnh chạy tay theo thứ tự

1. Tạo database và áp migration:

   ```bash
   createdb -h localhost -p 5433 -U postgres bloody_codex_local
   bun run db:migrate
   ```

2. Chạy Hardhat node (giữ terminal này mở):

   ```bash
   ulimit -n 65536; bun run --cwd apps/contracts node
   ```

3. Deploy escrow lên node local:

   ```bash
   bun run contracts:deploy
   ```

   Lệnh này ghi manifest vào `apps/contracts/deployments/localhost.json`. Lấy địa chỉ escrow và block deploy từ manifest, rồi điền vào `.env`:

   - `ESCROW_ADDRESS` = trường `address`.
   - `ESCROW_DEPLOY_BLOCK` = trường `deployBlock`.
   - `CHAIN_ID=31337`, `RPC_URL=http://127.0.0.1:8545`.
   - `ADMIN_WALLETS` = địa chỉ tài khoản #1 của Hardhat.

4. Nạp dữ liệu mẫu (token MockUSDC theo manifest):

   ```bash
   bun run tests/e2e/harness/seed.ts
   ```

   Để có thêm dữ liệu bài toán, ứng viên và đánh giá mẫu (không kèm escrow giả):

   ```bash
   bun run db:seed:demo
   ```

5. Chạy worker (cổng health mặc định `WORKER_PORT`):

   ```bash
   bun run worker:start
   ```

   Worker kiểm cấu hình chuỗi khi khởi động và thoát nếu không khớp (P1-32).

6. Chạy web:

   ```bash
   cd apps/web && PORT=4010 bun run server.ts
   ```

   Web cũng kiểm cấu hình chuỗi trước khi nhận kết nối. Mở `http://localhost:4010`.

## 3. Ví MetaMask và tài khoản demo Hardhat

1. Thêm mạng: tên tùy chọn, RPC `http://127.0.0.1:8545`, Chain ID `31337`, ký hiệu ETH.
2. Khi chạy local với `bun run db:seed:demo`, dữ liệu mẫu được liên kết sẵn với các tài khoản mặc định của Hardhat để có thể đăng nhập thử trực tiếp bằng MetaMask:

| Vai trò seed | Tài khoản | Địa chỉ |
|---|---|---|
| Admin | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Client 1 (Alice) | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Developer 1 (Bob) | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Developer 2 (Sophia) | #4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Client 2 (Marcus) | #7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` |
| Developer 3 (Lucas) | #8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` |
| Client 3 (Elena) | #9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` |
| Developer 4 (Alex) | — | (chỉ hiển thị) |

*Lưu ý: Không dùng #0 (owner contract), #5 (arbiter on-chain), #6 (nhận phí platform), để giữ các vai trò on-chain tách bạch.*
*Khóa riêng (private key) lấy trực tiếp từ đầu ra của `hardhat node`; không ghi khóa riêng vào tài liệu hay repo.*

3. Admin: Để vào trang `/admin`, cấu hình `ADMIN_WALLETS` trong `.env` local phải chứa địa chỉ tài khoản #1 (`0x70997970c51812dc3a010c7d01b50e0d17dc79c8`).

## 4. Thử luồng

1. Đăng nhập bằng ví (ký SIWE).
2. Client đăng bài toán (bounty) với token MockUSDC và ít nhất một tiêu chí chấp nhận.
3. Developer ứng tuyển.
4. Client chọn developer và đặt hạn giao hàng.
5. Client ký và nạp tiền (ký lệnh funding, rồi gửi giao dịch approve và deposit).
6. Developer giao việc (tạo bản nháp, rồi gửi giao dịch submit).
7. Client release tiền hoặc yêu cầu sửa.
8. Developer rút tiền từ số dư claimable.

## 5. Chạy kiểm thử tự động

```bash
bun run test:e2e:local
cat tests/e2e/.run/last-run.txt
```

Harness tự bật và tắt Hardhat, worker, web và AI mock trên các cổng 8545, 4011, 4012, 4019. Đọc `tests/e2e/.run/last-run.txt` để xem kết quả; các log nằm cùng thư mục đó.

## 6. Test UI tự động (E32)

`bun run test:e2e:local` cũng chạy `apps/web/ui-e2e/e32-ui-flow.test.ts`: Chrome headless qua Playwright (`channel: "chrome"`), với ví giả gắn vào `window.ethereum`. Ví giả chuyển mọi lệnh tới Hardhat local. Log console và các phản hồi `/api/` ghi ở `tests/e2e/.run/ui.log`.

## 7. Demo trên Base Sepolia (Đợt R)

Môi trường demo chạy trên Base Sepolia testnet (chain 84532), sử dụng database độc lập `bloody_demo` và các cổng riêng biệt (`4100` cho web, `4101` cho worker, `4019` cho AI mock) để không xung đột với môi trường dev hay gate (`4000`, `4010-4012`).

### 7.1. Cấu hình và Khởi động dịch vụ

File `.env.demo` cấu hình các biến cho môi trường demo và được gitignore bảo vệ. Khởi động các tiến trình nền bằng:

```bash
bun run scripts/demo/up.sh
```

Lệnh này kiểm tra kết nối Postgres `bloody_demo`, khởi động AI mock (`4019`), worker (`4101`), và web (`4100`), đồng thời lưu PID vào thư mục `demo-wallets/` để quản lý.

### 7.2. Sinh và nạp dữ liệu nghiệp vụ theo đợt (Waves)

Dữ liệu demo được sinh qua HTTP API và socket theo từng đợt W1–W9:

```bash
# Chạy toàn bộ các đợt ở chế độ kiểm tra dữ liệu trước (dry-run):
bun run scripts/demo/populate.ts --dry-run

# Chạy một đợt cụ thể trên môi trường thật (khi dịch vụ đã bật):
bun run scripts/demo/populate.ts --wave W1  # Profile & avatars
bun run scripts/demo/populate.ts --wave W2  # 150 bounties
bun run scripts/demo/populate.ts --wave W3  # 500 comments
bun run scripts/demo/populate.ts --wave W4  # 350 applications
bun run scripts/demo/populate.ts --wave W5  # Reservation & on-chain funding
bun run scripts/demo/populate.ts --wave W6  # WebSocket chat rooms
bun run scripts/demo/populate.ts --wave W7  # Submissions & revision requests
bun run scripts/demo/populate.ts --wave W8  # Release, settlements, disputes
bun run scripts/demo/populate.ts --wave W9  # Reviews, spam moderation & bans

# Hoặc nạp liên tục tất cả các đợt:
bun run scripts/demo/populate.ts
```

### 7.3. Kiểm chứng dữ liệu và Đối soát

Sau khi nạp xong, chạy script kiểm chứng để so sánh dữ liệu thực tế trong DB `bloody_demo` và trên Base Sepolia với mục tiêu đề ra:

```bash
# Kiểm chứng với dữ liệu kế hoạch và cấu trúc:
bun run scripts/demo/verify.ts --dry-run

# Kiểm chứng live với database bloody_demo và on-chain:
set -a && . ./.env.demo >/dev/null 2>&1; set +a; bun run scripts/demo/verify.ts
```

Script sẽ in bảng đối chiếu chi tiết và thoát với mã `0` nếu mọi chỉ tiêu đạt yêu cầu, không có intent kẹt và không có sai lệch đối soát (reconciliation).

### 7.4. Tắt dịch vụ và Dọn dẹp

Dừng toàn bộ các dịch vụ nền đã bật bằng script:

```bash
bun run scripts/demo/down.sh
```

Script sẽ đọc các PID đã lưu, gửi tín hiệu ngắt nhẹ nhàng (`SIGTERM`), dọn dẹp tiến trình và xóa file PID tracking.
