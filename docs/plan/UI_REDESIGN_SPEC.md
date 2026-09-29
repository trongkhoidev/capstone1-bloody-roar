# UI Redesign Spec

**Prototype (33 màn hình, theo role):** https://claude.ai/artifact/5DgZDzkgGs2jpDtrybe8TL
Prototype có danh sách màn hình theo nhóm Guest / Client / Developer / Shared / Arbiter & Admin. Mỗi màn có ghi chú route, API và các state. Chuyển theme sáng/tối để xem cả hai bộ màu.

**Đồng bộ:** đã rà soát theo `BACKEND_EXECUTION_PLAN.md` (QĐ-01..32) ngày 27/09. Khi có mâu thuẫn, file kế hoạch thực thi là nguồn đúng.

**Căn cứ:** phân tích UI của `/Users/admin/repos/bloody-roar` (bản React/Vite cũ, cùng domain), audit frontend hiện tại (`apps/web`), state machine của `BloodyRoarEscrow.sol`, và các template marketplace cùng loại (Gitcoin, OnlyDust, Algora, Superteam Earn, Upwork).

---

## 1. Hướng thiết kế

### 1.1 Lấy gì từ bloody-roar

bloody-roar có ba "phương ngữ" giao diện lẫn lộn: zinc tối kiểu Vercel (marketplace, issue detail, dashboard), slate + gradient indigo/tím (admin, workspace, 404), và trắng sáng (chat, KYC, modal, toast). Chỉ giữ phương ngữ **zinc**, gộp hai cái còn lại vào đó.

| Giữ | Bỏ / sửa |
| --- | --- |
| Nền zinc gần đen `#09090B`, 3 bậc surface `#121214 / #1A1A1F / #242429`, viền trắng mờ 6–10% | Gradient indigo/tím ở admin, UI trắng ở chat/modal |
| Nút chính đảo màu (nền trắng chữ đen ở dark) | 5 kiểu nút Accept/Release khác nhau → chuẩn hóa variant |
| **Vàng chỉ dành cho tiền** (`#F5A623 → #FFC53D`) | Hex hard-code rải rác → đưa hết vào token |
| Pill trạng thái tint (nền 10%, viền 25%, chữ đậm) | Emoji trong label ("Trending 🔥", "💸 REFUND") |
| Wallet pill trên header, menu tài khoản có reputation | Carousel 3D blur nặng, card kiểu mạng xã hội khó scan |
| Issue detail 2/3 + 1/3, sidebar có Escrow panel theo role | Font Inter khai báo nhưng không load |
| Master-detail cho dispute, activity timeline | Chữ 9–10px (sàn tối thiểu 12px) |
| Chat đánh dấu tin bị guard chặn | Light theme với viền vô hình `rgba(0,0,0,.03)` |

### 1.2 Học từ các marketplace cùng loại

| Nguồn | Pattern áp dụng |
| --- | --- |
| Algora / OnlyDust | Bounty gắn repo GitHub, hiển thị PR state ngay trong workroom |
| Superteam Earn / Gitcoin | List bounty dày thông tin (tiền, deadline, số ứng viên, skill) thay vì card social |
| Upwork | "Action needed" đặt đầu dashboard; milestone/escrow panel luôn nói rõ bước tiếp theo |
| Etherscan / Safe | Hash, địa chỉ luôn mono + copy + link explorer; transaction có trạng thái rõ ràng |

### 1.3 Điểm nhận diện riêng

- **Crimson "Roar"** `#F2555A` (dark) / `#D12E3A` (light) chỉ dùng cho logo, chỉ báo nav đang chọn và focus ring. Không dùng làm màu nút.
- **Geist + Geist Mono** (Google Fonts, load qua `next/font`). Mọi số tiền, hash, địa chỉ, countdown, bps dùng Geist Mono với tabular numerals. Sản phẩm là "sổ cái", nên con số phải thẳng cột.
- **Thanh chia tiền** (client / developer / fee) xuất hiện trước **mọi** hành động ký có chuyển tiền. Người dùng luôn thấy mình nhận bao nhiêu trước khi ký.
- **Stepper 5 trạng thái transaction** (Waiting for signature → Submitted → Pending safe head → Confirmed / Failed), đúng Proposal §15.

