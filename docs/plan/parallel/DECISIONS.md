# Quyết định

## D1 — GitGuardian PR #16, #17

Mặc định: không viết lại lịch sử. Các lựa chọn: đánh dấu false positive trên dashboard, viết lại nhánh khi người dùng xác nhận, hoặc tạo PR mới từ commit gộp. Không tự mở PR.

## Database test

FIX_LIST đồng thời yêu cầu chỉ dùng bloody_codex và yêu cầu tên database test chứa test; hai điều kiện không thể cùng đúng. Mặc định an toàn là chỉ cho phép chính xác bloody_codex khi chạy test trong dự án này, và từ chối mọi database khác, bao gồm database dev. Cần triển khai rõ ngoại lệ này ở P0-9 và ghi nhận sự khác biệt với tiêu chí tên chứa test.
