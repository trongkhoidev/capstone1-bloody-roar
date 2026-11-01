---
name: claude-design-system
description: Quy chuẩn và hướng dẫn thiết kế giao diện Bloody-Roar chính xác theo thiết kế Claude Design (34 screens)
---

# 🩸 Bloody-Roar: Claude Design System Guide

Tài liệu hướng dẫn triển khai giao diện chuẩn xác theo bộ thiết kế Claude Design tại `docs/claude-design/`.

## 1. Design Tokens & Color Palette

### Light Mode (`:root` / `.br`)
```css
--bg: #F3F4F7;
--surface: #FFFFFF;
--surface-2: #F7F8FA;
--sunk: #ECEEF2;
--line: #DFE2E8;
--line-2: #C3C8D2;
--ink: #14171F;
--ink-2: #424957;
--ink-3: #5B6271;
--link: #1754C9;
--link-h: #0E3C96;
--cta: #1754C9;
--cta-ink: #FFFFFF;
--brand: #C21F3A; /* Bloody-Roar Crimson */
--gold: #855600;
--gold-bg: #FFF4D6;
--gold-line: #E6C46E;
--tag-bg: #E7EEFB;
--tag-ink: #1E4A96;
--tag-line: #CAD9F3;
--ok: #12773C;
--ok-bg: #E2F3E9;
--warn: #9C4A00;
--warn-bg: #FFEFDB;
--bad: #B0251D;
--bad-bg: #FCE7E5;
--attn: #5838C0;
--attn-bg: #EDE8FC;
```

### Dark Mode (`.dark` / `.br.dark`)
```css
--bg: #0F1115;
--surface: #161920;
--surface-2: #1B1F27;
--sunk: #232731;
--line: #2A2F3A;
--line-2: #3B4250;
--ink: #ECEEF2;
--ink-2: #B9BEC9;
--ink-3: #9097A5;
--link: #7FB0FF;
--link-h: #A9CBFF;
--cta: #3D7CF0;
--cta-ink: #FFFFFF;
--brand: #F2555A;
--gold: #F2B648;
--gold-bg: #2A2312;
--gold-line: #5A4720;
--tag-bg: #1B283E;
--tag-ink: #A9C6F5;
--tag-line: #2B3D5C;
--ok: #4BCB86;
--ok-bg: #15291F;
--warn: #F0A54A;
--warn-bg: #2C2113;
--bad: #FF7B73;
--bad-bg: #301817;
--attn: #B6A1FF;
--attn-bg: #231D3A;
```

---

## 2. Danh Mục 34 Màn Hình Claude Design

