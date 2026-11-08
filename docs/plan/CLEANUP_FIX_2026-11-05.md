# Cleanup demo flow — 2026-11-05

| Mục | Kết quả | Commit |
|---|---|---|
| P0-1 | Form tạo, duyệt, xoá tiêu chí thủ công; thông báo khi AI tắt. Nghiệm thu luồng chain chưa hoàn tất. | 85e71f6 |
| P0-2 | Sửa query dashboard và marketplace, anchor, link chết; bỏ link không có màn hình. | 6e0081e |
| P1 | Xoá component và dependency không còn dùng; thêm card và skeleton bị bỏ lại sau khi xoá các caller. | 3302088, 53f8025 |
| L1 | Tái sử dụng thông báo chat sẵn có, bỏ qua khi đã có thông báo chưa đọc cùng issue. Hai tin đồng thời vẫn có thể tạo trùng do kiểm tra và tạo không nguyên tử. | ee653fd |
| L2 | Badge Owner theo clientId; Admin giữ badge riêng. | 3446692 |
| L3 | Đổi nhãn vai trò thành nhãn hiển thị và ghi rõ không ảnh hưởng quyền. | f3fb19b |
| L4 | Thay USDC cố định trong chi tiết issue bằng symbol của token; giữ các hằng số khớp contract. | 3446692 |

Script local-up giờ dừng khi không giải phóng được cổng (2d42865). Đã giữ các thay đổi có sẵn trong prompt; bỏ các kiểm tra nhãn CLIENT/DEVELOPER trong E2E (f3fb19b).

File xoá: `ui/tabs.tsx`, `ui/avatar.tsx`, `ui/dropdown-menu.tsx`, `ui/moving-border.tsx`, `ui/dialog.tsx`, `ui/card.tsx`, `ui/skeleton.tsx`, `marketplace/right-rail.tsx`, `marketplace/marketplace-skeleton.tsx`, `marketplace/task-card.tsx`. Dependency gỡ: `@radix-ui/react-tabs`, `@radix-ui/react-avatar`, `@radix-ui/react-dropdown-menu`, `framer-motion`. Giữ `@radix-ui/react-dialog`.

Kiểm tra:
- `bun run typecheck`: PASS; `bun run lint`: PASS.
- `bun run build`: PASS.
- `bun run --cwd apps/web test`: 78 files passed, 10 skipped; 580 tests passed, 20 skipped (không có TEST_DATABASE_URL).
- Quét import theo §5 sau dọn: không có dòng UNUSED. Quét trước khi xoá từng file xác nhận không còn import; chưa chạy toàn bộ vòng quét trước khi xoá.
- `local-up.sh`: khởi chạy thành công khi được cấp quyền dừng các tiến trình cũ. Lần chạy đầu trong sandbox không dừng được các cổng; đã sửa script để không tiếp tục trong tình huống này.
- Smoke: FAIL sau health check, trang chủ 500; E2E: FAIL tại health check. Nguyên nhân là build bị chạy đồng thời với dev server, làm hỏng `.next` và server dừng. Mỗi script chỉ chạy một lần theo yêu cầu; cả hai dừng trước khi tạo bài, không có ID bài mới. Chưa kiểm chứng luồng tạo tiêu chí → chọn dev trên chain.

L5 chưa thực hiện theo kế hoạch: `editMessage`, `deleteMessage`, `mySessions`, `revokeSession`, `myTransactions`, `adminLogs`, `aiLogs`, `setUserRole`, `unlinkGithub`.
- Sau khi build kết thúc và dựng lại trong cùng phiên, `curl` trả 200 cho `/`, `/marketplace`, `/dashboard`, `/profile`, `/issues/create`. Môi trường thực thi dừng tiến trình nền khi phiên kết thúc; cần chạy lại `bash scripts/demo/local-up.sh` trong terminal người dùng để giữ demo chạy.
