# 🩸 Bloody-Roar: Product Backlog & Sprint Plan

> **Tổng thời gian:** 5 Sprint × 2 tuần = 10 tuần
>
> **Team:** 5 thành viên (Kiên, Khôi, Hiếu, Hân, Trâm)
>
> **Stack:** Next.js Custom Server · PostgreSQL + Prisma · GraphQL Yoga + Pothos · Thirdweb Auth · EVM Solidity · Socket.io · Tailwind CSS v4 + shadcn/ui · AWS S3/Supabase Storage · Vercel AI SDK (Groq/Gemini free + OpenAI) · EAS Attestation
>

## MỤC LỤC

1. [Tổng Quan Epic &amp; User Stories](#1-tổng-quan-epic--user-stories)
2. [Sprint 0: Foundation](#2-sprint-0-foundation)
3. [Sprint 1: Auth + Marketplace Core](#3-sprint-1-auth--marketplace-core)
4. [Sprint 2: Escrow + Chat + AI Guard](#4-sprint-2-escrow--chat--ai-guard)
5. [Sprint 3: Dispute + GitHub Auth + Analytics](#5-sprint-3-dispute--github-auth--analytics)
6. [Sprint 4: Polish + Deploy](#6-sprint-4-polish--deploy)
7. [Tổng Kết MVP Theo Sprint](#7-tổng-kết-mvp-theo-sprint)

---

## 1. TỔNG QUAN EPIC & USER STORIES

### Epic 1: Foundation

> **Mục tiêu:** Thiết lập toàn bộ infrastructure, database, và môi trường phát triển.

| ID     | User Story                                                                                    | Priority |
| ------ | --------------------------------------------------------------------------------------------- | -------- |
| US-1.1 | Là Developer, tôi muốn có monorepo chuẩn để code BE và FE trong cùng project         | P0       |
| US-1.2 | Là Developer, tôi muốn có Prisma schema đầy đủ để tất cả member dùng chung types | P0       |
| US-1.3 | Là Developer, tôi muốn có Next.js custom server chạy GraphQL + Socket.io                 | P0       |
| US-1.4 | Là Developer, tôi muốn có design system trong Figma làm nền tảng cho UI                | P0       |
| US-1.5 | Là Developer, tôi muốn có Hardhat project để phát triển smart contract                | P0       |

### Epic 2: Authentication & User

> **Mục tiêu:** User có thể đăng nhập bằng ví Web3 và quản lý profile.

| ID     | User Story                                                                  | Priority |
| ------ | --------------------------------------------------------------------------- | -------- |
| US-2.1 | Là User, tôi muốn kết nối ví MetaMask/WalletConnect để đăng nhập | P0       |
| US-2.2 | Là User, tôi muốn xem và chỉnh sửa profile (tên, avatar, bio)        | P0       |
| US-2.3 | Là User, tôi muốn session được duy trì khi reload trang              | P0       |
| US-2.4 | Là User, tôi muốn thấy reputation score của mình và người khác    | P1       |

### Epic 3: Marketplace

> **Mục tiêu:** Client đăng task, Developer duyệt và ứng tuyển.

| ID     | User Story                                                                                    | Priority |
| ------ | --------------------------------------------------------------------------------------------- | -------- |
| US-3.1 | Là Client, tôi muốn đăng task với tiêu đề, mô tả, category, bounty                 | P0       |
| US-3.2 | Là Developer, tôi muốn duyệt danh sách task với filter (category, bounty range, status) | P0       |
| US-3.3 | Là Developer, tôi muốn tìm kiếm task theo từ khóa                                      | P1       |
| US-3.4 | Là Developer, tôi muốn xem chi tiết task và ứng tuyển                                  | P0       |
| US-3.5 | Là Client, tôi muốn xem danh sách ứng viên và chọn Developer                          | P0       |
| US-3.6 | Là Client, tôi muốn hủy task khi chưa có ai được assign                              | P1       |

### Epic 4: Smart Contract Escrow

> **Mục tiêu:** Thanh toán trustless qua smart contract trên **Base Sepolia (L2)**.

| ID     | User Story                                                                         | Priority |
| ------ | ---------------------------------------------------------------------------------- | -------- |
| US-4.1 | Là Client, tôi muốn ký EIP-712 off-chain khi đăng task (không tốn gas)     | P0       |
| US-4.2 | Là Client, tôi muốn nạp bounty on-chain khi chọn Developer                    | P0       |
| US-4.3 | Là Developer, tôi muốn nhận tiền tự động khi Client approve                | P0       |
| US-4.4 | Là Developer, tôi muốn claim tiền nếu Client im lặng sau 30 ngày            | P1       |
| US-4.5 | Là Client + Developer, tôi muốn hủy task và nhận refund nếu cả 2 đồng ý | P1       |
| US-4.6 | Là Client/Developer, tôi muốn raise dispute khi có tranh chấp                 | P0       |
| US-4.7 | Là Arbiter, tôi muốn đề xuất tỷ lệ payout khi dispute xảy ra              | P0       |
| US-4.8 | Là Admin, tôi muốn pause contract trong trường hợp khẩn cấp                | P2       |

### Epic 5: Real-time Chat

> **Mục tiêu:** Client và Developer chat real-time trong từng task.

| ID     | User Story                                                                  | Priority |
| ------ | --------------------------------------------------------------------------- | -------- |
| US-5.1 | Là User, tôi muốn chat real-time với người kia trong task             | P0       |
| US-5.2 | Là User, tôi muốn gửi file trong chat (kéo thả)                       | P1       |
| US-5.3 | Là User, tôi muốn xem code preview ngay trong chat                       | P2       |
| US-5.4 | Là User, tôi muốn lịch sử chat được lưu và load khi mở lại task | P0       |

### Epic 6: AI Guard

> **Mục tiêu:** AI tự động phát hiện và che thông tin nhạy cảm trong chat.

| ID     | User Story                                                                        | Priority |
| ------ | --------------------------------------------------------------------------------- | -------- |
| US-6.1 | Là System, tôi muốn tự động phát hiện API keys/private keys trong chat    | P0       |
| US-6.2 | Là System, tôi muốn tự động phát hiện PII (email, phone) trong ngữ cảnh | P0       |
| US-6.3 | Là Developer, tôi muốn biết khi nào message bị AI chỉnh sửa               | P1       |

### Epic 7: Dispute Resolution

> **Mục tiêu:** AI hỗ trợ Admin phân xử tranh chấp.

| ID     | User Story                                                                   | Priority |
| ------ | ---------------------------------------------------------------------------- | -------- |
| US-7.1 | Là User, tôi muốn raise dispute và bị đóng băng tiền trong escrow   | P0       |
| US-7.2 | Là Admin, tôi muốn xem AI report phân tích dispute                      | P0       |
| US-7.3 | Là Admin, tôi muốn đề xuất tỷ lệ payout và có 24h challenge period | P0       |
| US-7.4 | Là User, tôi muốn challenge resolution nếu không đồng ý              | P1       |

### Epic 8: GitHub Auth (KYC) & Integration

> **Mục tiêu:** Xác thực user qua GitHub OAuth, liên kết repo, auto-payment khi PR merged.

| ID     | User Story                                                         | Priority |
| ------ | ------------------------------------------------------------------ | -------- |
| US-8.1 | Là User, tôi muốn kết nối GitHub để được verify (KYC)    | P0       |
| US-8.2 | Là User, tôi muốn thấy verified badge sau khi kết nối GitHub | P0       |
| US-8.3 | Là Client, tôi muốn liên kết GitHub repo với task            | P1       |
| US-8.4 | Là System, tôi muốn auto-pay khi PR được merge               | P2       |

### Epic 9: Admin & Analytics

> **Mục tiêu:** Admin quản lý platform, xem thống kê.

| ID     | User Story                                                                   | Priority |
| ------ | ---------------------------------------------------------------------------- | -------- |
| US-9.1 | Là Admin, tôi muốn xem dashboard tổng quan (tasks, users, revenue)       | P1       |
| US-9.2 | Là Admin, tôi muốn quản lý users (ban, xem KYC status)                  | P1       |
| US-9.3 | Là User, tôi muốn xem thống kê cá nhân (tasks hoàn thành, earnings) | P1       |
| US-9.4 | Là Admin, tôi muốn xem dispute rate và resolution history                | P1       |

### Epic 10: Notifications

> **Mục tiêu:** Thông báo real-time trong app.

| ID      | User Story                                                                                          | Priority |
| ------- | --------------------------------------------------------------------------------------------------- | -------- |
| US-10.1 | Là User, tôi muốn nhận thông báo real-time (có ứng viên, được assign, dispute, payment) | P1       |
| US-10.2 | Là User, tôi muốn xem lịch sử thông báo                                                      | P1       |

### Epic 11: AI Test Case Generator

> **Mục tiêu:** Khi post bounty, AI tự sinh test cases để định nghĩa "done" rõ ràng, tránh tranh chấp scope.

| ID      | User Story                                                                                 | Priority |
| ------- | ------------------------------------------------------------------------------------------ | -------- |
| US-11.1 | Là Client, tôi muốn AI sinh test cases tự động khi đăng bounty                     | P0       |
| US-11.2 | Là Client, tôi muốn review và chỉnh sửa test cases trước khi publish               | P0       |
| US-11.3 | Là System, tôi muốn test cases trở thành "hợp đồng" đối chiếu khi Dev nộp bài | P0       |

### Epic 12: AI Multi-Agent Debate

> **Mục tiêu:** Nhiều AI agent tranh luận trước khi chốt verdict dispute, giảm bias.

| ID      | User Story                                                                                                  | Priority |
| ------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| US-12.1 | Là System, tôi muốn dispute được phân tích bởi nhiều agent (Advocate x2, Critic, Judge, Verifier) | P1       |
| US-12.2 | Là Admin, tôi muốn xem quá trình tranh luận của AI trước khi ra verdict                            | P1       |
| US-12.3 | Là System, tôi muốn verdict có giải trình rõ ràng (đúng sai từng bên)                           | P1       |

### Epic 13: Reputation & Credential (EAS Attestation)

> **Mục tiêu:** Reputation và certificate của Dev được NFT hóa / attest on-chain, chống fake danh tính, tăng độ nhận diện.

| ID      | User Story                                                                                  | Priority  |
| ------- | ------------------------------------------------------------------------------------------- | --------- |
| US-13.1 | Là System, tôi muốn tạo attestation on-chain khi Dev hoàn thành task (rating + skill) | P1 (v1.5) |
| US-13.2 | Là Dev, tôi muốn show reputation on-chain trên profile                                  | P1 (v1.5) |
| US-13.3 | Là System, tôi muốn revoke attestation khi phát hiện gian lận                         | P2 (v1.5) |
| US-13.4 | Là System, tôi muốn chặn Sybil/fake account (Gitcoin Passport)                          | P2 (v2)   |

### Epic 14: Docker Sandbox — Dời sang v2

> **Lý do:** Giảm độ phức tạp cho MVP v1. Tập trung vào core flow: marketplace → escrow → chat → dispute.
>
> Các user story sau được dời sang v2:
>
> - Developer code trong VSCode trên browser (code-server)
> - Client thấy trạng thái nhưng không thấy code (asymmetric visibility)
> - CI/CD tự động chạy test khi Dev nộp code
> - Blackbox trace: ghi terminal commands + file changes
> - Oracle/Relayer tự động giải ngân khi test pass

> **Impact:** Escrow contract vẫn có Oracle/Relayer mechanism, nhưng trigger sẽ là manual/admin approve thay vì CI/CD auto. Trong v2 sẽ tích hợp CI/CD vào Oracle.

---

## 2. SPRINT 0: FOUNDATION

> **Thời gian:** Tuần 1
>
> **Mục tiêu:** Toàn bộ infrastructure sẵn sàng để bắt đầu code.
>
> **MVP Sprint 0:** Monorepo chạy được, Prisma schema hoàn chỉnh, Next.js custom server chạy GraphQL + Socket.io, Hardhat project, Design system Figma + Component library base.

---

### Sprint 0 Backlog

#### S0-EPIC-FND: Foundation Setup

| Task ID             | Task                                             | Owner | Estimate | Deps      | AC (Acceptance Criteria)                                                           |
| ------------------- | ------------------------------------------------ | ----- | -------- | --------- | ---------------------------------------------------------------------------------- |
| **S0-FND-01** | Khởi tạo monorepo với Bun workspaces          | Khôi | 2h       | —        | `bun install` thành công, workspace `apps/*` và `packages/*` hoạt động |
| **S0-FND-02** | Khởi tạo`packages/shared`                    | Khôi | 1h       | S0-FND-01 | Package export được types                                                       |
| **S0-FND-03** | Thiết kế Prisma schema                         | Khôi | 6h       | S0-FND-02 | 10+ models với relations,`prisma migrate dev` thành công                      |
| **S0-FND-04** | Seed database                                    | Khôi | 2h       | S0-FND-03 | `bun run seed` tạo admin + sample data                                          |
| **S0-FND-05** | Docker Compose PostgreSQL                        | Khôi | 1h       | —        | `docker compose up` → PostgreSQL chạy port 5432                                |
| **S0-FND-06** | Khởi tạo Next.js app + custom server           | Khôi | 4h       | S0-FND-01 | `bun run dev` → Next.js chạy port 3000                                         |
| **S0-FND-07** | Attach GraphQL Yoga vào custom server           | Khôi | 3h       | S0-FND-06 | `POST /api/graphql` trả về Hello World query                                   |
| **S0-FND-08** | Attach Socket.io vào custom server              | Khôi | 2h       | S0-FND-06 | Client connect được socket                                                      |
| **S0-FND-09** | Cấu hình Tailwind CSS v4 + shadcn/ui           | Khôi | 1h       | S0-FND-06 | `globals.css` import Tailwind, shadcn/ui button render được                   |
| **S0-FND-10** | Cấu hình TypeScript strict + ESLint + Prettier | Khôi | 1h       | S0-FND-06 | `bun run lint` và `bun run typecheck` chạy qua                               |
| **S0-FND-11** | Cấu hình Pino logger                           | Khôi | 1h       | S0-FND-06 | Request log format JSON                                                            |
| **S0-FND-12** | Tạo`.env.example` với tất cả biến         | Khôi | 1h       | S0-FND-06 | Template có comment giải thích                                                  |
| **S0-FND-13** | Review Prisma schema                             | Hiếu | 1h       | S0-FND-03 | Feedback cho Khôi                                                                 |
| **S0-FND-14** | Hỗ trợ setup Next.js server                    | Hiếu | 2h       | S0-FND-06 | Server hoạt động                                                                |
| **S0-FND-15** | Research GraphQL Yoga + Pothos                   | Hiếu | 2h       | —        | Knowledge base sẵn sàng                                                          |

#### S0-EPIC-SC: Smart Contract Setup

| Task ID            | Task                                                   | Owner | Estimate | Deps     | AC                                             |
| ------------------ | ------------------------------------------------------ | ----- | -------- | -------- | ---------------------------------------------- |
| **S0-SC-01** | Khởi tạo Hardhat project                             | Kiên | 1h       | —       | `npx hardhat compile` thành công           |
| **S0-SC-02** | Cấu hình multi-network (localhost, sepolia, mainnet) | Kiên | 1h       | S0-SC-01 | Deploy script hoạt động trên localhost     |
| **S0-SC-03** | Cài OpenZeppelin Contracts v5                         | Kiên | 0.5h     | S0-SC-01 | Import`@openzeppelin/contracts` thành công |

#### S0-EPIC-AI: AI Research & Setup

| Task ID            | Task                                       | Owner | Estimate | Deps     | AC                                             |
| ------------------ | ------------------------------------------ | ----- | -------- | -------- | ---------------------------------------------- |
| **S0-AI-01** | Đăng ký OpenAI API key + set up billing | Khôi | 1h       | —       | API key hoạt động, gọi được GPT-4o-mini |
| **S0-AI-02** | Research Vercel AI SDK + viết sample      | Khôi | 3h       | S0-AI-01 | Sample streaming response hoạt động         |
| **S0-AI-03** | Tổng hợp PII/Secret detection patterns   | Khôi | 3h       | —       | 20+ regex patterns document                    |
| **S0-AI-04** | Tạo thư mục`prompts/` trong repo      | Khôi | 0.5h     | —       | Cấu trúc thư mục + template file           |

#### S0-EPIC-DSN: Design System

| Task ID             | Task                                                                        | Owner | Estimate | Deps                 | AC                                                                                             |
| ------------------- | --------------------------------------------------------------------------- | ----- | -------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| **S0-DSN-01** | Thiết kế Design Tokens (colors, typography, spacing, shadows)             | Hân  | 4h       | —                   | Figma file với tokens documented                                                              |
| **S0-DSN-02** | Thiết kế Layout System (navbar, sidebar, content, mobile)                 | Hân  | 3h       | S0-DSN-01            | Figma layout cho desktop + mobile                                                              |
| **S0-DSN-03** | Thiết kế Component variants (button, input, card, dialog, badge, table)   | Hân  | 4h       | S0-DSN-01            | Figma components với variants                                                                 |
| **S0-DSN-04** | Customize shadcn/ui theme khớp design tokens                               | Trâm | 3h       | S0-DSN-01, S0-FND-09 | CSS variables override                                                                         |
| **S0-DSN-05** | Cài đặt toàn bộ shadcn/ui components                                   | Trâm | 2h       | S0-FND-09            | Button, Input, Select, Dialog, Card, Table, Badge, Tabs, Toast, DropdownMenu, Avatar, Skeleton |
| **S0-DSN-06** | Xây dựng Form components (FormField, FormInput, FormSelect, FormTextarea) | Trâm | 3h       | S0-DSN-05            | React Hook Form + Zod integration                                                              |
| **S0-DSN-07** | Cấu hình accessibility tools (axe-core, eslint a11y)                      | Trâm | 1h       | S0-FND-09            | Lint báo lỗi a11y                                                                            |
| **S0-DSN-08** | Thiết kế Loading + Error + Empty states                                   | Hân  | 2h       | S0-DSN-01            | Design patterns cho tất cả states                                                            |

---

## 3. SPRINT 1: AUTH + MARKETPLACE CORE

> **Thời gian:** Tuần 2-3
>
> **Mục tiêu:** User đăng nhập bằng ví Web3, đăng task, duyệt marketplace, ứng tuyển.
>
> **MVP Sprint 1:** User login với ví → xem/sửa profile → đăng task → duyệt danh sách task → apply → client chọn developer. Escrow contract hoàn chỉnh (14+ tests).

---

### Sprint 1 Backlog

#### S1-EPIC-AUTH: Authentication & User Profile

| Task ID              | Task                                             | Owner | Estimate | Deps                   | AC                                                  |
| -------------------- | ------------------------------------------------ | ----- | -------- | ---------------------- | --------------------------------------------------- |
| **S1-AUTH-01** | Cấu hình Thirdweb Auth provider                | Hiếu | 2h       | S0-FND-06              | Thirdweb provider hoạt động,`useConnect` chạy |
| **S1-AUTH-02** | Viết Auth middleware cho GraphQL                | Hiếu | 2h       | S1-AUTH-01             | Query không có JWT → lỗi Unauthorized           |
| **S1-AUTH-03** | Viết GraphQL Context factory (inject DB + user) | Hiếu | 1h       | S1-AUTH-02             | Context có`user` và `db`                      |
| **S1-AUTH-04** | Viết User module — Pothos types                | Hiếu | 1h       | S0-FND-07              | Types: User                                         |
| **S1-AUTH-05** | Viết User query`me` và `user(id)`          | Hiếu | 1h       | S1-AUTH-04             | Query trả về user đúng                          |
| **S1-AUTH-06** | Viết User mutation`updateProfile`             | Hiếu | 2h       | S1-AUTH-05             | Update name, email, bio, avatar                     |
| **S1-AUTH-07** | Implement Auth pages UI design                   | Hân  | 2h       | S0-DSN-03              | Figma: Login + ConnectWallet                        |
| **S1-AUTH-08** | Implement Auth pages code                        | Trâm | 3h       | S1-AUTH-07, S1-AUTH-01 | ConnectWallet button, redirect                      |
| **S1-AUTH-09** | Hỗ trợ Hiếu review Thirdweb Auth middleware   | Kiên | 1h       | S1-AUTH-02             | Code review                                         |

#### S1-EPIC-MKP: Marketplace Core

| Task ID             | Task                                           | Owner | Estimate | Deps                  | AC                                                 |
| ------------------- | ---------------------------------------------- | ----- | -------- | --------------------- | -------------------------------------------------- |
| **S1-MKP-01** | Viết Issue module — Pothos types             | Hiếu | 1h       | S1-AUTH-04            | Types: Issue, IssueStatus, IssueFilter, Pagination |
| **S1-MKP-02** | Viết`issues` query (filter, sort, paginate) | Hiếu | 3h       | S1-MKP-01             | Filter status/category/bounty, cursor pagination   |
| **S1-MKP-03** | Viết`issue(id)` query                       | Hiếu | 1h       | S1-MKP-01             | Trả về issue + client + applicants               |
| **S1-MKP-04** | Viết`createIssue` mutation                  | Hiếu | 2h       | S1-MKP-01             | Validate Zod, insert DB                            |
| **S1-MKP-05** | Viết`updateIssue` mutation                  | Hiếu | 1h       | S1-MKP-04             | Client-only update                                 |
| **S1-MKP-06** | Viết`cancelIssue` mutation                  | Hiếu | 1h       | S1-MKP-04             | Status = CANCELLED nếu chưa assign               |
| **S1-MKP-07** | Viết Application module                       | Hiếu | 2h       | S1-MKP-03             | `applyIssue`, `getApplicants`                  |
| **S1-MKP-08** | Viết`assignDeveloper` mutation              | Hiếu | 2h       | S1-MKP-07             | Client-only, status → IN_PROGRESS                 |
| **S1-MKP-09** | Viết Search & Filter logic                    | Hiếu | 2h       | S1-MKP-02             | Prisma`where` + `orderBy`                      |
| **S1-MKP-10** | Thiết kế Marketplace listing (grid, filter)  | Hân  | 3h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-11** | Thiết kế Issue Detail page                   | Hân  | 2h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-12** | Thiết kế Create Issue form (multi-step)      | Hân  | 2h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-13** | Thiết kế Dashboard page                      | Hân  | 2h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-14** | Thiết kế Profile page                        | Hân  | 2h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-15** | Thiết kế GitHub Auth badge UI                | Hân  | 1h       | S0-DSN-02             | Figma design                                       |
| **S1-MKP-16** | Implement Main Layout (navbar + sidebar)       | Trâm | 3h       | S0-DSN-05             | Responsive, mobile menu                            |
| **S1-MKP-17** | Implement Profile page                         | Trâm | 2h       | S1-MKP-14, S1-AUTH-05 | Edit form, avatar upload                           |
| **S1-MKP-18** | Implement Marketplace page                     | Trâm | 4h       | S1-MKP-10, S1-MKP-02  | Filter bar, cards, search, pagination, skeletons   |
| **S1-MKP-19** | Implement Issue Detail page                    | Trâm | 3h       | S1-MKP-11, S1-MKP-03  | Description, bounty, applicants, actions           |
| **S1-MKP-20** | Implement Create Issue form                    | Trâm | 4h       | S1-MKP-12, S1-MKP-04  | Multi-step, validation, submit                     |
| **S1-MKP-21** | Implement Dashboard page                       | Trâm | 3h       | S1-MKP-13             | My posted / working tabs, stats                    |
| **S1-MKP-22** | Implement GitHub Auth badge                    | Trâm | 1h       | S1-MKP-15             | Connect button → verified badge                   |
| **S1-MKP-23** | Hỗ trợ FE Web3 integration                   | Khôi | 2h       | S1-AUTH-01            | Code review, Thirdweb hooks                        |
| **S1-MKP-24** | Hỗ trợ BE marketplace logic                  | Kiên | 1h       | S1-MKP-04             | Code review                                        |

#### S1-EPIC-SC: Escrow Contract Development

| Task ID            | Task                                                 | Owner | Estimate | Deps     | AC                             |
| ------------------ | ---------------------------------------------------- | ----- | -------- | -------- | ------------------------------ |
| **S1-SC-01** | Thiết kế state machine diagram                     | Kiên | 1h       | —       | 5 states documented            |
| **S1-SC-02** | Viết`BloodyRoarEscrow.sol` — base                | Kiên | 2h       | S0-SC-03 | Contract skeleton compile      |
| **S1-SC-03** | Implement`deposit(issueId, worker)`                | Kiên | 3h       | S1-SC-02 | Lock funds, emit Deposited     |
| **S1-SC-04** | Implement`releaseFunds(issueId)`                   | Kiên | 1h       | S1-SC-03 | Client-only transfer           |
| **S1-SC-05** | Implement`mutualCancel(issueId)`                   | Kiên | 2h       | S1-SC-03 | Both sign → refund            |
| **S1-SC-06** | Implement`claimTimeout(issueId)`                   | Kiên | 1h       | S1-SC-03 | Worker claim after 30 days     |
| **S1-SC-07** | Implement`raiseDispute(issueId)`                   | Kiên | 1h       | S1-SC-03 | Either party, state = DISPUTED |
| **S1-SC-08** | Implement`proposeResolution(issueId, clientRatio)` | Kiên | 2h       | S1-SC-07 | Arbiter-only, 24h timelock     |
| **S1-SC-09** | Implement`challengeResolution(issueId)`            | Kiên | 1h       | S1-SC-08 | During 24h window              |
| **S1-SC-10** | Implement`executeResolution(issueId)`              | Kiên | 1h       | S1-SC-09 | After timelock, split funds    |
| **S1-SC-11** | Implement`pause()` / `unpause()`                 | Kiên | 1h       | S1-SC-02 | Owner-only circuit breaker     |
| **S1-SC-12** | Viết full unit tests (14+ cases)                    | Kiên | 4h       | S1-SC-10 | All tests pass, gas report     |

#### S1-EPIC-CHAT: Socket.io + Chat Setup

| Task ID              | Task                                          | Owner | Estimate | Deps                  | AC                                              |
| -------------------- | --------------------------------------------- | ----- | -------- | --------------------- | ----------------------------------------------- |
| **S1-CHAT-01** | Viết Socket.io auth middleware (JWT verify)  | Khôi | 1h       | S0-FND-08, S1-AUTH-01 | Disconnect if token invalid                     |
| **S1-CHAT-02** | Viết Room Management                         | Khôi | 2h       | S1-CHAT-01            | `join:task(issueId)`, `leave:task(issueId)` |
| **S1-CHAT-03** | Viết Message handler (save DB + broadcast)   | Khôi | 2h       | S1-CHAT-02            | Lưu Prisma, emit room                          |
| **S1-CHAT-04** | Viết File Upload endpoint (S3 presigned URL) | Khôi | 3h       | S0-FND-06             | `POST /api/upload` → S3 URL                  |

#### S1-EPIC-TST: Testing Setup

| Task ID             | Task                                | Owner | Estimate | Deps | AC                                    |
| ------------------- | ----------------------------------- | ----- | -------- | ---- | ------------------------------------- |
| **S1-TST-01** | Cài đặt Vitest + Testing Library | Trâm | 1h       | —   | `vitest run` thành công           |
| **S1-TST-02** | Cài đặt Playwright               | Hân  | 1h       | —   | `npx playwright test` chạy được |

---

## 4. SPRINT 2: ESCROW + CHAT + AI GUARD

> **Thời gian:** Tuần 4-5
>
> **Mục tiêu:** Escrow flow E2E (ký → deposit → release), chat real-time, AI Guard masking.
>
> **MVP Sprint 2:** Client ký EIP-712 → Client deposit on-chain khi assign → Client release funds → Developer nhận tiền. Chat real-time giữa 2 bên, AI tự động che secrets. Dispute raise + admin resolve.

---

### Sprint 2 Backlog

#### S2-EPIC-ESC: Escrow Integration

| Task ID             | Task                                               | Owner | Estimate | Deps                 | AC                                    |
| ------------------- | -------------------------------------------------- | ----- | -------- | -------------------- | ------------------------------------- |
| **S2-ESC-01** | Cấu hình Thirdweb SDK backend (connect contract) | Khôi | 1h       | S1-SC-12             | Gọi được contract từ server      |
| **S2-ESC-02** | Thiết kế EIP-712 typed data schema               | Kiên | 2h       | —                   | Domain, types, values spec            |
| **S2-ESC-03** | Viết helper`signCommitment()` (frontend)        | Kiên | 2h       | S2-ESC-02            | Ký → trả về signature             |
| **S2-ESC-04** | Viết`verifyCommitment()` on-chain               | Kiên | 2h       | S2-ESC-02            | Contract verify function              |
| **S2-ESC-05** | Viết Escrow Prisma model + migration              | Khôi | 1h       | S0-FND-03            | DB schema                             |
| **S2-ESC-06** | Viết Transaction logger                           | Khôi | 1h       | S2-ESC-05            | Lưu txHash sau mỗi on-chain tx      |
| **S2-ESC-07** | Viết Escrow GraphQL types                         | Hiếu | 1h       | S1-MKP-01            | Types: Escrow, EscrowStatus           |
| **S2-ESC-08** | Viết`depositToEscrow(issueId, developerId)`     | Hiếu | 3h       | S2-ESC-01, S2-ESC-03 | Gọi contract.deposit()               |
| **S2-ESC-09** | Viết`releaseFunds(issueId)` mutation            | Hiếu | 1h       | S2-ESC-08            | Gọi contract.releaseFunds()          |
| **S2-ESC-10** | Viết`cancelEscrow(issueId)` mutation            | Hiếu | 1h       | S2-ESC-08            | Gọi contract.mutualCancel()          |
| **S2-ESC-11** | Viết`raiseDispute(issueId, reason)` mutation    | Hiếu | 1h       | S2-ESC-08            | Gọi contract.raiseDispute()          |
| **S2-ESC-12** | Tích hợp EIP-712 signing flow FE                 | Khôi | 2h       | S2-ESC-03            | Thirdweb SDK → ký → gửi BE        |
| **S2-ESC-13** | Viết Oracle/Relayer script                        | Kiên | 3h       | S2-ESC-08            | Nhận event → ký tx → releaseFunds |
| **S2-ESC-14** | Deploy Escrow lên testnet + verify                | Kiên | 2h       | S1-SC-12             | Contract address + verified           |
| **S2-ESC-15** | Hỗ trợ Hiếu review Escrow resolvers             | Kiên | 1h       | S2-ESC-08            | Code review                           |

#### S2-EPIC-CHAT: Chat Implementation

| Task ID              | Task                             | Owner | Estimate | Deps                   | AC                                         |
| -------------------- | -------------------------------- | ----- | -------- | ---------------------- | ------------------------------------------ |
| **S2-CHAT-01** | Viết File attachment trong chat | Khôi | 2h       | S1-CHAT-04, S1-CHAT-03 | Upload → S3 URL → gửi qua chat          |
| **S2-CHAT-02** | Viết Chat GraphQL module        | Hiếu | 2h       | S1-CHAT-03             | Query`messages(issueId)`, load history   |
| **S2-CHAT-03** | Thiết kế Chat UI               | Hân  | 3h       | S1-MKP-11              | Figma: sidebar chat, bubbles, file preview |
| **S2-CHAT-04** | Implement Chat UI                | Trâm | 4h       | S2-CHAT-03, S2-CHAT-02 | Auto-scroll, file upload, Monaco preview   |
| **S2-CHAT-05** | Thiết kế Escrow UI components  | Hân  | 2h       | S1-MKP-11              | Figma: deposit modal, status timeline      |
| **S2-CHAT-06** | Implement Escrow UI components   | Trâm | 3h       | S2-CHAT-05, S2-ESC-08  | Deposit → wallet tx → status             |

#### S2-EPIC-AI: AI Guard Implementation

| Task ID            | Task                                         | Owner | Estimate | Deps                 | AC                                       |
| ------------------ | -------------------------------------------- | ----- | -------- | -------------------- | ---------------------------------------- |
| **S2-AI-01** | Viết Regex pattern library (20+ patterns)   | Khôi | 3h       | S0-AI-03             | `patterns.ts`                          |
| **S2-AI-02** | Viết`RegexScanner` class                  | Khôi | 2h       | S2-AI-01             | Detect → mask                           |
| **S2-AI-03** | Viết LLM system prompt (PII detection)      | Khôi | 2h       | S0-AI-04             | Prompt trả về masked JSON              |
| **S2-AI-04** | Viết`AIGuardService` orchestration class  | Khôi | 3h       | S2-AI-02, S2-AI-03   | Regex → LLM → response                 |
| **S2-AI-05** | Tích hợp AIGuard vào Socket.io middleware | Khôi | 2h       | S2-AI-04, S1-CHAT-03 | Message auto-mask trước broadcast      |
| **S2-AI-06** | Viết 50+ AI Guard test cases                | Khôi | 3h       | S2-AI-05             | API keys, private keys, emails → masked |
| **S2-AI-07** | Đánh giá accuracy (FP/FN rate)            | Khôi | 2h       | S2-AI-06             | Accuracy >95%                            |

#### S2-EPIC-MDL: Model Router (Groq/Gemini free)

| Task ID             | Task                                            | Owner | Estimate | Deps                 | AC                                                                              |
| ------------------- | ----------------------------------------------- | ----- | -------- | -------------------- | ------------------------------------------------------------------------------- |
| **S2-MDL-01** | Đăng ký Groq API key (free)                  | Khôi | 1h       | —                   | Groq credentials hoạt động                                                   |
| **S2-MDL-02** | Đăng ký Google AI Studio (Gemini Flash free) | Khôi | 1h       | —                   | Gemini credentials hoạt động                                                 |
| **S2-MDL-03** | Viết`ModelRouter` class                      | Khôi | 3h       | S2-MDL-01, S2-MDL-02 | Chọn model theo task: Guard→llama-8b, TestGen→llama-70b, Judge→gpt-oss-120b |
| **S2-MDL-04** | Cấu hình Vercel AI SDK multi-provider         | Khôi | 2h       | S2-MDL-03            | Groq + Gemini + OpenAI cùng SDK                                                |
| **S2-MDL-05** | Viết fallback logic                            | Khôi | 1h       | S2-MDL-04            | Model lỗi → chuyển dự phòng                                                |

#### S2-EPIC-TSTGEN: AI Test Case Generator

| Task ID                | Task                                                 | Owner | Estimate | Deps                    | AC                                                                         |
| ---------------------- | ---------------------------------------------------- | ----- | -------- | ----------------------- | -------------------------------------------------------------------------- |
| **S2-TSTGEN-01** | Thiết kế prompt cho Test Gen                       | Khôi | 2h       | S0-AI-04                | Phân tích mô tả bug → test cases                                      |
| **S2-TSTGEN-02** | Viết`TestGenerator` class                         | Khôi | 3h       | S2-TSTGEN-01, S2-MDL-03 | Input: desc → Output:`{testCases[], acceptanceCriteria[], edgeCases[]}` |
| **S2-TSTGEN-03** | Xử lý structured output                            | Khôi | 2h       | S2-TSTGEN-02            | JSON schema (given/when/then)                                              |
| **S2-TSTGEN-04** | Viết Prisma model cho Test Cases                    | Khôi | 1h       | S0-FND-03               | DB schema test case                                                        |
| **S2-TSTGEN-05** | Viết GraphQL mutation`generateTestCases(issueId)` | Hiếu | 2h       | S2-TSTGEN-02            | AI resolver                                                                |
| **S2-TSTGEN-06** | Viết UI review test cases                           | Trâm | 3h       | S2-TSTGEN-05            | Client approve/chỉnh sửa trước publish                                 |

#### S2-EPIC-DSP: Dispute Module

| Task ID             | Task                                       | Owner | Estimate | Deps                 | AC                                             |
| ------------------- | ------------------------------------------ | ----- | -------- | -------------------- | ---------------------------------------------- |
| **S2-DSP-01** | Viết Dispute GraphQL types                | Hiếu | 1h       | S1-MKP-01            | Types: Dispute, Resolution                     |
| **S2-DSP-02** | Viết Dispute Queries + Mutations          | Hiếu | 2h       | S2-DSP-01            | `getDispute`, `raiseDispute`               |
| **S2-DSP-03** | Viết`proposeResolution(issueId, ratio)` | Hiếu | 1h       | S2-ESC-11            | Admin-only                                     |
| **S2-DSP-04** | Viết`challengeResolution(issueId)`      | Hiếu | 1h       | S2-DSP-03            | Gọi contract.challengeResolution()            |
| **S2-DSP-05** | Thiết kế Admin Dispute Dashboard         | Hân  | 3h       | —                   | Figma: case list, AI report, resolution slider |
| **S2-DSP-06** | Implement Admin Dispute Dashboard          | Trâm | 3h       | S2-DSP-05, S2-DSP-02 | Case table, AI report view                     |

#### S2-EPIC-TST: E2E Testing Sprint 1

| Task ID             | Task                                          | Owner | Estimate | Deps                   | AC                                    |
| ------------------- | --------------------------------------------- | ----- | -------- | ---------------------- | ------------------------------------- |
| **S2-TST-01** | Viết E2E test Auth flow                      | Hân  | 2h       | S1-AUTH-01             | Login → redirect → session          |
| **S2-TST-02** | Viết E2E test Marketplace (create → browse) | Hân  | 2h       | S1-MKP-04              | Tạo issue → thấy trong listing     |
| **S2-TST-03** | Viết test cho UI Components                  | Trâm | 2h       | S0-DSN-05              | Button, Input, Dialog render + events |
| **S2-TST-04** | Viết test cho Auth hooks                     | Trâm | 2h       | S1-AUTH-02             | `useAuth`, `useUser`              |
| **S2-TST-05** | Hỗ trợ FE Chat + Escrow implementation      | Khôi | 2h       | S2-CHAT-04, S2-CHAT-06 | Code review, Web3 integration         |
| **S2-TST-06** | Hỗ trợ BE Escrow logic                      | Kiên | 1h       | S2-ESC-08              | Code review                           |

---

## 5. SPRINT 3: DISPUTE + GITHUB AUTH + ANALYTICS

> **Thời gian:** Tuần 6-7
>
> **Mục tiêu:** AI Dispute Assistant phân tích tranh chấp, GitHub Auth verify user, Admin dashboard + analytics.
>
> **MVP Sprint 3:** AI Dispute Assistant hoạt động (phân tích → đề xuất payout), GitHub OAuth login → verified badge, Admin dashboard + user analytics, automated testing đầy đủ.

---

### Sprint 3 Backlog

#### S3-EPIC-AI: AI Multi-Agent Debate (Dispute Assistant)

| Task ID            | Task                                              | Owner         | Estimate | Deps                     | AC                                                              |
| ------------------ | ------------------------------------------------- | ------------- | -------- | ------------------------ | --------------------------------------------------------------- |
| **S3-AI-01** | Thiết kế Dispute prompt chain                   | Khôi         | 2h       | S2-AI-04                 | Multi-step: summarize → debate → verdict                      |
| **S3-AI-02** | Viết`DisputeDataCollector` class               | Khôi         | 3h       | S2-CHAT-02, S2-TSTGEN-04 | Gom: issue desc + chat log + test cases + evidence              |
| **S3-AI-03** | Thiết kế Multi-Agent Debate ("dive")            | Khôi         | 3h       | S3-AI-02                 | 5 agent: Client Advocate, Dev Advocate, Critic, Judge, Verifier |
| **S3-AI-04** | Viết prompt cho 5 agent                          | Khôi         | 4h       | S3-AI-03                 | 5 persona prompts                                               |
| **S3-AI-05** | Viết`DebateOrchestrator` class                 | Khôi         | 4h       | S3-AI-03, S2-MDL-03      | Điều phối vòng tranh luận (config số vòng)               |
| **S3-AI-06** | Viết`DisputeAnalyzer` class (dùng debate)     | Khôi         | 3h       | S3-AI-05                 | Debate → verdict`{suggestedClientRatio, reasoning}`          |
| **S3-AI-07** | Viết`analyzeDispute(issueId)` GraphQL resolver | Hiếu         | 2h       | S3-AI-06, S2-DSP-02      | AI debate resolver                                              |
| **S3-AI-08** | Viết 10+ Dispute test scenarios                  | Khôi         | 2h       | S3-AI-06                 | Scope creep, malicious tests, ghosting                          |
| **S3-AI-09** | Hỗ trợ Kiên verdict → on-chain                | Khôi + Kiên | 2h       | S3-AI-06, S2-ESC-11      | Verdict ratio → proposeResolution()                            |
| **S3-AI-10** | Đánh giá debate vs 1 model đơn lẻ           | Khôi         | 2h       | S3-AI-08                 | Accuracy, fairness report                                       |
| **S3-AI-11** | Hỗ trợ Khôi thiết kế dispute flow            | Kiên         | 1h       | S3-AI-06                 | Contract flow review                                            |

#### S3-EPIC-GH: GitHub Auth (KYC) + Integration

| Task ID            | Task                                            | Owner | Estimate | Deps                | AC                                          |
| ------------------ | ----------------------------------------------- | ----- | -------- | ------------------- | ------------------------------------------- |
| **S3-GH-01** | Đăng ký GitHub OAuth App                     | Hiếu | 2h       | —                  | Client ID + secret, callback URL            |
| **S3-GH-02** | Viết GitHub OAuth flow                         | Hiếu | 2h       | S3-GH-01            | Login with GitHub → verify → link account |
| **S3-GH-03** | Viết`linkGithub` GraphQL mutation            | Hiếu | 1h       | S3-GH-02            | Lưu GitHub username, verified = true       |
| **S3-GH-04** | Đăng ký GitHub App (webhook)                 | Hiếu | 2h       | —                  | App ID + private key + webhook secret       |
| **S3-GH-05** | Cài Octokit + cấu hình                       | Hiếu | 1h       | S3-GH-04            | Gọi GitHub API thành công                |
| **S3-GH-06** | Viết Webhook handler (`pull_request.merged`) | Hiếu | 2h       | S3-GH-05            | Nhận webhook → verify → lưu DB          |
| **S3-GH-07** | Viết auto-payment trigger                      | Hiếu | 2h       | S3-GH-06, S2-ESC-09 | PR merged → gọi releaseFunds              |
| **S3-GH-08** | Viết`linkGithubRepo` GraphQL mutation        | Hiếu | 1h       | S3-GH-05            | Lưu repo URL + installation ID             |
| **S3-GH-09** | Implement GitHub Auth UI (verified badge)       | Trâm | 2h       | S1-MKP-22, S3-GH-02 | Connect → verified                         |
| **S3-GH-10** | Implement GitHub Repo linking UI                | Trâm | 2h       | S3-GH-08            | Select repo for task                        |

#### S3-EPIC-ANL: Analytics & Admin

| Task ID             | Task                                        | Owner | Estimate | Deps                 | AC                                                 |
| ------------------- | ------------------------------------------- | ----- | -------- | -------------------- | -------------------------------------------------- |
| **S3-ANL-01** | Viết Analytics SQL queries (aggregate)     | Hiếu | 3h       | S1-MKP-02            | Task count, revenue, dispute rate, user growth     |
| **S3-ANL-02** | Viết Analytics GraphQL queries             | Hiếu | 1h       | S3-ANL-01            | `adminStats`, `userStats(userId)`              |
| **S3-ANL-03** | Viết Notification Prisma model + migration | Hiếu | 0.5h     | S0-FND-03            | Notification model                                 |
| **S3-ANL-04** | Viết`createNotification()` service       | Hiếu | 1h       | S3-ANL-03            | Lưu DB + emit socket                              |
| **S3-ANL-05** | Gắn notification triggers vào events      | Hiếu | 2h       | S3-ANL-04            | New applicant, assigned, dispute, paid             |
| **S3-ANL-06** | Viết Notification GraphQL queries          | Hiếu | 1h       | S3-ANL-03            | `notifications`, `unreadCount`, `markAsRead` |
| **S3-ANL-07** | Viết Admin resolvers                       | Hiếu | 1h       | S3-ANL-02            | Admin-only: all users, all disputes                |
| **S3-ANL-08** | Thiết kế Admin Dashboard (charts)         | Hân  | 3h       | —                   | Figma: stat cards, charts                          |
| **S3-ANL-09** | Thiết kế Analytics page                   | Hân  | 2h       | —                   | Figma: personal + platform stats                   |
| **S3-ANL-10** | Thiết kế User Management                  | Hân  | 1h       | —                   | Figma: user table, ban, verified filter            |
| **S3-ANL-11** | Implement Admin Dashboard                   | Trâm | 3h       | S3-ANL-08, S3-ANL-02 | Charts (Tremor/Recharts), stat cards               |
| **S3-ANL-12** | Implement Analytics page                    | Trâm | 2h       | S3-ANL-09, S3-ANL-02 | Personal stats + charts                            |
| **S3-ANL-13** | Implement User Management                   | Trâm | 2h       | S3-ANL-10, S3-ANL-07 | Table, ban button, verified filter                 |
| **S3-ANL-14** | Implement Notification UI                   | Trâm | 2h       | S3-ANL-06            | Bell icon + badge, dropdown, mark read             |

#### S3-EPIC-TST: Full Testing

| Task ID             | Task                                             | Owner | Estimate | Deps        | AC                                          |
| ------------------- | ------------------------------------------------ | ----- | -------- | ----------- | ------------------------------------------- |
| **S3-TST-01** | Viết test cho Marketplace queries               | Trâm | 2h       | S1-MKP-02   | `useIssues` filter, sort, paginate        |
| **S3-TST-02** | Viết test cho Chat hooks                        | Trâm | 2h       | S2-CHAT-02  | `useMessages`, socket events              |
| **S3-TST-03** | Viết test cho Form validation schemas           | Trâm | 2h       | S1-MKP-04   | CreateIssue, UpdateProfile — valid/invalid |
| **S3-TST-04** | Viết integration test Create → Apply → Assign | Trâm | 3h       | S1-MKP-08   | Mock API, full flow                         |
| **S3-TST-05** | Viết a11y audit tests                           | Trâm | 2h       | Tất cả UI | axe-core checks per page                    |
| **S3-TST-06** | Viết E2E test Apply + Assign flow               | Hân  | 2h       | S1-MKP-08   | Apply → client assign                      |
| **S3-TST-07** | Viết E2E test Chat flow                         | Hân  | 2h       | S2-CHAT-04  | Open chat → send → AI guard → receive    |
| **S3-TST-08** | Viết E2E test Escrow flow                       | Hân  | 3h       | S2-ESC-08   | Sign EIP-712 → deposit → release          |
| **S3-TST-09** | Viết E2E test Dispute flow                      | Hân  | 2h       | S3-AI-05    | Raise → AI analyze → admin resolve        |
| **S3-TST-10** | Viết E2E test GitHub Auth flow                  | Hân  | 2h       | S3-GH-02    | Connect GitHub → verified badge            |
| **S3-TST-11** | Hỗ trợ FE Admin + Analytics implementation     | Khôi | 2h       | S3-ANL-11   | Code review, API integration                |
| **S3-TST-12** | Hỗ trợ BE GitHub integration                   | Kiên | 1h       | S3-GH-06    | Code review                                 |

---

## 6. SPRINT 4: POLISH + DEPLOY

> **Thời gian:** Tuần 8-10
>
> **Mục tiêu:** Hoàn thiện tất cả tính năng, testing đầy đủ, deploy production.
>
> **MVP Sprint 4:** Full platform hoạt động: marketplace, escrow, chat, AI Guard, dispute, GitHub Auth, notifications, analytics, admin panel. Deployed + tested + documented.

---

### Sprint 4 Backlog

#### S4-EPIC-CICD: CI/CD + Deploy

| Task ID              | Task                                       | Owner    | Estimate | Deps       | AC                                    |
| -------------------- | ------------------------------------------ | -------- | -------- | ---------- | ------------------------------------- |
| **S4-CICD-01** | Viết GitHub Actions CI                    | Khôi    | 2h       | —         | Lint → Type-check → Vitest → Build |
| **S4-CICD-02** | Cấu hình Sentry error tracking           | Khôi    | 1h       | —         | Error log trên Sentry dashboard      |
| **S4-CICD-03** | Tạo production PostgreSQL (Neon/Supabase) | Khôi    | 1h       | —         | Connection string, pool config        |
| **S4-CICD-04** | Viết Dockerfile cho Next.js custom server | Khôi    | 1h       | —         | `docker build` thành công         |
| **S4-CICD-05** | Deploy app lên Railway/Fly.io             | Khôi    | 2h       | S4-CICD-04 | App chạy production URL              |
| **S4-CICD-06** | Cấu hình domain + SSL (Cloudflare)       | Khôi    | 1h       | S4-CICD-05 | HTTPS hoạt động                    |
| **S4-CICD-07** | Viết Health check endpoint                | Khôi    | 0.5h     | S4-CICD-05 | `GET /api/health` → status         |
| **S4-CICD-08** | Deploy smart contracts lên Production | Kiên    | 2h       | S1-SC-12   | Contracts deployed + verified |
| **S4-CICD-09** | Smoke test production                      | Cả team | 2h       | S4-CICD-05 | Tất cả flow chính hoạt động     |

#### S4-EPIC-POL: Polish

| Task ID             | Task                                        | Owner | Estimate | Deps        | AC                                   |
| ------------------- | ------------------------------------------- | ----- | -------- | ----------- | ------------------------------------ |
| **S4-POL-01** | Tối ưu gas Escrow contract                | Kiên | 2h       | S1-SC-12    | Gas report < bản cũ                |
| **S4-POL-02** | Contract security audit checklist           | Kiên | 2h       | S4-POL-01   | Reentrancy, overflow, access control |
| **S4-POL-03** | Tinh chỉnh AI Guard accuracy               | Khôi | 2h       | S2-AI-07    | FP < 3%, FN < 1%                     |
| **S4-POL-04** | Tinh chỉnh Dispute Assistant prompt        | Khôi | 2h       | S3-AI-07    | Output consistency > 90%             |
| **S4-POL-05** | Viết tài liệu AI integration             | Khôi | 2h       | S4-POL-04   | Prompt engineering guide             |
| **S4-POL-06** | Responsive polish (all pages mobile)        | Trâm | 4h       | S3-TST-05   | Tất cả pages responsive            |
| **S4-POL-07** | Loading skeletons + empty states            | Trâm | 3h       | Tất cả UI | Không page nào flash trắng        |
| **S4-POL-08** | Error boundaries + global error handling    | Trâm | 2h       | Tất cả UI | Toast/fallback, không crash         |
| **S4-POL-09** | Animation polish (Framer Motion)            | Trâm | 2h       | S4-POL-06   | Page transitions                     |
| **S4-POL-10** | E2E test Responsive (mobile/tablet/desktop) | Hân  | 2h       | S1-MKP-18   | Breakpoints render đúng            |
| **S4-POL-11** | Cấu hình CI Vitest coverage               | Trâm | 1h       | S3-TST-05   | Coverage > 80%                       |
| **S4-POL-12** | Cấu hình CI Playwright                    | Hân  | 1h       | S3-TST-10   | GitHub Actions chạy Playwright      |

#### S4-EPIC-DOC: Documentation

| Task ID             | Task                                | Owner | Estimate | Deps        | AC                                    |
| ------------------- | ----------------------------------- | ----- | -------- | ----------- | ------------------------------------- |
| **S4-DOC-01** | Viết tài liệu Smart Contract API | Kiên | 2h       | S4-POL-02   | Function signatures, events, errors   |
| **S4-DOC-02** | Viết tài liệu GraphQL API        | Hiếu | 2h       | Tất cả BE | Schema reference, example queries     |
| **S4-DOC-03** | Viết README.md + Setup guide       | Hiếu | 2h       | S4-CICD-05  | Run từ`bun install && bun run dev` |
| **S4-DOC-04** | Viết tài liệu AI architecture    | Khôi | 2h       | S4-POL-05   | Pipeline, prompt guide                |

#### S4-EPIC-FE: FE Support

| Task ID            | Task                               | Owner | Estimate | Deps      | AC                     |
| ------------------ | ---------------------------------- | ----- | -------- | --------- | ---------------------- |
| **S4-FE-01** | Hỗ trợ Trâm responsive + polish | Khôi | 3h       | S4-POL-06 | Code review            |
| **S4-FE-02** | Hỗ trợ Hân E2E testing          | Hiếu | 2h       | S4-POL-10 | Code review, API mocks |

#### S4-EPIC-REP: Reputation & Credential (EAS Attestation — v1.5)

| Task ID             | Task                                              | Owner         | Estimate | Deps                 | AC                                                        |
| ------------------- | ------------------------------------------------- | ------------- | -------- | -------------------- | --------------------------------------------------------- |
| **S4-REP-01** | Research EAS SDK + cấu hình trên Base Sepolia    | Kiên         | 2h       | —                   | EAS SDK hoạt động                                      |
| **S4-REP-02** | Thiết kế Reputation Schema (attestation)        | Kiên         | 2h       | S4-REP-01            | Schema:`{completedTask, rating, skills}`                |
| **S4-REP-03** | Viết`attestCompletion()` helper                | Kiên         | 3h       | S4-REP-02            | Gọi EAS.attest() khi task complete                       |
| **S4-REP-04** | Viết`revokeAttestation()`                      | Kiên         | 2h       | S4-REP-02            | Revoke khi phát hiện gian lận                          |
| **S4-REP-05** | Viết verify helper (off-chain read)              | Kiên         | 2h       | S4-REP-03            | Query attestations của 1 address                         |
| **S4-REP-06** | Hỗ trợ Khôi BE trigger attestation             | Khôi + Kiên | 2h       | S4-REP-03, S2-ESC-09 | Task complete → gọi attestation (gasless bởi platform) |
| **S4-REP-07** | UI hiển thị reputation on-chain                 | Trâm         | 2h       | S4-REP-05            | Profile show attestations                                 |

---

## 7. TỔNG KẾT MVP THEO SPRINT

### Sprint 0 — Foundation MVP

```
✅ Monorepo Bun hoạt động
✅ Prisma schema 10+ models, migration chạy
✅ Next.js custom server với GraphQL Yoga + Socket.io attached
✅ Tailwind CSS v4 + shadcn/ui components
✅ Hardhat project sẵn sàng
✅ Figma Design System hoàn chỉnh
✅ Component library base (Button, Input, Card, Dialog, Form...)
✅ AI prompt research + patterns tổng hợp
```

### Sprint 1 — Auth + Marketplace MVP

```
✅ User connect ví (MetaMask/WalletConnect) → login
✅ Xem + chỉnh sửa profile (tên, avatar, bio)
✅ Đăng task (tiêu đề, mô tả, category, bounty)
✅ Duyệt marketplace (filter category/status/bounty, search, pagination)
✅ Xem chi tiết task
✅ Apply vào task
✅ Client xem danh sách ứng viên + chọn Developer → assign
✅ BloodyRoarEscrow.sol hoàn chỉnh (14+ tests passing)
✅ Socket.io server + Room Management + Message handler
✅ File upload S3 presigned URL
```

### Sprint 2 — Escrow + Chat + AI Guard MVP

```
✅ Client ký EIP-712 off-chain khi đăng task
✅ Client deposit 100% bounty on-chain khi assign Developer
✅ Client release funds → Developer nhận tiền
✅ Mutual cancel (hoàn 100% cho Client)
✅ Raise dispute (đóng băng funds)
✅ Arbiter propose resolution (partial payout + 24h timelock)
✅ Chat real-time giữa Client-Developer (Socket.io)
✅ Lịch sử chat persistence
✅ AI Guard tự động mask secrets (API keys, private keys, PII) — model free (Groq/Gemini)
✅ AI Test Case Generator: sinh test cases khi đăng bounty
✅ Model Router (chọn model free theo task)
✅ File attachment trong chat (S3 presigned URL)
✅ Oracle/Relayer script sẵn sàng
✅ Admin Dispute Dashboard
```

### Sprint 3 — Dispute (Debate) + GitHub Auth + Analytics MVP

```
✅ AI Multi-Agent Debate: 5 agent tranh luận → verdict payout ratio
✅ Admin xem quá trình debate + approve/custom resolution
✅ GitHub OAuth login → verified badge (KYC)
✅ GitHub repo linking
✅ GitHub App webhook (PR merged → auto-payment trigger)
✅ Thông báo real-time (applicant, assigned, dispute, paid)
✅ Admin Analytics Dashboard (charts: tasks, revenue, users, disputes)
✅ User Analytics page (personal stats)
✅ Admin User Management (ban, verified filter)
✅ E2E tests: Auth, Marketplace, Chat, Escrow, Dispute, GitHub Auth
✅ Unit/Integration tests: components, hooks, validation, flows
✅ a11y compliance (axe-core audit)
```

### Sprint 4 — Production MVP

```
✅ CI/CD GitHub Actions: lint → type-check → test → build
✅ Sentry error tracking
✅ Deploy production (Railway/Fly.io + Neon/Supabase)
✅ Smart contracts deployed trên Production + verified
✅ EAS Reputation Attestation on-chain (v1.5)
✅ Domain + SSL (Cloudflare)
✅ Health check endpoint
✅ Responsive polish (all pages mobile-friendly)
✅ Loading skeletons + empty states
✅ Error boundaries + error handling
✅ Animation polish (page transitions)
✅ Full documentation (README, API docs, setup guide, AI docs)
✅ Smoke test all flows
```

### V2 Roadmap (Sau MVP)

```
🔲 Docker Sandbox (code-server + CI/CD test runner + Oracle auto-pay)
🔲 Advanced KYC (Sumsub/Persona + face liveness + SBT)
🔲 Gitcoin Passport (chống Sybil/fake identity)
🔲 Advanced Analytics (Tinybird/Metabase)
🔲 Mobile Native App (React Native)
```

---

## PHỤ LỤC: BẢNG PHÂN CÔNG TỔNG

| Sprint       | Kiên                                  | Khôi                                                                  | Hiếu                                      | Hân                          | Trâm                                    |
| ------------ | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ---------------------------------------- |
| **S0** | SC-01→03                              | FND-01→12, AI-01→04                                                  | FND-13→15                                 | DSN-01→08                    | DSN-04→07                               |
| **S1** | SC-01→12, AUTH-09, MKP-24             | CHAT-01→04, MKP-23                                                    | AUTH-01→06, MKP-01→09                    | AUTH-07, MKP-10→15           | AUTH-08, MKP-16→22, TST-01              |
| **S2** | ESC-02→04,13→15                      | ESC-01,05,06,12, CHAT-01, AI-01→07, MDL-01→05, TSTGEN-01→04, TST-05 | ESC-07→11, CHAT-02, TSTGEN-05, DSP-01→04 | CHAT-03,05, DSP-05, TST-01,02 | CHAT-04,06, TSTGEN-06, DSP-06, TST-03,04 |
| **S3** | AI-11, TST-12                          | AI-01→06,08→10, TST-11                                               | AI-07, GH-01→08, ANL-01→07               | ANL-08→10, TST-06→10        | GH-09,10, ANL-11→14, TST-01→05         |
| **S4** | CICD-08, POL-01,02, REP-01→05, DOC-01 | CICD-01→07, POL-03→05, REP-06, DOC-04, FE-01                         | DOC-02,03, FE-02                           | POL-10,12                     | POL-06→09,11, REP-07                    |

---

## PHỤ LỤC: PHÂN LOẠI ĐỘ ƯU TIÊN

| Mức         | Ý nghĩa                                                                |
| ------------ | ------------------------------------------------------------------------ |
| **P0** | Bắt buộc cho MVP — thiếu là không launch được                   |
| **P1** | Quan trọng — nên có trong MVP, có thể defer nếu thiếu thời gian |
| **P2** | Nice-to-have — có thể làm sau launch                                 |