---

## 2. Design tokens (map sang shadcn `globals.css`)

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

:root {                          /* light */
  --background: #F5F5F7;  --foreground: #0B0B0E;
  --card: #FFFFFF;        --card-foreground: #0B0B0E;
  --popover: #FFFFFF;     --popover-foreground: #0B0B0E;
  --primary: #0B0B0E;     --primary-foreground: #FAFAFA;   /* CTA đảo màu */
  --secondary: #F0F0F3;   --secondary-foreground: #0B0B0E;
  --muted: #F0F0F3;       --muted-foreground: #6E6E78;
  --accent: #E7E7EB;      --accent-foreground: #0B0B0E;
  --border: rgba(11,11,14,.09); --input: rgba(11,11,14,.12); --ring: #D12E3A;
  --brand: #D12E3A;
  --info: #1D5FD6; --success: #15803D; --warning: #B45309; --destructive: #C62828; --attention: #6D3FD1;
  --bounty: #A86A0C; --bounty-2: #C98A1B;
  --radius: 0.75rem;             /* card 12px, control 8px */
}
.dark {
  --background: #09090B;  --foreground: #FAFAFA;
  --card: #121214;        --card-foreground: #FAFAFA;
  --popover: #121214;     --popover-foreground: #FAFAFA;
  --primary: #FAFAFA;     --primary-foreground: #09090B;
  --secondary: #1A1A1F;   --secondary-foreground: #FAFAFA;
  --muted: #1A1A1F;       --muted-foreground: #A1A1AA;
  --accent: #242429;      --accent-foreground: #FAFAFA;
  --border: rgba(255,255,255,.07); --input: rgba(255,255,255,.12); --ring: #F2555A;
  --brand: #F2555A;
  --info: #5B9BFF; --success: #3DD68C; --warning: #F5A524; --destructive: #FF6369; --attention: #A78BFA;
  --bounty: #F5A623; --bounty-2: #FFC53D;
}
@theme inline {
  --color-background: var(--background); --color-foreground: var(--foreground);
  --color-card: var(--card); --color-primary: var(--primary); --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary); --color-muted: var(--muted); --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent); --color-border: var(--border); --color-input: var(--input); --color-ring: var(--ring);
  --color-brand: var(--brand); --color-info: var(--info); --color-success: var(--success);
  --color-warning: var(--warning); --color-destructive: var(--destructive); --color-attention: var(--attention);
  --color-bounty: var(--bounty);
  --font-sans: var(--font-geist); --font-mono: var(--font-geist-mono);
  --radius-sm: calc(var(--radius) - 4px); --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius); --radius-xl: calc(var(--radius) + 4px);
}
.text-bounty { background: linear-gradient(135deg, var(--bounty), var(--bounty-2));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

**Typography:** H1 24/700 (trang), 26/700 (issue title), 44/800 landing hero; body 14/1.55; label 11/600 uppercase tracking .08em; sàn tối thiểu 12px.
**Layout:** header 60px sticky glass; sidebar 220px cho dashboard/admin (ẩn dưới 860px); marketplace và issue detail dùng full width không sidebar; container tối đa 1240px; issue detail `minmax(0,1fr) 380px`.

---

## 3. Component cần có (shadcn + component domain)

| Component | Ghi chú |
| --- | --- |
| `Button` | variant: `default` (đảo màu), `secondary`, `ghost`, `success` (fund/claim), `destructive` (dispute), `outline`; size sm/md/lg |
| `StatusBadge` | nhận `{kind: 'issue'|'escrow'|'application'|…, value}` → label + tone từ bảng mục 5. Không tự viết màu ở từng trang. |
| `TokenAmount` | nhận `{raw, decimals, symbol, formatted}` (string, không float) → hiển thị gradient vàng + mono, giữ đủ độ chính xác (ví dụ `853.125`). Bỏ tiền tố `$` cứng. |
| `PayoutBreakdown` | thanh 3 màu + legend client/developer/fee, tính từ bps theo công thức contract; dùng trước mọi lệnh ký |
| `TxStatusStepper` + toast/drawer toàn cục | 5 trạng thái; link explorer; retry khi failed; decode custom error |
| `DeadlineChip` | countdown mono; tone `hot` khi còn < 24h |
| `EscrowPanel` | state badge + số tiền + breakdown + danh sách action theo `viewerCapabilities` (BE-20) + dòng "nếu bạn không làm gì thì…" |
| `ActivityTimeline` | rail dọc; node ok / now / bad / future; mỗi chain event có tx hash |
| `Hash` / `Address` | mono, rút gọn, copy, link BaseScan |
| `AIAdvisoryBox` | viền tím nhạt, nhãn "AI · advisory", provenance (model, prompt version, input hash) |
| `WalletConnectDialog` | dialog thật (focus trap, Esc), các state trong mục 4 P6 |
| `EmptyState`, `ErrorState`, `Skeleton` | không bao giờ fallback im lặng sang mock data |

---

## 4. Sitemap theo role

| # | Route | Role | Có sẵn? | Màn trong prototype |
| --- | --- | --- | --- | --- |
| P1 | `/` Landing | Mọi người (guest-first) | Không (đang là marketplace, hero chỉ hiện cho admin) | Landing |
| P2 | `/marketplace` | Mọi người | Có (thô, có mock) | Marketplace |
| P3 | `/issues/[id]` | Mọi người, CTA theo role | Có (quá tải: dồn cả workroom, chat, dispute) | Issue detail (public) |
| P4 | `/users/[id]` | Mọi người | Không (API `user(id)` đã có) | Public profile |
| P5 | `/how-it-works` | Mọi người | Không | How it works |
| P6 | Dialog connect wallet + `/suspended` | Guest / bị khóa | Một phần (dùng `alert()`) | Connect wallet |
| P7 | `/issues/new` wizard 6 bước (bước cuối "Review & publish", không ký; cần ≥ 1 tiêu chí approved để chọn developer) | Client | Một phần (form 1 trang) | Create bounty wizard, AI acceptance criteria |
| P8 | `/issues/[id]/edit` | Client (chủ) | Không (API có) | (dùng lại wizard) |
| P9 | `/issues/[id]/applicants` | Client (chủ) | Một phần | Review applicants |
| P10 | `/issues/[id]/fund` (3 bước: ký FundingIntent EIP-712 → approve USDC → deposit, QĐ-18) | Client (chủ) | Không | Fund escrow |
| P11 | `/issues/[id]/workroom` | Client + dev được chọn; admin chỉ đọc khi dispute | Một phần | Workroom (client), Workroom (developer) |
| P12–P15 | Submit delivery, review & release, timeout exits, settlement | Theo state | Không (chỉ off-chain) | Workroom, Mutual settlement |
| P16 | `/issues/[id]/dispute` (chat vẫn mở để thương lượng, QĐ-24) | 2 bên | Một phần (chỉ raise) | Dispute room, Submit counterparty evidence |
| P17 | `/issues/[id]/complete` | 2 bên | Không | Completion · claim · rate |
| P18 | `/dashboard` | Client workspace / Developer workspace | Một phần | Dashboard (client), Dashboard (developer) |
| P19 | `/dashboard/applications` | Developer | Một phần (tab) | My applications, Apply modal |
| P20 | `/messages` | Participant | Không | Messages |
| P21 | `/notifications` | Đã đăng nhập | Không (chỉ chuông) | Notifications |
| P22 | `/wallet` | Đã đăng nhập | Không | Wallet & claims |
| P23 | `/settings` | Đã đăng nhập | Một phần (`/profile`) | Settings |
| A1 | `/admin` | Admin | Một phần | Admin overview |
| A2 | `/admin/users` | Admin | Một phần | Users |
| A3 | `/admin/issues` | Admin | Không | Issue moderation |
| A4 | `/admin/disputes`, `/admin/disputes/[id]` (draftRuling → xuất JSON Safe Transaction Builder, QĐ-25) | Admin / người vận hành Arbiter Safe | Một phần | Disputes queue, Ruling console |
| A5 | `/admin/escrows`, `/admin/contract` | Admin | Không | Escrows & contract |
| A6 | `/admin/tokens` | Admin | Không | — |
| A7 | `/admin/logs` | Admin | Không | Audit & AI logs |
| X | 404, error, wrong network, tx drawer toàn cục | Mọi người | Không (không có `error.tsx`, `loading.tsx`, `not-found.tsx`) | Design system (tx stepper) |

**Ghi chú role (QĐ-21):** một tài khoản vừa đăng bài vừa ứng tuyển được. Client/Developer chỉ là **workspace** (dashboard mở mặc định, chọn trong Settings), không giới hạn quyền. Quyền thật trên từng escrow đến từ ví (`msg.sender`), nên UI dựa hoàn toàn vào `viewerCapabilities` của từng Issue. Web ADMIN **không** có quyền với tiền hay phán quyết; console admin chỉ tạo payload để Arbiter/Owner Safe ký.

### CTA trên `/issues/[id]` theo người xem

| Người xem / state | CTA |
| --- | --- |
| Guest, Issue OPEN | "Connect wallet to apply" |
| User đã đăng nhập, không phải chủ, chưa apply | "Apply" → modal cover letter |
| Đã apply | Badge trạng thái + "Withdraw" |
| Chủ Issue, OPEN | Edit · Cancel · "Review N applicants" · AI criteria |
| Chủ Issue / dev được chọn, sau selection | "Open workroom" (hoặc "Fund escrow" khi AWAITING_FUNDING) |
| Người ngoài, IN_PROGRESS/DISPUTED/COMPLETED | "Assigned to X", không lộ dữ liệu riêng |
| Admin | "Moderate"; "View dispute" khi disputed |

---

## 5. Trạng thái và badge (nguồn duy nhất: contract)

Mọi màn gắn với Issue render theo **state kết hợp** (IssueStatus off-chain + Phase on-chain + điều kiện thời gian). Bảng đầy đủ có trong màn "Escrow state matrix" của prototype.

| Code | Badge (EN) | VI | Tone | Ai hành động |
| --- | --- | --- | --- | --- |
| S0 | Draft | Bản nháp | neutral | Client |
| S1 | Open | Đang mở | success | Dev apply; client chọn |
| S2 | Awaiting funding | Chờ ký quỹ | attention | Client approve + deposit (24h) |
| S3 | Funded · awaiting delivery | Đã ký quỹ, chờ bàn giao | info | Dev submitWork |
| S4 | Delivered · in review | Đã bàn giao, chờ duyệt | progress | Client release; dev thay bản giao |
| S5 | Awaiting client review | Chờ khách hàng duyệt | progress | Client; dev không sửa được nữa |
| S6 | Review timeout · claimable | Quá hạn duyệt, có thể nhận | attention | Dev claimReviewTimeout |
| S7 | Missed deadline · refund | Trễ hạn, có thể hoàn tiền | danger | Client claimMissedDeliveryRefund |
| S8 | Settlement proposed | Đề xuất thỏa thuận | attention | Counterparty accept; proposer revoke |
| D1 | Evidence window | Thời gian nộp bằng chứng | attention | Counterparty nộp evidence (72h) |
| D2 | Awaiting arbiter | Chờ trọng tài | progress | Arbiter Safe |
| D3 / R4 | Arbiter timeout · 50/50 | Trọng tài quá hạn, chia 50/50 | danger | Bất kỳ ai |
| R1 | Initial ruling · challenge window | Phán quyết sơ bộ | attention | Bên thua challenge (7 ngày, 1 lần) |
| R2 / R6 | Ruling executable | Sẵn sàng thực thi | attention | Bất kỳ ai finalizeRuling |
| R3 | Challenged | Đã phản đối | danger | Arbiter Safe final ruling |
| R5 | Final ruling · notice | Phán quyết cuối | attention | Chờ 24h |
| T | Resolved · claimable → Paid out (IssueStatus `COMPLETED` + `outcome`) | Có tiền chờ nhận → Đã nhận | success | Mỗi bên claim(); client đánh giá |
| C1 | Cancelled | Đã hủy | muted | — |
| X | Deposits paused | Tạm dừng nạp | danger | Chỉ chặn deposit |

Khác: Application (Pending review / Selected / Not selected / Withdrawn), Submission (Submitted / Changes requested / Approved), PR (Open / Merged / Closed), Transaction (Waiting for signature / Submitted / Pending safe head / Confirmed / Failed), Test case (AI draft / Written by client / Approved; Critical / Normal / Low).

**Hằng số in lên UI** (lấy từ contract, không từ `packages/shared` hiện tại vì đang sai): phí 2,5% phần developer; review = deadline + 7 ngày; evidence 72h; challenge 7 ngày; final notice 24h; arbiter stall 30 ngày; reservation 24h (off-chain); token USDC 6 decimals trên Base Sepolia. Các hằng số này đã được chốt theo contract (QĐ-02, QĐ-03); Proposal sẽ được sửa cho khớp.

---

## 6. Dọn dẹp frontend hiện tại

- Bỏ mock data fallback im lặng ở marketplace và issue detail; khi API lỗi thì hiện ErrorState có retry, còn demo thì gắn nhãn rõ.
- Hero/landing phải hiện cho guest (hiện chỉ render cho admin).
- Bỏ status `ASSIGNED` không tồn tại (`issue-card.tsx:17`); thống nhất difficulty `Easy/Medium/Hard/Expert` theo shared constants.
- Bỏ tiền tố `$` cứng; dùng `TokenAmount`.
- Xóa component chết: `LeftSidebar`, `RightRail` (số liệu giả, copy "AI Arbiter trong 24h" sai Proposal), `TaskCard`, `MarketplaceSkeleton`, `ConnectWalletBtn`; bỏ link `/protocol/ai-guard` không tồn tại.
- Connect modal: dialog thật, bỏ `alert()`.
- Thống nhất ngôn ngữ qua i18n (hiện trộn EN/VI, nhiều chuỗi hard-code).
- Thêm UI cho API đã có: edit issue, withdraw application, dispute cho participant, public profile.
- Thêm `error.tsx`, `loading.tsx`, `not-found.tsx`.

## 7. Thứ tự làm frontend (đề xuất cho Trâm, Hân)

1. **Nền (tuần 1):** tokens + font + component mục 3 (StatusBadge, TokenAmount, PayoutBreakdown, TxStatusStepper, DeadlineChip, Hash); app shell (header + sidebar); dọn dẹp mục 6.
2. **Marketplace (tuần 1–2):** Landing, Marketplace (list/grid, filter), Issue detail public, Connect wallet, Public profile, How it works.
3. **Client flow (tuần 2–3):** Wizard tạo bounty + AI criteria, Applicants, Fund escrow (gắn `prepareEscrowDeposit`), Dashboard client.
4. **Workroom (tuần 3–4):** Workroom 2 góc nhìn, submit/release/timeout/settlement, Completion + claim, Wallet.
5. **Dispute + Admin (tuần 4–5):** Dispute room, evidence, Admin overview, disputes queue, ruling console (tạo payload Safe), escrows/contract, logs.
6. **E2E (Hân):** một kịch bản Playwright cho mỗi state trong bảng mục 5, chạy trên chain local (`seed:demo-chain`, BE-76).

Frontend phụ thuộc các task backend: BE-20 (`viewerCapabilities`), BE-33/34 (`PreparedCall`), BE-35 (TransactionIntent), BE-48 (claimable), BE-59b (`escrow:invalidate`). Trước khi backend xong có thể dựng UI với fixture theo đúng shape này.
