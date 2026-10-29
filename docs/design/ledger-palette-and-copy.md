# Bloody-Roar: bảng màu và chữ theo hướng Achromatic ledger

Ngày: 2026-10-29. Nhánh: `feat/claude-ui-redesign`.

Nguồn: taste-skill (`Leonxlnx/taste-skill`), phần app screens, style `achromatic-ledger`, seed `1206306933`, kind `devtools`.

## Quyết định

- Sản phẩm là sổ cái escrow: ví, tiền thưởng, tranh chấp, bàn giao. Chọn `achromatic-ledger` thay vì `framed-sheet`.
- Chrome không mang màu thương hiệu. Nút chính màu gần đen.
- Một màu duy nhất (xanh `#1D5FBF`) cho dữ liệu chính, liên kết, focus và logo. Đỏ không còn là màu thương hiệu, để đỏ chỉ mang nghĩa lỗi.
- Ground xanh xám `#F2F4F7` (giữ từ bản cũ, gần đúng với "blue-grey ledger" của sheet).
- Trạng thái (ok, warn, bad) chỉ xuất hiện ở chỗ có trạng thái.
- Font Geist, Geist Mono cho ID và khóa (như cũ). Số dùng `tabular-nums`.

## Bảng màu

| Token | Sáng | Tối | Vai trò |
| --- | --- | --- | --- |
| `--bg` | `#F2F4F7` | `#0F1115` | Nền trang |
| `--surface` | `#FFFFFF` | `#161920` | Thẻ, panel |
| `--sunk` | `#E9ECF1` | `#232731` | Mục nav đang chọn |
| `--line` | `#E3E6EC` | `#2A2F3A` | Viền thẻ |
| `--line-2` | `#CDD2DB` | `#3B4250` | Viền ô nhập |
| `--ink` | `#111316` | `#ECEEF2` | Chữ chính |
| `--ink-2` / `--ink-3` | `#4A505C` / `#5B6271` | `#B9BEC9` / `#9097A5` | Chữ phụ |
| `--link` = `--brand` | `#1D5FBF` | `#7AA8FF` | Màu dữ liệu, liên kết |
| `--cta` / `--cta-ink` | `#111316` / `#FFFFFF` | `#ECEEF2` / `#0F1115` | Nút chính |
| `--ok` | `#247B50` | `#4BCB86` | Thành công |
| `--warn` | `#92400E` | `#F0A54A` | Cảnh báo |
| `--bad` | `#C4242A` | `#FF7B73` | Lỗi, mất tiền |
| `--attn` | `#3D4452` | `#C4CAD6` | Trạng thái trung tính (thay tím cũ) |

Tương phản đo được (WCAG):

- Chữ chính trên nền: 16.9:1 (sáng), 16.3:1 (tối).
- Chữ phụ `--ink-3` trên nền: 5.6:1 (sáng), 6.0:1 trên thẻ tối.
- Accent trên thẻ: 6.1:1 (sáng), 7.4:1 (tối).
- Trạng thái ok trên nền ok: 4.7:1.

## Thay đổi trong code

- `apps/web/src/styles/claude-design.css`: token `:root` và giao diện tối. Bỏ viền đỏ trên thanh trên.
- `apps/web/src/app/globals.css`: token shadcn (HSL) cho sáng và tối. Bỏ khối `.light` đè token. Bóng glow về `none`.
- `components/ui/button.tsx`: bỏ bóng đỏ của biến thể `glow`. Link dùng `--link`. Chữ trên nền primary dùng `--primary-foreground`.
- `components/ui/tabs.tsx`, `layout/notifications-menu.tsx`: chữ trên nền primary dùng `--primary-foreground` (giao diện tối nền primary là màu sáng).
- `components/ui/dialog.tsx`, `ui/sheet.tsx`, `auth/connect-modal.tsx`, `layout/Navbar.tsx`: bỏ `backdrop-blur` (kính mờ).
- `chat/chat-room.tsx`, `issues/test-case-panel.tsx`: màu Tailwind cứng (emerald, amber, slate, white) đổi sang token.
- `layout/notifications-menu.tsx`, `ui/badge.tsx`, `marketplace/task-card.tsx`, `admin/admin-view.tsx`, `profile/profile-view.tsx`: `--accent` (màu thương hiệu cũ) đổi sang `--ring` (xanh mới). `--accent` shadcn nay là xám trung tính cho hover.
- `layout/user-menu.tsx`: chữ avatar dùng `--cta-ink`.
- `app/layout.tsx`: nạp Geist và Geist Mono. Metadata viết lại.
- `lib/ui-preferences.tsx`: viết lại toàn bộ từ điển EN và VI, giữ nguyên khóa và logic.
- `marketplace/marketplace-view.tsx`, `marketplace/right-rail.tsx`: nhãn thống kê, panel escrow, tiêu đề viết hoa, emoji.
- `chat/chat-room.tsx`: câu trạng thái trống, chỉ đọc, che nội dung nhạy cảm.
- `layout/notifications-menu.tsx`: trạng thái trống.

## Quy tắc chữ

- Dùng danh từ của nghề: bounty, ứng viên (applicant), escrow, arbiter. Không dùng "Items", "Records", "Status".
- Sentence case. Không viết hoa từng chữ, không viết hoa cả câu.
- Mô tả việc sản phẩm làm hoặc dữ kiện đang có. Không mô tả giao diện ("trang này hiển thị…").
- Không lời chào, không emoji, không dùng các từ sáo ngữ.

## Chưa làm

- Bố cục theo taste-skill (lưới, thứ tự khối, trang chủ dạng hero). Yêu cầu chỉ là màu và chữ nên giữ nguyên.
- Chữ hard-code còn lại trong JSX, ví dụ `home/home-page-view.tsx` (nav, hero, các khối), `auth/connect-modal.tsx`, `layout/left-sidebar.tsx`, và phần lớn `dashboard`, `admin`. Dữ liệu mẫu (tên người, số payout) cũng giữ nguyên.
- Logo PNG (`/brand/wolf-logo*.png`) là tài sản thương hiệu, không đổi màu. Nếu logo đỏ trên nền mới, cần xuất lại logo.
- Màu thương hiệu của bên thứ ba (MetaMask, Coinbase) trong `connect-modal.tsx`.
- Gradient của `skeleton` (shimmer khi tải) giữ lại, vì là trạng thái tải chứ không phải trang trí. Lớp `gradient-border`, `gradient-text`, `moving-border` không được dùng ở đâu và giữ nguyên.

## Kiểm tra

- `bun run typecheck`: đạt.
- `bun run lint`: không có lỗi. Có 1 cảnh báo mới `@next/next/no-page-custom-font` ở `app/layout.tsx`, do nạp font bằng `<link>`. Có 4 cảnh báo `any` sẵn có ở `ui/moving-border.tsx`.
- Chưa chạy `bun run build`, chưa mở trang trong trình duyệt.
