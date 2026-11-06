# Prompt cho AGY: nạp dữ liệu demo thật vào DB Supabase

Ngày: 2026-11-04. Đọc hết trước khi bắt đầu. Làm đúng thứ tự.

Mục tiêu: DB có nhiều dữ liệu trông thật, đủ mọi trạng thái của luồng nghiệp vụ, để cả team mở app là thấy và demo không lộ chỗ trống. Dữ liệu phải đi qua API thật (GraphQL, upload, socket, ký on-chain), giống như người dùng thật đã làm. Không insert thẳng bằng Prisma hay SQL.

---

## 0. Bối cảnh (đã kiểm ngày 2026-11-04)

- **Repo:** `/Users/admin/repos/capstone1`, nhánh `main` (đã gồm PR #21).
  - Tạo nhánh mới `chore/demo-data-local` từ `main` để sửa script.
  - Hiện có các file chưa track trong `docs/plan/`. Không commit chúng.
- **DB:** Postgres trên Supabase, qua Session pooler `aws-0-ap-northeast-2.pooler.supabase.com:5432`. URL nằm trong `.env` và `packages/database/.env`.
  - Đã chạy đủ 13 migration, schema khớp `schema.prisma`.
  - **Cả team dùng chung DB này.**
- **Chain:** Hardhat local `31337` ở `http://127.0.0.1:8545`, process đang chạy.
  - Escrow: `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`, deploy ở block 12.
  - MockUSDC: `0x5FbDB2315678afecb367f032d93F642f64180aa3`, có `mint(address,uint256)` mà ai gọi cũng được.
  - Vai trò on-chain lấy từ `apps/contracts/deployments/localhost.json`:
    - owner: Hardhat #1 `0x7099…79C8`
    - arbiter: Hardhat #2 `0x3C44…93BC`, cũng là `ADMIN_WALLETS`
    - fee recipient: Hardhat #3 `0x90F7…b906`
- **Dịch vụ đang chạy:**
  - web ở `http://localhost:4001` (`PORT=4001 NEXT_PUBLIC_APP_URL=http://localhost:4001 bun run dev`)
  - worker (`bun run worker:start`)
  - Port 4000 đang bị 2 server cũ giữ, không dùng port này.
- **Đã có sẵn công cụ demo, dùng lại, không viết mới:**
  - `scripts/demo/populate.ts` có 9 wave:
    - W1: profile, avatar
    - W2: 150 bài
    - W3: 500 bình luận
    - W4: 350 đơn ứng tuyển
    - W5: reservation và funding on-chain
    - W6: chat
    - W7: nộp bài, yêu cầu sửa
    - W8: release, settlement, dispute
    - W9: review, kiểm duyệt, ban
  - `scripts/demo/content/` chứa nội dung soạn sẵn: `issues.json` (150), `comments.json` (500), `profiles.json` (40), `chat.json` (35).
  - `scripts/demo/wallets.ts` sinh ví vào `demo-wallets/` (đã gitignore).
  - `scripts/demo/verify.ts` dùng để đối soát.
  - Hướng dẫn gốc ở `docs/LOCAL_DEV.md` §7.
- **Vấn đề:** bộ demo được viết cho Base Sepolia (84532):
  - `populate.ts` tìm token USDC của chain 84532 (khoảng dòng 195–205).
  - `fund.ts` và `create-safes.ts` gọi `assertBaseSepolia`.
  - W8 gửi ruling qua Safe 2/3 (`lib/safe.ts`).
  - Ở local thì token là mUSDC trên 31337, còn arbiter là ví thường (EOA), không phải Safe.

Quy tắc dự án (`AGENTS.md`, `CLAUDE.md`):
- Chỉ dùng `bun`.
- Diff nhỏ nhất.
- Kiểm tra bằng CLI, không điều khiển trình duyệt.
- Chạy `bun run typecheck` và `bun run lint` trước khi commit.

## 1. Luật an toàn (bắt buộc)

1. **Không xoá hay reset gì trên DB.** Cấm:
   - `migrate reset`, `migrate dev`, `db push`
   - `TRUNCATE`, `DELETE`, `deleteMany`
   - các script seed có bước dọn dữ liệu

   Trước khi chạy script seed nào, grep script đó. Nếu thấy lệnh xoá thì không chạy.
2. **Không sửa schema, migration hay contract.** Không deploy lại contract. Không restart hay reset Hardhat node: reset chain thì mọi escrow trong DB sẽ trỏ tới chain đã mất.
3. **Chỉ dùng ví test.** Ví demo lấy từ `scripts/demo/wallets.ts` (sinh ngẫu nhiên, nằm trong `demo-wallets/` đã gitignore) hoặc từ mnemonic Hardhat `test test … junk`.
   - Không commit file khoá.
   - Không in private key ra log.
   - Không đụng tới khoá riêng trong `.env` (`DEPLOYER_PRIVATE_KEY`, …).
4. **Chỉ có một worker.** Worker đang chạy rồi. Không bật thêm worker thứ hai trên cùng DB.
   - Nếu `curl localhost:4001/api/health` không trả về 200, hoặc worker đã tắt (kiểm `ps aux | grep worker`), bật lại đúng một web ở 4001 và một worker bằng các lệnh ở mục 0.
5. **Ghi số dòng trước và sau.** Trước khi nạp, đếm số dòng các bảng chính (`users`, `issues`, `applications`, `comments`, `messages`, `submissions`, `escrow_projections`, `disputes`, `reviews`, `notifications`) và ghi vào báo cáo. Sau khi nạp, đếm lại.

## 2. Sửa tối thiểu để bộ demo chạy được trên 31337

Không viết bộ demo mới. Chỉ thêm nhánh rẽ cho chain local, và Base Sepolia phải vẫn chạy như cũ.

1. **Chọn chain theo env.**
   - Token: lấy theo `CHAIN_ID` trong env. Với 31337 thì lấy token đang active trong query `tokens` (mUSDC). Với 84532 giữ logic USDC hiện có.
   - Mặc định `baseUrl` lấy từ `BASE_URL` (đặt `http://localhost:4001`).
2. **Nạp tiền cho ví ở local.** Khi `CHAIN_ID=31337`:
   - Bỏ qua `assertBaseSepolia`.
   - Nạp ETH bằng `hardhat_setBalance`.
   - Nạp mUSDC bằng `MockUSDC.mint`. Mỗi client khoảng 50.000 mUSDC là đủ.
   - Không đổi đường Base Sepolia.
3. **Ví admin và arbiter.** Ở local, role `admin` của bộ demo phải là Hardhat #2 (`0x3C44…93BC`), vì đây là ví nằm trong `ADMIN_WALLETS` và cũng là arbiter on-chain.
   - Map role này qua cấu hình ví local. Không sửa `.env`.
   - Bỏ qua `create-safes.ts` ở local.
4. **Ruling ở W8.** Ở local, gửi tx ruling trực tiếp từ ví arbiter, bằng `to` và `data` lấy từ `safeTransactionJson` mà `draftRuling` trả về. Cách này giống `apps/web/scripts/e2e-role-flows.ts` (S7, S8). Không đi qua Safe.
5. **Test.** Mỗi chỗ rẽ nhánh theo chain cần một test nhỏ, đặt cạnh `populate.test.ts` và `fund.test.ts` có sẵn. Chạy `bun test scripts/demo`.
6. **Nếu phải đổi hơn khoảng 150 dòng**, hoặc phải sửa code app (`apps/web/src`), thì dừng lại và báo. Không tự làm.

## 3. Nạp dữ liệu

Chạy lần lượt từng wave. Mỗi wave chạy `--dry-run` trước, sau đó mới chạy thật:

```bash
set -a; . ./.env; set +a
export BASE_URL=http://localhost:4001
bun run scripts/demo/wallets.ts         # nếu demo-wallets/ chưa có ví
bun run scripts/demo/fund.ts            # nạp ETH + mUSDC cho ví (nhánh local)
bun run scripts/demo/populate.ts --dry-run
bun run scripts/demo/populate.ts --wave W1
# ... W2 đến W9, mỗi wave xong mới chạy wave sau
```

Đọc từng script trước khi chạy để lấy đúng lệnh và tham số, vì các lệnh trên chỉ là khung.

**Phân bố trạng thái cần đạt.** Đây là mục tiêu, lệch một chút không sao. Nếu cấu hình wave sẵn có đã ra phân bố gần như vậy thì giữ nguyên.

| Trạng thái bài | Số lượng gần đúng |
|---|---|
| `OPEN`, có nhiều ứng viên và bình luận | 60–80 |
| `AWAITING_FUNDING` | 5 |
| `IN_PROGRESS`, đã nạp tiền, chưa nộp | 15 |
| Đã nộp, chờ duyệt, có ít nhất 1 lần yêu cầu sửa | 10 |
| `COMPLETED`, có review hai chiều | 25–35 |
| Settlement đã chia tiền | 5 |
| Dispute: đang mở, đã có ruling ban đầu, đã finalize | 2–3 mỗi loại |
| `CANCELLED` | 3 |

Yêu cầu cho từng nhóm dữ liệu:
- **Người dùng:** khoảng 40 profile, có tên, bio, kỹ năng và avatar. Có một vài user bị ban, để trang admin có dữ liệu.
- **Chat:** mỗi bài `IN_PROGRESS` và mỗi bài có dispute có ít nhất 5 tin nhắn.
- **Thời gian:** dữ liệu phải trải ra theo thời gian. Không để mọi bài có cùng `createdAt`. Nếu API không cho đặt thời gian, ghi lại thành giới hạn và không sửa API.

**Khi gặp lỗi:**
- Ghi lại wave và bước bị lỗi.
- Nếu do dữ liệu (ví dụ thiếu tiền hay trùng) thì sửa ở phía script rồi chạy lại wave đó. State nằm trong `lib/state.ts`, nên chạy lại phải nối tiếp được và không tạo trùng.
- Nếu do bug trong app thì **không sửa app**. Ghi lại lỗi, bỏ bước đó, chạy tiếp.
- Nếu bị rate limit, giảm tốc độ, không tắt rate limit.
- Upload ảnh (avatar, attachment) đi qua Supabase Storage theo `.env`. Nếu upload lỗi, tạm bỏ ảnh và ghi lại, không đổi cấu hình storage.

## 4. Kiểm tra sau khi nạp

1. Chạy `bun run scripts/demo/verify.ts`, hoặc nhánh local của nó nếu cần sửa nhỏ. Kết quả phải là: projection escrow khớp với số dư on-chain, và `indexerStatus.lagSeconds` dưới 30.
2. Dùng `curl` hoặc script để kiểm các trang `/`, `/marketplace`, `/admin`, `/profile/<id>` trả về 200. Kiểm thêm query marketplace trả về đủ trang, có phân trang.
3. Đăng nhập bằng 1 client, 1 dev và admin. Mỗi tài khoản phải thấy dashboard có số liệu khác 0.
4. Chạy `bun run typecheck`, `bun run lint` và `bun test scripts/demo`. Tất cả phải pass.

## 5. Giao

- **Commit:** một commit `chore(demo): run demo populator on local hardhat chain`, chỉ gồm thay đổi trong `scripts/demo/`. Push nhánh `chore/demo-data-local` và mở PR vào `main`. Không merge.
- **Báo cáo:** ghi vào `docs/plan/DEMO_DATA_2026-11-04.md`, gồm:
  - bảng số dòng trước và sau của từng bảng
  - bảng phân bố trạng thái bài đã đạt
  - danh sách lỗi app gặp phải (bước, thông báo lỗi, đã bỏ qua thế nào)
  - danh sách ví demo theo vai trò, chỉ ghi địa chỉ, không ghi khoá
  - lệnh để chạy lại hoặc nạp thêm
  - **cảnh báo:** dữ liệu on-chain chỉ có trên Hardhat của máy này. Nếu Hardhat node bị restart thì các escrow trong DB sẽ không còn khớp với chain. Người khác trong team chỉ xem được dữ liệu, không thao tác tiền được trên các escrow này.
- **Khi xong:** không tắt web 4001, worker hay Hardhat node vì không phải mình bật. Chỉ tắt những process mình đã bật thêm.
