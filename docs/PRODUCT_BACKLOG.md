# Bloody-Roar — Product Backlog và trạng thái triển khai

> **Snapshot được audit:** 19/09/2026 · upstream `main` · [`33aed2e1028d9fd89bb6d62b47a3df65ea1cb328`](https://github.com/trongkhoidev/capstone1-bloody-roar/commit/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328)
>
> Trạng thái dưới đây chỉ phản ánh bằng chứng có trên upstream tại cutoff. Nhánh cục bộ, pull request chưa merge, kế hoạch, placeholder, schema field và script chưa chạy không phải bằng chứng hoàn tất.

## 1. Cách đọc backlog

Tài liệu này là snapshot trạng thái có thẩm quyền tại cutoff nêu trên. Mỗi dòng giữ nguyên ID, mô tả công việc, owner, estimate, dependency và acceptance criteria (AC) của kế hoạch ban đầu; các cột **Status**, **Evidence** và **Disposition/Notes** là kết quả đối soát. Khi audit lại ở commit mới, phải cập nhật cutoff và mọi dòng bị ảnh hưởng trong cùng một thay đổi.

| Status | Quy tắc |
| --- | --- |
| **Done** | Mọi AC đều được đáp ứng và có bằng chứng truy cập được tại cutoff. |
| **Partial** | Có ít nhất một phần AC đã được chứng minh, nhưng vẫn còn phần thiếu hoặc chưa kiểm chứng. |
| **Not started** | Audit xác định implementation hoặc artifact bắt buộc chưa tồn tại tại cutoff. |
| **Not verifiable** | Công việc có thể đã được thực hiện hoặc được tuyên bố hoàn tất, nhưng bằng chứng truy cập được không đủ để xác nhận. |

Blocked, Deferred và Removed from MVP là disposition, không phải trạng thái triển khai. Một item chỉ được nâng lên Done khi toàn bộ AC gốc có bằng chứng; không hạ AC để phù hợp với implementation hiện tại.

## 2. Nguồn bằng chứng và giới hạn audit

- Nguồn chính: cây mã tại cutoff, [PR nền tảng/backend](https://github.com/trongkhoidev/capstone1-bloody-roar/pull/2), [PR xác thực](https://github.com/trongkhoidev/capstone1-bloody-roar/pull/3), [PR marketplace](https://github.com/trongkhoidev/capstone1-bloody-roar/pull/4), [PR chat](https://github.com/trongkhoidev/capstone1-bloody-roar/pull/5) và [PR application/marketplace integration](https://github.com/trongkhoidev/capstone1-bloody-roar/pull/6).
- Test/quality gate chỉ được xem là hoàn tất khi có command tái lập và successful run/CI evidence nếu AC yêu cầu chạy thành công.
- UI/design ngoài repository cần artifact hoặc reviewer sign-off truy cập được.
- Deployment/on-chain cần network hoặc chain ID, address, transaction/deployment record và liên kết verification.
- Contract lifecycle trong nhánh/PR riêng không nâng trạng thái upstream. Ghi chú chuẩn là: **“Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream.”**

## 3. Backlog đã đối soát

### Sprint 0 — Foundation

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S0-FND-01** | Khởi tạo monorepo với Bun workspaces | Khôi | 2h | — | `bun install` thành công, workspace `apps/*` và `packages/*` hoạt động | **Done** | [`package.json`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/package.json) khai báo Bun workspaces; `apps/*` và `packages/*` tồn tại. | — |
| **S0-FND-02** | Khởi tạo`packages/shared` | Khôi | 1h | S0-FND-01 | Package export được types | **Done** | [`packages/shared`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/packages/shared) có package export, types, constants và utils. | — |
| **S0-FND-03** | Thiết kế Prisma schema | Khôi | 6h | S0-FND-02 | 10+ models với relations,`prisma migrate dev` thành công | **Done** | [`schema.prisma`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/packages/database/prisma/schema.prisma) và migration khởi tạo có trên upstream. | — |
| **S0-FND-04** | Seed database | Khôi | 2h | S0-FND-03 | `bun run seed` tạo admin + sample data | **Partial** | [`seed.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/packages/database/src/seed.ts) tạo dữ liệu mẫu; audit chưa có kết quả chạy database-dependent command. | — |
| **S0-FND-05** | Docker Compose PostgreSQL | Khôi | 1h | — | `docker compose up` → PostgreSQL chạy port 5432 | **Done** | [`docker-compose.yml`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/docker-compose.yml) cấu hình PostgreSQL cục bộ. | — |
| **S0-FND-06** | Khởi tạo Next.js app + custom server | Khôi | 4h | S0-FND-01 | `bun run dev` → Next.js chạy port 3000 | **Done** | [`server.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/server.ts) khởi tạo Next.js custom server. | — |
| **S0-FND-07** | Attach GraphQL Yoga vào custom server | Khôi | 3h | S0-FND-06 | `POST /api/graphql` trả về Hello World query | **Done** | [`server.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/server.ts) gắn GraphQL Yoga tại `/api/graphql`. | — |
| **S0-FND-08** | Attach Socket.io vào custom server | Khôi | 2h | S0-FND-06 | Client connect được socket | **Done** | [`server.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/server.ts) gắn Socket.IO vào HTTP server. | — |
| **S0-FND-09** | Cấu hình Tailwind CSS v4 + shadcn/ui | Khôi | 1h | S0-FND-06 | `globals.css` import Tailwind, shadcn/ui button render được | **Partial** | [`globals.css`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/app/globals.css) có Tailwind/tokens; chưa có bộ shadcn/ui theo AC. | — |
| **S0-FND-10** | Cấu hình TypeScript strict + ESLint + Prettier | Khôi | 1h | S0-FND-06 | `bun run lint` và `bun run typecheck` chạy qua | **Partial** | Strict TypeScript, ESLint và Prettier có cấu hình; không có CI/run evidence chứng minh cả lint và typecheck đều qua. | — |
| **S0-FND-11** | Cấu hình Pino logger | Khôi | 1h | S0-FND-06 | Request log format JSON | **Done** | [`logger.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/lib/logger.ts) cấu hình Pino. | — |
| **S0-FND-12** | Tạo`.env.example` với tất cả biến | Khôi | 1h | S0-FND-06 | Template có comment giải thích | **Done** | [`.env.example`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/.env.example) có template và chú thích. | — |
| **S0-FND-13** | Review Prisma schema | Hiếu | 1h | S0-FND-03 | Feedback cho Khôi | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S0-FND-14** | Hỗ trợ setup Next.js server | Hiếu | 2h | S0-FND-06 | Server hoạt động | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S0-FND-15** | Research GraphQL Yoga + Pothos | Hiếu | 2h | — | Knowledge base sẵn sàng | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 0 — Smart contract setup

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S0-SC-01** | Khởi tạo Hardhat project | Kiên | 1h | — | `npx hardhat compile` thành công | **Done** | [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) có Hardhat config, package và contract. | — |
| **S0-SC-02** | Cấu hình multi-network (localhost, sepolia, mainnet) | Kiên | 1h | S0-SC-01 | Deploy script hoạt động trên localhost | **Partial** | Có cấu hình mạng và deploy script, nhưng không có receipt/address chứng minh deploy script hoạt động theo toàn bộ AC. | — |
| **S0-SC-03** | Cài OpenZeppelin Contracts v5 | Kiên | 0.5h | S0-SC-01 | Import`@openzeppelin/contracts` thành công | **Done** | [`apps/contracts/package.json`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts/package.json) khai báo OpenZeppelin Contracts v5. | — |

### Sprint 0 — AI research

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S0-AI-01** | Đăng ký OpenAI API key + set up billing | Khôi | 1h | — | API key hoạt động, gọi được GPT-4o-mini | **Not verifiable** | Credential hoặc cấu hình dịch vụ ngoài repository không thể xác minh từ bằng chứng truy cập được. | — |
| **S0-AI-02** | Research Vercel AI SDK + viết sample | Khôi | 3h | S0-AI-01 | Sample streaming response hoạt động | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | — |
| **S0-AI-03** | Tổng hợp PII/Secret detection patterns | Khôi | 3h | — | 20+ regex patterns document | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | — |
| **S0-AI-04** | Tạo thư mục`prompts/` trong repo | Khôi | 0.5h | — | Cấu trúc thư mục + template file | **Done** | [`apps/web/src/ai/prompts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/ai/prompts) có cấu trúc và template. | — |

### Sprint 0 — Design system

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S0-DSN-01** | Thiết kế Design Tokens (colors, typography, spacing, shadows) | Hân | 4h | — | Figma file với tokens documented | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S0-DSN-02** | Thiết kế Layout System (navbar, sidebar, content, mobile) | Hân | 3h | S0-DSN-01 | Figma layout cho desktop + mobile | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S0-DSN-03** | Thiết kế Component variants (button, input, card, dialog, badge, table) | Hân | 4h | S0-DSN-01 | Figma components với variants | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S0-DSN-04** | Customize shadcn/ui theme khớp design tokens | Trâm | 3h | S0-DSN-01, S0-FND-09 | CSS variables override | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S0-DSN-05** | Cài đặt toàn bộ shadcn/ui components | Trâm | 2h | S0-FND-09 | Button, Input, Select, Dialog, Card, Table, Badge, Tabs, Toast, DropdownMenu, Avatar, Skeleton | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S0-DSN-06** | Xây dựng Form components (FormField, FormInput, FormSelect, FormTextarea) | Trâm | 3h | S0-DSN-05 | React Hook Form + Zod integration | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S0-DSN-07** | Cấu hình accessibility tools (axe-core, eslint a11y) | Trâm | 1h | S0-FND-09 | Lint báo lỗi a11y | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S0-DSN-08** | Thiết kế Loading + Error + Empty states | Hân | 2h | S0-DSN-01 | Design patterns cho tất cả states | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |

### Sprint 1 — Authentication

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S1-AUTH-01** | Cấu hình Thirdweb Auth provider | Hiếu | 2h | S0-FND-06 | Thirdweb provider hoạt động,`useConnect` chạy | **Partial** | Có thư viện và route SIWE/JWT phía server; chưa có frontend provider và `useConnect` UI theo AC. | — |
| **S1-AUTH-02** | Viết Auth middleware cho GraphQL | Hiếu | 2h | S1-AUTH-01 | Query không có JWT → lỗi Unauthorized | **Partial** | [`auth.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/lib/auth.ts) và resolver guards có xác minh bearer token; chưa phải middleware bao phủ mọi query. | — |
| **S1-AUTH-03** | Viết GraphQL Context factory (inject DB + user) | Hiếu | 1h | S1-AUTH-02 | Context có`user` và `db` | **Done** | [`context.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/context.ts) cung cấp database và user context. | — |
| **S1-AUTH-04** | Viết User module — Pothos types | Hiếu | 1h | S0-FND-07 | Types: User | **Done** | [`user.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/user/user.module.ts) định nghĩa Pothos User type. | — |
| **S1-AUTH-05** | Viết User query`me` và `user(id)` | Hiếu | 1h | S1-AUTH-04 | Query trả về user đúng | **Done** | [`user.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/user/user.module.ts) có `me` và `user(id)`. | — |
| **S1-AUTH-06** | Viết User mutation`updateProfile` | Hiếu | 2h | S1-AUTH-05 | Update name, email, bio, avatar | **Partial** | `updateProfile` cập nhật name và bio; email/avatar trong AC chưa được đáp ứng. | — |
| **S1-AUTH-07** | Implement Auth pages UI design | Hân | 2h | S0-DSN-03 | Figma: Login + ConnectWallet | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-AUTH-08** | Implement Auth pages code | Trâm | 3h | S1-AUTH-07, S1-AUTH-01 | ConnectWallet button, redirect | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-AUTH-09** | Hỗ trợ Hiếu review Thirdweb Auth middleware | Kiên | 1h | S1-AUTH-02 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 1 — Marketplace

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S1-MKP-01** | Viết Issue module — Pothos types | Hiếu | 1h | S1-AUTH-04 | Types: Issue, IssueStatus, IssueFilter, Pagination | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) định nghĩa Issue và input/filter types. | — |
| **S1-MKP-02** | Viết`issues` query (filter, sort, paginate) | Hiếu | 3h | S1-MKP-01 | Filter status/category/bounty, cursor pagination | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) có filter, sort và cursor pagination. | — |
| **S1-MKP-03** | Viết`issue(id)` query | Hiếu | 1h | S1-MKP-01 | Trả về issue + client + applicants | **Partial** | Issue detail, client, token và counters có; applicants được cung cấp qua query `applications(issueId)` riêng. | — |
| **S1-MKP-04** | Viết`createIssue` mutation | Hiếu | 2h | S1-MKP-01 | Validate Zod, insert DB | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) có create mutation và validation. | — |
| **S1-MKP-05** | Viết`updateIssue` mutation | Hiếu | 1h | S1-MKP-04 | Client-only update | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) có owner-checked update. | — |
| **S1-MKP-06** | Viết`cancelIssue` mutation | Hiếu | 1h | S1-MKP-04 | Status = CANCELLED nếu chưa assign | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) có cancel guard trước assignment. | — |
| **S1-MKP-07** | Viết Application module | Hiếu | 2h | S1-MKP-03 | `applyIssue`, `getApplicants` | **Done** | [`application.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/application/application.module.ts) có create/list applications. | — |
| **S1-MKP-08** | Viết`assignDeveloper` mutation | Hiếu | 2h | S1-MKP-07 | Client-only, status → IN_PROGRESS | **Done** | [`application.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/application/application.module.ts) có accept/assign/reject behavior. | — |
| **S1-MKP-09** | Viết Search & Filter logic | Hiếu | 2h | S1-MKP-02 | Prisma`where` + `orderBy` | **Done** | [`issue.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/issue/issue.module.ts) xây dựng Prisma `where` và `orderBy`. | — |
| **S1-MKP-10** | Thiết kế Marketplace listing (grid, filter) | Hân | 3h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-11** | Thiết kế Issue Detail page | Hân | 2h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-12** | Thiết kế Create Issue form (multi-step) | Hân | 2h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-13** | Thiết kế Dashboard page | Hân | 2h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-14** | Thiết kế Profile page | Hân | 2h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-15** | Thiết kế GitHub Auth badge UI | Hân | 1h | S0-DSN-02 | Figma design | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S1-MKP-16** | Implement Main Layout (navbar + sidebar) | Trâm | 3h | S0-DSN-05 | Responsive, mobile menu | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-17** | Implement Profile page | Trâm | 2h | S1-MKP-14, S1-AUTH-05 | Edit form, avatar upload | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-18** | Implement Marketplace page | Trâm | 4h | S1-MKP-10, S1-MKP-02 | Filter bar, cards, search, pagination, skeletons | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-19** | Implement Issue Detail page | Trâm | 3h | S1-MKP-11, S1-MKP-03 | Description, bounty, applicants, actions | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-20** | Implement Create Issue form | Trâm | 4h | S1-MKP-12, S1-MKP-04 | Multi-step, validation, submit | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-21** | Implement Dashboard page | Trâm | 3h | S1-MKP-13 | My posted / working tabs, stats | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-22** | Implement GitHub Auth badge | Trâm | 1h | S1-MKP-15 | Connect button → verified badge | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S1-MKP-23** | Hỗ trợ FE Web3 integration | Khôi | 2h | S1-AUTH-01 | Code review, Thirdweb hooks | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S1-MKP-24** | Hỗ trợ BE marketplace logic | Kiên | 1h | S1-MKP-04 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 1 — Smart contract

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S1-SC-01** | Thiết kế state machine diagram | Kiên | 1h | — | 5 states documented | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-02** | Viết`BloodyRoarEscrow.sol` — base | Kiên | 2h | S0-SC-03 | Contract skeleton compile | **Done** | [`BloodyRoarEscrow.sol`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts/contracts/BloodyRoarEscrow.sol) là skeleton có thể compile. | — |
| **S1-SC-03** | Implement`deposit(issueId, worker)` | Kiên | 3h | S1-SC-02 | Lock funds, emit Deposited | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-04** | Implement`releaseFunds(issueId)` | Kiên | 1h | S1-SC-03 | Client-only transfer | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-05** | Implement`mutualCancel(issueId)` | Kiên | 2h | S1-SC-03 | Both sign → refund | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-06** | Implement`claimTimeout(issueId)` | Kiên | 1h | S1-SC-03 | Worker claim after 30 days | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-07** | Implement`raiseDispute(issueId)` | Kiên | 1h | S1-SC-03 | Either party, state = DISPUTED | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-08** | Implement`proposeResolution(issueId, clientRatio)` | Kiên | 2h | S1-SC-07 | Arbiter-only, 24h timelock | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-09** | Implement`challengeResolution(issueId)` | Kiên | 1h | S1-SC-08 | During 24h window | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-10** | Implement`executeResolution(issueId)` | Kiên | 1h | S1-SC-09 | After timelock, split funds | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |
| **S1-SC-11** | Implement`pause()` / `unpause()` | Kiên | 1h | S1-SC-02 | Owner-only circuit breaker | **Done** | Skeleton upstream có pause/unpause và admin scaffolding; chưa chứng minh vòng đời escrow còn lại. | — |
| **S1-SC-12** | Viết full unit tests (14+ cases) | Kiên | 4h | S1-SC-10 | All tests pass, gas report | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Đang thực hiện trong PR smart contract riêng — chưa tính vào trạng thái upstream. |

### Sprint 1 — Chat setup

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S1-CHAT-01** | Viết Socket.io auth middleware (JWT verify) | Khôi | 1h | S0-FND-08, S1-AUTH-01 | Disconnect if token invalid | **Done** | [`handlers.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/socket/handlers.ts) xác minh JWT và từ chối kết nối sai. | — |
| **S1-CHAT-02** | Viết Room Management | Khôi | 2h | S1-CHAT-01 | `join:task(issueId)`, `leave:task(issueId)` | **Done** | [`handlers.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/socket/handlers.ts) kiểm tra quyền join/leave phòng Issue. | — |
| **S1-CHAT-03** | Viết Message handler (save DB + broadcast) | Khôi | 2h | S1-CHAT-02 | Lưu Prisma, emit room | **Done** | [`handlers.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/socket/handlers.ts) lưu, chống trùng và broadcast message. | — |
| **S1-CHAT-04** | Viết File Upload endpoint (S3 presigned URL) | Khôi | 3h | S0-FND-06 | `POST /api/upload` → S3 URL | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |

