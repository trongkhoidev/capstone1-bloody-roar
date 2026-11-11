# Yêu cầu schema

Mỗi dòng là một yêu cầu cột hoặc model ngoài mục 5 của README. A3 đọc file này khi merge.

- **[A4] Model `IssueView`**: `id`, `issueId`, `userId`, `viewedAt DateTime`, `@@unique([issueId, userId])`, `@@index([issueId])`. Lý do: BUG-7 cần dedupe lượt xem theo user trong 1 giờ (`recordIssueView`). Chưa có bảng nào lưu việc này.
- **[A4] Giá trị `DEPOSIT_MISMATCHED` trong enum `NotificationType`**: BE-66c gửi thông báo cho hai bên và admin khi deposit lệch điều khoản. Enum hiện không có giá trị phù hợp. Cần `ALTER TYPE "NotificationType" ADD VALUE 'DEPOSIT_MISMATCHED'` trong migration. A5 cần thêm template cho giá trị này.
