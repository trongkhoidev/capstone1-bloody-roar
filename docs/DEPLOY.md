# Deploy lên Railway + Supabase

App là một service duy nhất: Next.js + GraphQL + Socket.IO chạy trên custom server (`apps/web/server.ts`). Vì có Socket.IO nên **không chạy trên Vercel**. Repo đã có sẵn `Dockerfile` và `railway.json`.

Mỗi lần deploy, Railway tự làm:
1. Build image từ `Dockerfile` (cài package, `prisma generate`, `next build`).
2. Chạy pre-deploy: `prisma migrate deploy` + seed token USDC (`db:seed:prod`, không tạo dữ liệu giả).
3. Start `bun run --cwd apps/web start`, kiểm tra `/api/health`.

## 1. Supabase

**Database** (Project → Connect → ORMs → Prisma):
- Railway không gọi được IPv6, nên **không dùng** "Direct connection" (`db.<ref>.supabase.co`). Dùng pooler (host `aws-0-<region>.pooler.supabase.com`), hai biến khác nhau:
  - `DATABASE_URL` (app lúc chạy): **Transaction pooler**, port **6543**: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10`
  - `DIRECT_URL` (Prisma migrate, chạy ở pre-deploy): **Session pooler**, port **5432**: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
- `pgbouncer=true` bắt buộc với transaction pooler vì Prisma không dùng prepared statement qua đó. Migrate không chạy qua transaction pooler, nên cần `DIRECT_URL` riêng.

**Storage** (tùy chọn, cần nếu muốn gửi file trong chat):
1. Storage → New bucket → tên `attachments`, **không** bật Public. Bucket private: file chỉ tải được qua signed URL do server tạo.
2. Storage → Settings → S3 Connection: bật, tạo Access key, ghi lại endpoint và region.
3. Access key và service key chỉ đặt trên Railway (biến `AWS_*`, `S3_*`). Không đặt tiền tố `NEXT_PUBLIC_` và không đưa vào client.

## 2. Railway

1. New Project → Deploy from GitHub repo → chọn repo, branch `feat/ui-redesign-and-navbar` (hoặc `main` sau khi merge).
2. Settings → Networking → Generate Domain (ví dụ `bloody-roar.up.railway.app`).
3. Variables: điền bảng ở mục 3, rồi Deploy.
4. Mở `https://<domain>/api/health`, phải thấy `{"status":"ok","database":"connected"}`.

**Builder cần đủ RAM cho `next build`.** `Dockerfile` giả định builder khoảng 8 GB (heap Node 3 GB, 2 worker của Next). Trên máy dev đã kiểm, Docker Desktop chỉ được cấp khoảng 2.8 GB và `next build` bị kill (`SIGKILL`) ở bước kiểm tra type. Muốn build local thì tăng RAM của Docker Desktop trước.

### Hai service

Repo dùng một image cho hai service:

- **web** (repo này): `CMD` mặc định của `Dockerfile` chạy `bun run --cwd apps/web start`. `railway.json` khai báo healthcheck `/api/health` và pre-deploy `db:migrate:prod` + `db:seed:prod`.
- **worker**: dùng cùng image nhưng ghi đè Start Command bằng lệnh của worker. **Chưa có trong nhánh này**: `apps/worker` do A3 thêm. Khi có, phải bổ sung healthcheck và lệnh start tại đây. `railway.json` chỉ áp cho một service, nên worker cần file cấu hình riêng hoặc cấu hình trong dashboard. Phần này chưa kiểm trên Railway.

Rollback và xử lý sự cố: xem [`RUNBOOK.md`](RUNBOOK.md).

## 3. Biến môi trường

### Bắt buộc