### Sprint 1 — Testing setup

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S1-TST-01** | Cài đặt Vitest + Testing Library | Trâm | 1h | — | `vitest run` thành công | **Partial** | Vitest, Testing Library, config và script có; chưa có bộ test/run evidence đạt AC. | — |
| **S1-TST-02** | Cài đặt Playwright | Hân | 1h | — | `npx playwright test` chạy được | **Partial** | Playwright dependency và script có; chưa có config/test run tái lập đạt AC. | — |

### Sprint 2 — Escrow integration

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-ESC-01** | Cấu hình Thirdweb SDK backend (connect contract) | Khôi | 1h | S1-SC-12 | Gọi được contract từ server | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-02** | Thiết kế EIP-712 typed data schema | Kiên | 2h | — | Domain, types, values spec | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-03** | Viết helper`signCommitment()` (frontend) | Kiên | 2h | S2-ESC-02 | Ký → trả về signature | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-04** | Viết`verifyCommitment()` on-chain | Kiên | 2h | S2-ESC-02 | Contract verify function | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-05** | Viết Escrow Prisma model + migration | Khôi | 1h | S0-FND-03 | DB schema | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-06** | Viết Transaction logger | Khôi | 1h | S2-ESC-05 | Lưu txHash sau mỗi on-chain tx | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-07** | Viết Escrow GraphQL types | Hiếu | 1h | S1-MKP-01 | Types: Escrow, EscrowStatus | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-08** | Viết`depositToEscrow(issueId, developerId)` | Hiếu | 3h | S2-ESC-01, S2-ESC-03 | Gọi contract.deposit() | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-09** | Viết`releaseFunds(issueId)` mutation | Hiếu | 1h | S2-ESC-08 | Gọi contract.releaseFunds() | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-10** | Viết`cancelEscrow(issueId)` mutation | Hiếu | 1h | S2-ESC-08 | Gọi contract.mutualCancel() | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-11** | Viết`raiseDispute(issueId, reason)` mutation | Hiếu | 1h | S2-ESC-08 | Gọi contract.raiseDispute() | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-12** | Tích hợp EIP-712 signing flow FE | Khôi | 2h | S2-ESC-03 | Thirdweb SDK → ký → gửi BE | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | — |
| **S2-ESC-13** | Viết Oracle/Relayer script | Kiên | 3h | S2-ESC-08 | Nhận event → ký tx → releaseFunds | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Removed from MVP |
| **S2-ESC-14** | Deploy Escrow lên testnet + verify | Kiên | 2h | S1-SC-12 | Contract address + verified | **Not started** | Không có implementation đáp ứng AC trong [`apps/contracts`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/contracts) hoặc tích hợp web tại mốc audit. | Deployment cần ủy quyền riêng; PR chưa được tính là upstream. |
| **S2-ESC-15** | Hỗ trợ Hiếu review Escrow resolvers | Kiên | 1h | S2-ESC-08 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 2 — Chat implementation

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-CHAT-01** | Viết File attachment trong chat | Khôi | 2h | S1-CHAT-04, S1-CHAT-03 | Upload → S3 URL → gửi qua chat | **Partial** | Message schema/handler lưu được attachment metadata; không có upload hoặc presigned-URL endpoint. | — |
| **S2-CHAT-02** | Viết Chat GraphQL module | Hiếu | 2h | S1-CHAT-03 | Query`messages(issueId)`, load history | **Done** | [`chat.module.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src/graphql/modules/chat/chat.module.ts) có query lịch sử phân trang và kiểm soát truy cập. | — |
| **S2-CHAT-03** | Thiết kế Chat UI | Hân | 3h | S1-MKP-11 | Figma: sidebar chat, bubbles, file preview | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S2-CHAT-04** | Implement Chat UI | Trâm | 4h | S2-CHAT-03, S2-CHAT-02 | Auto-scroll, file upload, Monaco preview | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S2-CHAT-05** | Thiết kế Escrow UI components | Hân | 2h | S1-MKP-11 | Figma: deposit modal, status timeline | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S2-CHAT-06** | Implement Escrow UI components | Trâm | 3h | S2-CHAT-05, S2-ESC-08 | Deposit → wallet tx → status | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |

### Sprint 2 — AI Guard

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-AI-01** | Viết Regex pattern library (20+ patterns) | Khôi | 3h | S0-AI-03 | `patterns.ts` | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-02** | Viết`RegexScanner` class | Khôi | 2h | S2-AI-01 | Detect → mask | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-03** | Viết LLM system prompt (PII detection) | Khôi | 2h | S0-AI-04 | Prompt trả về masked JSON | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-04** | Viết`AIGuardService` orchestration class | Khôi | 3h | S2-AI-02, S2-AI-03 | Regex → LLM → response | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-05** | Tích hợp AIGuard vào Socket.io middleware | Khôi | 2h | S2-AI-04, S1-CHAT-03 | Message auto-mask trước broadcast | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-06** | Viết 50+ AI Guard test cases | Khôi | 3h | S2-AI-05 | API keys, private keys, emails → masked | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-AI-07** | Đánh giá accuracy (FP/FN rate) | Khôi | 2h | S2-AI-06 | Accuracy >95% | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |

### Sprint 2 — Model router

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-MDL-01** | Đăng ký Groq API key (free) | Khôi | 1h | — | Groq credentials hoạt động | **Not verifiable** | Credential hoặc cấu hình dịch vụ ngoài repository không thể xác minh từ bằng chứng truy cập được. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-MDL-02** | Đăng ký Google AI Studio (Gemini Flash free) | Khôi | 1h | — | Gemini credentials hoạt động | **Not verifiable** | Credential hoặc cấu hình dịch vụ ngoài repository không thể xác minh từ bằng chứng truy cập được. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-MDL-03** | Viết`ModelRouter` class | Khôi | 3h | S2-MDL-01, S2-MDL-02 | Chọn model theo task: Guard→llama-8b, TestGen→llama-70b, Judge→gpt-oss-120b | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-MDL-04** | Cấu hình Vercel AI SDK multi-provider | Khôi | 2h | S2-MDL-03 | Groq + Gemini + OpenAI cùng SDK | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-MDL-05** | Viết fallback logic | Khôi | 1h | S2-MDL-04 | Model lỗi → chuyển dự phòng | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |

### Sprint 2 — Test generator

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-TSTGEN-01** | Thiết kế prompt cho Test Gen | Khôi | 2h | S0-AI-04 | Phân tích mô tả bug → test cases | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-TSTGEN-02** | Viết`TestGenerator` class | Khôi | 3h | S2-TSTGEN-01, S2-MDL-03 | Input: desc → Output:`{testCases[], acceptanceCriteria[], edgeCases[]}` | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-TSTGEN-03** | Xử lý structured output | Khôi | 2h | S2-TSTGEN-02 | JSON schema (given/when/then) | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-TSTGEN-04** | Viết Prisma model cho Test Cases | Khôi | 1h | S0-FND-03 | DB schema test case | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-TSTGEN-05** | Viết GraphQL mutation`generateTestCases(issueId)` | Hiếu | 2h | S2-TSTGEN-02 | AI resolver | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S2-TSTGEN-06** | Viết UI review test cases | Trâm | 3h | S2-TSTGEN-05 | Client approve/chỉnh sửa trước publish | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |

### Sprint 2 — Dispute

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-DSP-01** | Viết Dispute GraphQL types | Hiếu | 1h | S1-MKP-01 | Types: Dispute, Resolution | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |
| **S2-DSP-02** | Viết Dispute Queries + Mutations | Hiếu | 2h | S2-DSP-01 | `getDispute`, `raiseDispute` | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |
| **S2-DSP-03** | Viết`proposeResolution(issueId, ratio)` | Hiếu | 1h | S2-ESC-11 | Admin-only | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |
| **S2-DSP-04** | Viết`challengeResolution(issueId)` | Hiếu | 1h | S2-DSP-03 | Gọi contract.challengeResolution() | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |
| **S2-DSP-05** | Thiết kế Admin Dispute Dashboard | Hân | 3h | — | Figma: case list, AI report, resolution slider | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S2-DSP-06** | Implement Admin Dispute Dashboard | Trâm | 3h | S2-DSP-05, S2-DSP-02 | Case table, AI report view | **Not started** | Audit repository tại cutoff không tìm thấy implementation hoặc artifact đáp ứng AC. | — |

### Sprint 2 — Testing

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S2-TST-01** | Viết E2E test Auth flow | Hân | 2h | S1-AUTH-01 | Login → redirect → session | **Partial** | [`e2e-login.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/scripts/e2e-login.ts) là assertion script; chưa phải E2E suite/run evidence nhất quán. | — |
| **S2-TST-02** | Viết E2E test Marketplace (create → browse) | Hân | 2h | S1-MKP-04 | Tạo issue → thấy trong listing | **Partial** | [`e2e-issue.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/scripts/e2e-issue.ts) kiểm tra một phần luồng; chưa phải E2E suite/run evidence nhất quán. | — |
| **S2-TST-03** | Viết test cho UI Components | Trâm | 2h | S0-DSN-05 | Button, Input, Dialog render + events | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S2-TST-04** | Viết test cho Auth hooks | Trâm | 2h | S1-AUTH-02 | `useAuth`, `useUser` | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S2-TST-05** | Hỗ trợ FE Chat + Escrow implementation | Khôi | 2h | S2-CHAT-04, S2-CHAT-06 | Code review, Web3 integration | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S2-TST-06** | Hỗ trợ BE Escrow logic | Kiên | 1h | S2-ESC-08 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 3 — AI dispute assistant

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S3-AI-01** | Thiết kế Dispute prompt chain | Khôi | 2h | S2-AI-04 | Multi-step: summarize → debate → verdict | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-02** | Viết`DisputeDataCollector` class | Khôi | 3h | S2-CHAT-02, S2-TSTGEN-04 | Gom: issue desc + chat log + test cases + evidence | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-03** | Thiết kế Multi-Agent Debate ("dive") | Khôi | 3h | S3-AI-02 | 5 agent: Client Advocate, Dev Advocate, Critic, Judge, Verifier | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-04** | Viết prompt cho 5 agent | Khôi | 4h | S3-AI-03 | 5 persona prompts | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-05** | Viết`DebateOrchestrator` class | Khôi | 4h | S3-AI-03, S2-MDL-03 | Điều phối vòng tranh luận (config số vòng) | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-06** | Viết`DisputeAnalyzer` class (dùng debate) | Khôi | 3h | S3-AI-05 | Debate → verdict`{suggestedClientRatio, reasoning}` | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-07** | Viết`analyzeDispute(issueId)` GraphQL resolver | Hiếu | 2h | S3-AI-06, S2-DSP-02 | AI debate resolver | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-08** | Viết 10+ Dispute test scenarios | Khôi | 2h | S3-AI-06 | Scope creep, malicious tests, ghosting | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-09** | Hỗ trợ Kiên verdict → on-chain | Khôi + Kiên | 2h | S3-AI-06, S2-ESC-11 | Verdict ratio → proposeResolution() | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-10** | Đánh giá debate vs 1 model đơn lẻ | Khôi | 2h | S3-AI-08 | Accuracy, fairness report | **Not started** | Ngoài prompt template đã ghi riêng, audit không tìm thấy service, test hoặc kết quả đánh giá đáp ứng AC. | Ưu tiên sau luồng MVP cốt lõi. |
| **S3-AI-11** | Hỗ trợ Khôi thiết kế dispute flow | Kiên | 1h | S3-AI-06 | Contract flow review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | Ưu tiên sau luồng MVP cốt lõi. |

### Sprint 3 — GitHub integration

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S3-GH-01** | Đăng ký GitHub OAuth App | Hiếu | 2h | — | Client ID + secret, callback URL | **Not verifiable** | Credential hoặc cấu hình dịch vụ ngoài repository không thể xác minh từ bằng chứng truy cập được. | — |
| **S3-GH-02** | Viết GitHub OAuth flow | Hiếu | 2h | S3-GH-01 | Login with GitHub → verify → link account | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-03** | Viết`linkGithub` GraphQL mutation | Hiếu | 1h | S3-GH-02 | Lưu GitHub username, verified = true | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-04** | Đăng ký GitHub App (webhook) | Hiếu | 2h | — | App ID + private key + webhook secret | **Not verifiable** | Credential hoặc cấu hình dịch vụ ngoài repository không thể xác minh từ bằng chứng truy cập được. | — |
| **S3-GH-05** | Cài Octokit + cấu hình | Hiếu | 1h | S3-GH-04 | Gọi GitHub API thành công | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-06** | Viết Webhook handler (`pull_request.merged`) | Hiếu | 2h | S3-GH-05 | Nhận webhook → verify → lưu DB | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-07** | Viết auto-payment trigger | Hiếu | 2h | S3-GH-06, S2-ESC-09 | PR merged → gọi releaseFunds | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | Removed from MVP |
| **S3-GH-08** | Viết`linkGithubRepo` GraphQL mutation | Hiếu | 1h | S3-GH-05 | Lưu repo URL + installation ID | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-09** | Implement GitHub Auth UI (verified badge) | Trâm | 2h | S1-MKP-22, S3-GH-02 | Connect → verified | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |
| **S3-GH-10** | Implement GitHub Repo linking UI | Trâm | 2h | S3-GH-08 | Select repo for task | **Not started** | Audit không tìm thấy OAuth/App integration, webhook hoặc UI tương ứng tại mốc audit. | — |

### Sprint 3 — Analytics and notifications

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S3-ANL-01** | Viết Analytics SQL queries (aggregate) | Hiếu | 3h | S1-MKP-02 | Task count, revenue, dispute rate, user growth | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-02** | Viết Analytics GraphQL queries | Hiếu | 1h | S3-ANL-01 | `adminStats`, `userStats(userId)` | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-03** | Viết Notification Prisma model + migration | Hiếu | 0.5h | S0-FND-03 | Notification model | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-04** | Viết`createNotification()` service | Hiếu | 1h | S3-ANL-03 | Lưu DB + emit socket | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-05** | Gắn notification triggers vào events | Hiếu | 2h | S3-ANL-04 | New applicant, assigned, dispute, paid | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-06** | Viết Notification GraphQL queries | Hiếu | 1h | S3-ANL-03 | `notifications`, `unreadCount`, `markAsRead` | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-07** | Viết Admin resolvers | Hiếu | 1h | S3-ANL-02 | Admin-only: all users, all disputes | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-08** | Thiết kế Admin Dashboard (charts) | Hân | 3h | — | Figma: stat cards, charts | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S3-ANL-09** | Thiết kế Analytics page | Hân | 2h | — | Figma: personal + platform stats | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S3-ANL-10** | Thiết kế User Management | Hân | 1h | — | Figma: user table, ban, verified filter | **Not verifiable** | Không có Figma/artifact hoặc reviewer sign-off truy cập được tại mốc audit. | — |
| **S3-ANL-11** | Implement Admin Dashboard | Trâm | 3h | S3-ANL-08, S3-ANL-02 | Charts (Tremor/Recharts), stat cards | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-12** | Implement Analytics page | Trâm | 2h | S3-ANL-09, S3-ANL-02 | Personal stats + charts | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-13** | Implement User Management | Trâm | 2h | S3-ANL-10, S3-ANL-07 | Table, ban button, verified filter | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |
| **S3-ANL-14** | Implement Notification UI | Trâm | 2h | S3-ANL-06 | Bell icon + badge, dropdown, mark read | **Not started** | Audit schema, GraphQL modules và frontend không tìm thấy analytics/notification artifact đáp ứng AC. | — |

### Sprint 3 — Full testing

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S3-TST-01** | Viết test cho Marketplace queries | Trâm | 2h | S1-MKP-02 | `useIssues` filter, sort, paginate | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-02** | Viết test cho Chat hooks | Trâm | 2h | S2-CHAT-02 | `useMessages`, socket events | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-03** | Viết test cho Form validation schemas | Trâm | 2h | S1-MKP-04 | CreateIssue, UpdateProfile — valid/invalid | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-04** | Viết integration test Create → Apply → Assign | Trâm | 3h | S1-MKP-08 | Mock API, full flow | **Partial** | Các script Issue/Application bao phủ một phần create/apply/assign; chưa có integration suite tái lập theo AC. | — |
| **S3-TST-05** | Viết a11y audit tests | Trâm | 2h | Tất cả UI | axe-core checks per page | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-06** | Viết E2E test Apply + Assign flow | Hân | 2h | S1-MKP-08 | Apply → client assign | **Partial** | [`e2e-application.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/scripts/e2e-application.ts) là assertion script; chưa có Playwright run evidence. | — |
| **S3-TST-07** | Viết E2E test Chat flow | Hân | 2h | S2-CHAT-04 | Open chat → send → AI guard → receive | **Partial** | [`e2e-chat.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/scripts/e2e-chat.ts) kiểm tra chat backend; UI và AI Guard trong AC chưa có. | — |
| **S3-TST-08** | Viết E2E test Escrow flow | Hân | 3h | S2-ESC-08 | Sign EIP-712 → deposit → release | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-09** | Viết E2E test Dispute flow | Hân | 2h | S3-AI-05 | Raise → AI analyze → admin resolve | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-10** | Viết E2E test GitHub Auth flow | Hân | 2h | S3-GH-02 | Connect GitHub → verified badge | **Not started** | Audit không tìm thấy test artifact và successful run evidence đáp ứng AC. | — |
| **S3-TST-11** | Hỗ trợ FE Admin + Analytics implementation | Khôi | 2h | S3-ANL-11 | Code review, API integration | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S3-TST-12** | Hỗ trợ BE GitHub integration | Kiên | 1h | S3-GH-06 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 4 — CI/CD and deployment

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S4-CICD-01** | Viết GitHub Actions CI | Khôi | 2h | — | Lint → Type-check → Vitest → Build | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-02** | Cấu hình Sentry error tracking | Khôi | 1h | — | Error log trên Sentry dashboard | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-03** | Tạo production PostgreSQL (Neon/Supabase) | Khôi | 1h | — | Connection string, pool config | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-04** | Viết Dockerfile cho Next.js custom server | Khôi | 1h | — | `docker build` thành công | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-05** | Deploy app lên Railway/Fly.io | Khôi | 2h | S4-CICD-04 | App chạy production URL | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-06** | Cấu hình domain + SSL (Cloudflare) | Khôi | 1h | S4-CICD-05 | HTTPS hoạt động | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-07** | Viết Health check endpoint | Khôi | 0.5h | S4-CICD-05 | `GET /api/health` → status | **Done** | [`server.ts`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/server.ts) phục vụ `GET /api/health`. | — |
| **S4-CICD-08** | Deploy smart contracts lên Production | Kiên | 2h | S1-SC-12 | Contracts deployed + verified | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |
| **S4-CICD-09** | Smoke test production | Cả team | 2h | S4-CICD-05 | Tất cả flow chính hoạt động | **Not started** | Audit không tìm thấy workflow/config/deployment receipt hoặc URL đáp ứng AC. | — |

### Sprint 4 — Polish

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S4-POL-01** | Tối ưu gas Escrow contract | Kiên | 2h | S1-SC-12 | Gas report < bản cũ | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-02** | Contract security audit checklist | Kiên | 2h | S4-POL-01 | Reentrancy, overflow, access control | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-03** | Tinh chỉnh AI Guard accuracy | Khôi | 2h | S2-AI-07 | FP < 3%, FN < 1% | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-04** | Tinh chỉnh Dispute Assistant prompt | Khôi | 2h | S3-AI-07 | Output consistency > 90% | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-05** | Viết tài liệu AI integration | Khôi | 2h | S4-POL-04 | Prompt engineering guide | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-06** | Responsive polish (all pages mobile) | Trâm | 4h | S3-TST-05 | Tất cả pages responsive | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-07** | Loading skeletons + empty states | Trâm | 3h | Tất cả UI | Không page nào flash trắng | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-08** | Error boundaries + global error handling | Trâm | 2h | Tất cả UI | Toast/fallback, không crash | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-09** | Animation polish (Framer Motion) | Trâm | 2h | S4-POL-06 | Page transitions | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-10** | E2E test Responsive (mobile/tablet/desktop) | Hân | 2h | S1-MKP-18 | Breakpoints render đúng | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-11** | Cấu hình CI Vitest coverage | Trâm | 1h | S3-TST-05 | Coverage > 80% | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |
| **S4-POL-12** | Cấu hình CI Playwright | Hân | 1h | S3-TST-10 | GitHub Actions chạy Playwright | **Not started** | Audit [`apps/web/src`](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/apps/web/src) không tìm thấy route/component hoặc behavior đáp ứng AC. | — |

### Sprint 4 — Documentation

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S4-DOC-01** | Viết tài liệu Smart Contract API | Kiên | 2h | S4-POL-02 | Function signatures, events, errors | **Not started** | Audit không tìm thấy tài liệu chuyên biệt đáp ứng AC. | — |
| **S4-DOC-02** | Viết tài liệu GraphQL API | Hiếu | 2h | Tất cả BE | Schema reference, example queries | **Not started** | Audit không tìm thấy tài liệu chuyên biệt đáp ứng AC. | — |
| **S4-DOC-03** | Viết README.md + Setup guide | Hiếu | 2h | S4-CICD-05 | Run từ`bun install && bun run dev` | **Partial** | [`README.md`](https://github.com/trongkhoidev/capstone1-bloody-roar/blob/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328/README.md) có hướng dẫn cơ bản; AC gắn với production deployment chưa được đáp ứng. | — |
| **S4-DOC-04** | Viết tài liệu AI architecture | Khôi | 2h | S4-POL-05 | Pipeline, prompt guide | **Not started** | Audit không tìm thấy tài liệu chuyên biệt đáp ứng AC. | — |

### Sprint 4 — Frontend support

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S4-FE-01** | Hỗ trợ Trâm responsive + polish | Khôi | 3h | S4-POL-06 | Code review | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |
| **S4-FE-02** | Hỗ trợ Hân E2E testing | Hiếu | 2h | S4-POL-10 | Code review, API mocks | **Not verifiable** | Không có artifact hoặc reviewer sign-off truy cập được để xác nhận hoạt động theo AC. | — |

### Sprint 4 — Reputation (v1.5)

| Task ID | Task | Owner | Estimate | Deps | AC gốc | Status | Evidence | Disposition/Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **S4-REP-01** | Research EAS SDK + cấu hình trên Base Sepolia | Kiên | 2h | — | EAS SDK hoạt động | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-02** | Thiết kế Reputation Schema (attestation) | Kiên | 2h | S4-REP-01 | Schema:`{completedTask, rating, skills}` | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-03** | Viết`attestCompletion()` helper | Kiên | 3h | S4-REP-02 | Gọi EAS.attest() khi task complete | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-04** | Viết`revokeAttestation()` | Kiên | 2h | S4-REP-02 | Revoke khi phát hiện gian lận | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-05** | Viết verify helper (off-chain read) | Kiên | 2h | S4-REP-03 | Query attestations của 1 address | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-06** | Hỗ trợ Khôi BE trigger attestation | Khôi + Kiên | 2h | S4-REP-03, S2-ESC-09 | Task complete → gọi attestation (gasless bởi platform) | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |
| **S4-REP-07** | UI hiển thị reputation on-chain | Trâm | 2h | S4-REP-05 | Profile show attestations | **Not started** | Audit không tìm thấy EAS code, schema, transaction hoặc UI evidence đáp ứng AC. | Deferred — v1.5 |

## 4. Tổng hợp snapshot

| Status | Số item |
| --- | ---: |
| Done | 30 |
| Partial | 17 |
| Not started | 130 |
| Not verifiable | 36 |
| **Tổng** | **213** |

Các con số trên được suy ra từ từng dòng, không phải checklist duy trì thủ công. Pull request được mở sau cutoff không làm thay đổi snapshot này; chỉ một lần audit mới trên commit upstream mới hơn mới được cập nhật status.
