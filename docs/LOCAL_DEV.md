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

## 3. Ví MetaMask

1. Thêm mạng: tên tùy chọn, RPC `http://127.0.0.1:8545`, Chain ID `31337`, ký hiệu ETH.
2. Import tài khoản test #1 đến #4 của Hardhat. Lấy khóa riêng từ đầu ra của `hardhat node` ở terminal bước 2; không ghi khóa vào tài liệu hay repo.
3. Ghi nhớ vai trò: #1 admin, #2 client, #3 và #4 developer, #5 arbiter, #6 nhận phí, #7 người ngoài.

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