| Biến | Giá trị | Ghi chú |
| --- | --- | --- |
| `DATABASE_URL` | Session pooler Supabase (mục 1) | |
| `DIRECT_URL` | Như trên | |
| `NEXT_PUBLIC_APP_URL` | `https://<domain-railway>` | **Không có dấu `/` ở cuối.** Domain đăng nhập SIWE lấy từ đây; sai là không login được. Đổi giá trị thì phải redeploy vì biến này được đóng vào bundle lúc build. |
| `AUTH_PRIVATE_KEY` | Private key **mới, riêng** cho việc ký JWT | Tạo bằng `cast wallet new` hoặc `node -e "console.log('0x'+require('crypto').randomBytes(32).toString('hex'))"`. Không dùng lại key deployer hay ví cá nhân. |
| `ADMIN_WALLETS` | `0xabc…,0xdef…` | Ví trong danh sách được nâng lên ADMIN khi đăng nhập. |

Không cần key thirdweb: đăng nhập dùng ví injected (MetaMask, Coinbase) và backend tự verify chữ ký SIWE bằng `AUTH_PRIVATE_KEY`. `NODE_ENV` và `PORT` cũng không cần điền: image đã set `NODE_ENV=production`, Railway tự cấp `PORT`.

### Tùy chọn

| Nhóm | Biến | Khi nào cần |
| --- | --- | --- |
| Upload file (Supabase Storage) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (lấy từ S3 access key của Supabase), `AWS_REGION`, `AWS_S3_BUCKET=attachments`, `S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`, `S3_FORCE_PATH_STYLE=true` | Muốn đính kèm file trong chat. Thiếu thì upload báo lỗi, các chức năng khác vẫn chạy. |
| AI | `GROQ_API_KEY` (và/hoặc `OPENAI_API_KEY`) | Sinh test case, phân tích dispute. Thiếu thì các nút AI báo "AI unavailable". |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL=https://<domain>/api/auth/github/callback`, `GITHUB_TOKEN_ENCRYPTION_KEY` (64 ký tự hex), `GITHUB_WEBHOOK_SECRET` | Liên kết GitHub đang có lỗi đã biết (BUG-1), nên có thể để sau. |
| Log | `LOG_LEVEL=info` | |

Các biến blockchain (`BASE_SEPOLIA_RPC_URL`, `ESCROW_CONTRACT_ADDRESS_*`, `DEPLOYER_PRIVATE_KEY`) **chưa cần** cho bản này: backend chưa tích hợp escrow. **Không bao giờ** đặt `DEPLOYER_PRIVATE_KEY` trên Railway.

## 4. Role và trang tương ứng

| Role | Vào đâu sau khi đăng nhập | Quyền |
| --- | --- | --- |
| Guest | `/`, `/marketplace`, `/issues/[id]` | Xem. Trang cần đăng nhập hiện panel "Connect wallet". |
| Developer (mặc định khi tạo tài khoản) | `/dashboard` | Apply, chat khi được chọn, nộp submission. Đổi sang Client trong `/profile`. |
| Client | `/dashboard` | Đăng bài (`/issues/create`), xem và chọn ứng viên, từ chối đơn, duyệt submission, mở dispute. |
| Admin (ví trong `ADMIN_WALLETS`) | `/admin` | Quản lý user (ban/unban), xem dispute. Vào `/dashboard` hoặc `/issues/create` sẽ bị chuyển về `/admin`. |

User thường mở `/admin` sẽ bị chuyển về `/dashboard`. API vẫn kiểm quyền độc lập ở từng resolver.

## 5. Kiểm tra sau deploy

1. `/api/health` trả OK.
2. Ví A: đăng nhập → `/profile` đổi sang Client → đăng một bài.
3. Ví B: đăng nhập (Developer) → apply bài của A.
4. Ví A: chọn B → hai bên chat được.
5. Ví C (trong `ADMIN_WALLETS`): đăng nhập → vào thẳng `/admin`, thấy danh sách user.
6. Marketplace phải hiện bài thật vừa đăng. Nếu thấy dữ liệu mẫu nghĩa là API đang lỗi: xem Deploy Logs trên Railway.

**Giới hạn đã biết của bản này:** chưa có escrow on-chain (chọn developer xong là chuyển "In progress"); dispute vẫn theo luồng admin cũ. Xem `docs/plan/BACKEND_EXECUTION_PLAN.md` cho phần còn lại.