| STT | Màn hình | File thiết kế | Tuyến đường Web (Route) |
| :---: | :--- | :--- | :--- |
| **00** | Trang chủ | `00_Bloody-Roar_home.html` | `/` |
| **01** | Chợ việc Bounty | `01_Browse_bounties.html` | `/marketplace` |
| **02** | Danh mục Skills | `02_Skills_directory.html` | `/skills` |
| **03** | Danh sách Developers | `03_Developers_directory.html` | `/developers` |
| **04** | Hồ sơ cá nhân | `04_Public_profile.html` | `/profile/[id]` |
| **05** | Dashboard Khách hàng | `05_Client_dashboard.html` | `/dashboard` |
| **06** | Đăng nhập / Kết nối ví | `06_Sign_in.html` | ConnectModal component |
| **07** | Khởi tạo hồ sơ | `07_Create_your_profile.html` | `/onboarding` |
| **08** | Trạng thái hệ thống | `08_System_states.html` | Empty / Loading / 404 |
| **09** | Quy trình Escrow | `09_How_it_works.html` | `/how-it-works` |
| **10** | Đăng Bounty - Bước 1 | `10_Post_a_bounty___Basics_and_scope.html` | `/issues/create` |
| **11** | Đăng Bounty - Bước 2 | `11_Post_a_bounty___Criteria__budget__reposi.html` | `/issues/create/step-2` |
| **12** | Duyệt ứng viên | `12_Review_applicants.html` | `/issues/[id]/applicants` |
| **13** | Nạp tiền Ký quỹ | `13_Fund_escrow.html` | `/issues/[id]/fund` |
| **14** | Workroom (Client Review) | `14_Workroom___client_review.html` | `/issues/[id]` |
| **15** | Thương lượng phân chia | `15_Mutual_settlement.html` | SettlementModal |
| **16** | Phòng Tranh chấp | `16_Dispute_room.html` | `/issues/[id]/dispute` |
| **17** | Hoàn tất & Đánh giá | `17_Bounty_completed.html` | CompleteModal |
| **18** | Dashboard Developer | `18_Developer_dashboard.html` | `/dashboard/developer` |
| **19** | Form ứng tuyển | `19_Apply_to_a_bounty.html` | ApplyModal |
| **20** | Đơn của tôi | `20_My_applications.html` | `/applications` |
| **21** | Workroom (Developer Submit) | `21_Workroom___developer.html` | `/issues/[id]/work` |
| **22** | Nộp bằng chứng phản biện | `22_Submit_counter-evidence.html` | CounterEvidenceModal |
| **23** | Hệ thống Tin nhắn | `23_Messages.html` | `/messages` |
| **24** | Tạo tin nhắn | `24_New_message.html` | NewMessageModal |
| **25** | Chatbox Dock góc màn hình | `25_Chatbox_dock.html` | FloatingChatDock |
| **26** | Mobile Responsive Chat | `26_Group_chat_on_phone.html` | MobileChatDrawer |
| **27** | Trung tâm Thông báo | `27_Notifications.html` | NotificationsMenu |
| **28** | Ví & Yêu cầu rút tiền | `28_Wallet_and_claims.html` | `/wallet` |
| **29** | Cài đặt | `29_Settings.html` | `/settings` |
| **30** | Admin Tổng quan | `30_Admin_overview.html` | `/admin` |
| **31** | Admin Quản lý User | `31_Admin_users.html` | `/admin/users` |
| **32** | Admin Kiểm duyệt | `32_Bounty_moderation.html` | `/admin/moderation` |
| **33** | Admin Hàng đợi Tranh chấp | `33_Disputes_queue.html` | `/admin/disputes` |

---

## 3. Quy Chuẩn Thành Phần (Component Patterns)

### 3.1. Top Navigation Bar (`.top`)
* Chiều cao chuẩn: `56px`.
* Viền trên thương hiệu: `border-top: 3px solid var(--brand)`.
* Viền dưới: `border-bottom: 1px solid var(--line)`.
* Logo gồm khối vuông `.mark` 26x26px màu nền `--ink` chứa biểu tượng, tên `Bloody-Roar` đậm `font-weight: 700`.
* Thanh tìm kiếm có phím tắt `⌘K`, icon kính lúp bên trái.
* Badge trạng thái mạng: `Base Sepolia testnet` đi kèm chấm xanh `.dot` (7x7px).

### 3.2. Thẻ Bounty Mẫu (`.sum`)
* Bố cục 2 cột cố định: `112px minmax(0, 1fr)`.
* Cột trái (`.stats`):
  * Huy hiệu thưởng (`.reward`): Viền vàng `--gold-line`, nền vàng nhạt `--gold-bg`, chữ vàng `--gold`.
  * Số đơn ứng tuyển (`.apps`), lượt xem (`.views`), thời gian còn lại (`.dl`).
* Cột phải:
  * Tiêu đề (`.s-title`), mô tả ngắn (`.s-ex` - tối đa 2 dòng).
  * Danh mục và danh sách kỹ năng (`.tags` -> `.tag`).
  * Người đăng (`.uc`): Avatar chữ cái viết tắt, tên, điểm uy tín (reputation score) và thời gian đăng.
