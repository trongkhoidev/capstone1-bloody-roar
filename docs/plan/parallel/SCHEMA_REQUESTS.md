# Yêu cầu schema

Mỗi dòng là một yêu cầu cột hoặc model ngoài mục 5 của README. A3 đọc file này khi merge và gom vào một migration. Không ai tự sửa `schema.prisma`.

| Từ | Yêu cầu | Lý do | Trạng thái |
| --- | --- | --- | --- |
| A5 | `Issue.hiddenAt DateTime?` | BE-64 `adminHideIssue(issueId, reason)`: admin ẩn issue, cần một mốc để chặn hiển thị. Schema hiện tại không có cột ẩn nào. | Chờ A3 |
| A5 | `Dispute.raisedAt DateTime?` | BE-53, BE-55, BE-56 tính hạn từ `raisedAt` (72 giờ cho bằng chứng, 30 ngày cho arbiter). BE-59a đánh dấu tin gửi sau mốc này. Mục 5 chưa có cột này. | Chờ A3 |
| A4 | Model `IssueView`: `id`, `issueId`, `userId`, `viewedAt DateTime`, `@@unique([issueId, userId])`, `@@index([issueId])` | BUG-7 cần dedupe lượt xem theo user trong 1 giờ (`recordIssueView`). Chưa có bảng nào lưu việc này. | Chờ A3 |
| A4 | Giá trị `DEPOSIT_MISMATCHED` trong enum `NotificationType` | BE-66c gửi thông báo cho hai bên và admin khi deposit lệch điều khoản. Enum hiện không có giá trị phù hợp. Cần `ALTER TYPE "NotificationType" ADD VALUE 'DEPOSIT_MISMATCHED'`. A5 cần thêm template cho giá trị này. | Chờ A3 |
