# Runbook vận hành

Dành cho người trực khi app chạy trên Railway (xem [`DEPLOY.md`](DEPLOY.md) để biết cách deploy lần đầu).

## 1. Rollback

**Ứng dụng: redeploy image trước.** Trên Railway: service web → Deployments → chọn bản đang chạy tốt trước đó → Redeploy. Không sửa code trực tiếp lúc sự cố.

**Database: migration chỉ tiến, không rollback bằng tay.**
- Quy tắc viết migration: cột mới phải nullable hoặc có default, và phải deploy migration trước code cần nó. Nhờ vậy redeploy image cũ vẫn chạy được trên schema mới.
- Migration đã xóa hoặc đổi cột mà code cũ cần: khôi phục database từ backup Supabase, rồi redeploy image cũ. Chụp backup trước mọi migration có thao tác xóa.

**Contract: không upgrade.** Contract đã deploy là bất biến, không có đường rollback contract. Sự cố on-chain xử lý theo quy trình của escrow, không theo runbook này.

## 2. Kiểm tra nhanh

- `GET /api/health` phải trả `200` và `"database":"connected"`. Trả `503` nghĩa là không kết nối được database.
- Mọi response có header `x-request-id`. Dùng id này để tìm mọi dòng log của cùng một request.
- Log GraphQL: mỗi operation ghi `operation`, `durationMs`, `errors`. Tìm theo `requestId` hoặc theo tên operation.

## 3. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| Container thoát ngay, log có `Invalid environment: DATABASE_URL: required in production` (hoặc `AI_HASH_KEY`) | Thiếu biến bắt buộc khi chạy production. Thêm biến trên Railway rồi redeploy. |
| `429 Too many requests` kèm `Retry-After` | Vượt giới hạn theo IP hoặc theo user (`/api/auth/nonce`, `/api/auth/login`, `/api/graphql`, `/api/uploads`). Chờ đúng số giây trong `Retry-After`. Nhiều người chung một IP (NAT) có thể chạm giới hạn: tăng `GRAPHQL_POINTS_PER_MINUTE` trong `app/api/graphql/route.ts`. Giới hạn nằm trong bộ nhớ của từng instance, nên scale ra nhiều instance sẽ nhân giới hạn lên. |
| Đăng nhập ví thất bại, không rõ lý do | Kiểm tra `NEXT_PUBLIC_APP_URL` (xem DEPLOY.md mục 3). Biến này được đóng vào bundle lúc build, sai thì phải redeploy. |
| `Login challenge already used` | Nonce đã được dùng. Ví phải ký lại từ đầu. Đây là replay, không phải lỗi hệ thống. |
| Liên kết GitHub trả `GITHUB_ALREADY_LINKED` | Tài khoản GitHub đã gắn với ví khác. Chủ ví đó phải gọi `unlinkGithub` trước. |
| `next build` bị `SIGKILL` | Builder thiếu RAM (xem DEPLOY.md mục 2). |

## 4. Cấp quyền admin

```bash
railway run bun run --cwd apps/web scripts/grant-admin.ts 0x<address>
```

Lệnh đặt role `ADMIN` và ghi một dòng `AdminLog` (action `grant_admin`, adminId `cli`). Chạy trên đúng môi trường cần cấp quyền. Không chạy trên database của người khác.

## 5. Dừng server

`SIGTERM` (Railway gửi khi redeploy): đóng Socket.IO, đóng HTTP server, ngắt Prisma, rồi thoát `0`. Nếu chưa xong sau 10 giây, tiến trình thoát `1`.
