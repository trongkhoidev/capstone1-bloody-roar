# 🩸 Bloody-Roar: Kế Hoạch Phân Công Đội Ngũ

> **Stack:** Next.js Custom Server (TS) · PostgreSQL + Prisma · GraphQL (Yoga + Pothos) · Thirdweb Auth · EVM (Solidity + Hardhat) · Socket.io · Tailwind CSS v4 + shadcn/ui · AWS S3 / Supabase Storage · Vercel AI SDK (Groq/Gemini free + OpenAI) · EAS Attestation
>
> **Team size:** 5 thành viên
>
> **Thời gian dự kiến:** 10 tuần (5 Sprint × 2 tuần)
>
> **Ghi chú:** Docker Sandbox dời sang **v2**. KYC hiện tại dùng **GitHub Auth**. Reputation dùng **EAS Attestation** (v1.5), chống Sybil dùng **Gitcoin Passport** (v2). Xem chi tiết tại [`RESEARCH.md`](./RESEARCH.md).

---

## MỤC LỤC

1. [Tổng Quan Đội Ngũ](#1-tổng-quan-đội-ngũ)
2. [Sơ Đồ Phụ Thuộc Giữa Các Module](#2-sơ-đồ-phụ-thuộc-giữa-các-module)
3. [Kiên — Smart Contract Engineer &amp; Backend Support](#3-kiên--smart-contract-engineer--backend-support)
4. [Khôi — Backend Lead &amp; AI Engineer](#4-khôi--backend-lead--ai-engineer)
5. [Hiếu — Backend Engineer &amp; Frontend Support](#5-hiếu--backend-engineer--frontend-support)
6. [Hân — UI/UX Designer &amp; QA Engineer](#6-hân--uiux-designer--qa-engineer)
7. [Trâm — UI/UX Designer &amp; Test Engineer](#7-trâm--uiux-designer--test-engineer)
8. [Lịch Trình Phối Hợp Theo Sprint](#8-lịch-trình-phối-hợp-theo-sprint)
9. [Quy Tắc Làm Việc Chung](#9-quy-tắc-làm-việc-chung)

---

## 1. TỔNG QUAN ĐỘI NGŨ

| Thành viên    | Vai trò chính                           | Trách nhiệm cốt lõi                                                                                                            |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Kiên** | Smart Contract Engineer + Backend Support | Solidity, Hardhat, EIP-712, Oracle, EAS Attestation, contract testing, deployment, hỗ trợ Khôi & Hiếu về BE                   |
| **Khôi** | Backend Lead & AI Engineer                | Prisma schema, Socket.io, AI Guard, AI Dispute (Multi-Agent Debate), AI Test Gen, Model Router, SC module integration, hỗ trợ FE |
| **Hiếu** | Backend Engineer & Frontend Support       | GraphQL server, auth middleware, marketplace, escrow, dispute, notifications, analytics, GitHub, hỗ trợ FE                       |
| **Hân**  | UI/UX Designer & QA Engineer              | Frontend pages, shadcn/ui components, responsive design, design system, Playwright E2E testing                                     |
| **Trâm** | UI/UX Designer & Test Engineer            | Frontend pages, component library, design tokens, Vitest unit/integration testing, accessibility                                   |

### Phân bổ theo module

| Module                                           | Primary Owner | Secondary / Hỗ trợ                                     |
| ------------------------------------------------ | ------------- | -------------------------------------------------------- |
| **Prisma Schema & Database**               | Khôi         | All member (review)                                     |
| **Next.js Custom Server**                  | Khôi         | Hiếu                                                    |
| **GraphQL API Server**                     | Hiếu         | Khôi (AI resolvers, Socket.io events)                   |
| **Thirdweb Auth**                          | Hiếu         | Khôi                                                    |
| **User Management**                        | Hiếu         | Hân (profile UI), Khôi (DB schema)                     |
| **Marketplace (Issue CRUD)**               | Hiếu         | Khôi (DB queries), Hân, Trâm (UI + testing)           |
| **Smart Contracts (Escrow)**               | Kiên         | Khôi (backend integration), Hiếu (GraphQL integration) |
| **EIP-712 Off-chain Signing**              | Kiên         | Khôi (frontend integration)                             |
| **Oracle/Relayer**                         | Kiên         | Khôi                                                    |
| **Socket.io + Chat**                       | Khôi         | Hiếu (GraphQL chat module), Hân (chat UI)              |
| **AI Guard (Chat Masking)**                | Khôi         | —                                                       |
| **AI Test Case Generator**                 | Khôi         | Hiếu (GraphQL integration)                              |
| **AI Dispute Assistant**                   | Khôi         | Kiên (contract dispute flow)                            |
| **AI Multi-Agent Debate**                  | Khôi         | Kiên (verdict → on-chain)                              |
| **Model Router (Groq/Gemini free)**        | Khôi         | —                                                       |
| **EAS Attestation (Reputation)**           | Kiên         | Khôi (backend trigger)                                  |
| **Gitcoin Passport (Anti-Sybil)**          | Khôi         | — (v2)                                                  |
| **File Upload (AWS S3/Supabase)**          | Khôi         | Trâm (testing)                                          |
| **Notifications**                          | Hiếu         | Khôi (Socket.io push), Hân (notification UI)           |
| **Analytics Dashboard**                    | Hiếu         | Hân, Trâm (chart UI + testing)                         |
| **GitHub Integration + GitHub Auth (KYC)** | Hiếu         | Khôi (OAuth flow), Kiên (auto-payment trigger)         |
| **UI Components (shadcn/ui)**              | Hân, Trâm   | Khôi, Hiếu (FE support)                                |
| **Design System & Figma**                  | Hân, Trâm   | —                                                       |
| **Frontend Pages Implementation**          | Hân, Trâm   | Khôi, Hiếu (FE support, code review)                   |
| **E2E Testing (Playwright)**               | Hân          | Trâm                                                    |
| **Unit/Integration Testing**               | Trâm         | Hân                                                     |
| **Smart Contract Testing**                 | Kiên         | —                                                       |
| **CI/CD Pipeline**                         | Khôi         | Hiếu                                                    |

### Docker Sandbox — Dời sang v2

Tất cả các task liên quan đến Docker sandbox, code-server, CI/CD test runner, blackbox trace sẽ được **loại bỏ khỏi v1** và chuyển sang roadmap v2. Lý do: giảm độ phức tạp cho MVP, tập trung vào core flow (marketplace + escrow + chat + dispute).

---

## 2. SƠ ĐỒ PHỤ THUỘC GIỮA CÁC MODULE

```
┌──────────────────────────────────────────────────────────────────┐
│                        PHỤ THUỘC CHÍNH                           │
│                                                                  │
│  Foundation (Prisma Schema, DB, Next.js Server)                  │
│       │                                                          │
│       ├── Auth (Thirdweb) ─────────────────────────────┐         │
│       │    │                                           │         │
│       │    ├── User Profile ──┐                        │         │
│       │    │                  │                        │         │
│       │    └── Notifications ─┤                        │         │
│       │                       │                        │         │
│       ├── Marketplace (Issue CRUD) ──┐                 │         │
│       │    │                         │                 │         │
│       │    ├── Search & Filter       │                 │         │
│       │    └── Apply/Assign Flow     │                 │         │
│       │                              │                 │         │
│       ├── Smart Contracts (Kiên) ────┤                 │         │
│       │    │                         │                 │         │
│       │    ├── BloodyRoarEscrow.sol  │                 │         │
│       │    ├── EIP-712 Signing       │                 │         │
│       │    └── Oracle/Relayer        │                 │         │
│       │                              │                 │         │
│       ├── Escrow Integration ────────┤                 │         │
│       │    │                         │                 │         │
│       │    ├── Deposit Flow          │                 │         │
│       │    ├── Release/Refund Flow   │                 │         │
│       │    └── Cancel Flow           │                 │         │
│       │                              │                 │         │
│       ├── Chat + Socket.io (Khôi) ───┤                 │         │
│       │    │                         │                 │         │
│       │    ├── Room Management       │                 │         │
│       │    ├── Message Persistence   │                 │         │
│       │    └── File Upload           │                 │         │
│       │                              │                 │         │
│       ├── AI Guard (Khôi) ───────────┤                 │         │
│       │    │                         │                 │         │
│       │    ├── Regex Patterns        │                 │         │
│       │    ├── GPT-4o-mini Detection │                 │         │
│       │    └── AI Pipeline           │                 │         │
│       │                              │                 │         │
│       ├── Dispute Resolution ────────┤                 │         │
│       │    │                         │                 │         │
│       │    ├── AI Dispute Assistant  │                 │         │
│       │    ├── Admin Dashboard       │                 │         │
│       │    └── 24h Challenge Period  │                 │         │
│       │                              │                 │         │
│       ├── GitHub Auth (KYC) ─────────┤                 │         │
│       │    │                         │                 │         │
│       │    ├── OAuth Login           │                 │         │
│       │    ├── Repo Linking          │                 │         │
│       │    └── Webhook (PR merged)   │                 │         │
│       │                              │                 │         │
│       └── Analytics Dashboard ───────┘                 │         │
│                                                        │         │
│  Frontend (Hân, Trâm + Khôi, Hiếu support) ────────────┘         │
│       │                                                          │
│       ├── shadcn/ui Component Library                            │
│       ├── Page Layouts (Marketplace, Dashboard, Admin...)        │
│       ├── Responsive Design                                      │
│       ├── Design Tokens & Figma                                  │
│       └── Accessibility                                          │
│                                                                  │
│  Testing (Hân, Trâm) ────────────────────────────────────────────┤
│       │                                                          │
│       ├── Vitest (Unit + Integration)                            │
│       └── Playwright (E2E)                                       │
│                                                                  │
│  DevOps (Khôi + Hiếu) ───────────────────────────────────────────┤
│                                                                  │
│       ├── GitHub Actions CI/CD                                   │
│       ├── Railway/Fly.io Deployment                              │
│       └── Neon/Supabase Database                                 │
└──────────────────────────────────────────────────────────────────┘
```

### Các module có thể phát triển song song

| Nhóm module độc lập                             | Có thể làm song song                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| **Nhóm 1:** Smart Contracts + EIP-712        | Không phụ thuộc BE/FE, Kiên làm độc lập              |
| **Nhóm 2:** AI Guard + AI Dispute            | Khôi research + train model độc lập, tích hợp sau      |
| **Nhóm 3:** UI/UX Design + Component Library | Hân, Trâm làm độc lập với Figma                       |
| **Nhóm 4:** Foundation + Auth + Marketplace  | Khôi (Prisma, Socket.io) + Hiếu (GraphQL, Auth) phối hợp |
| **Nhóm 5:** Testing                          | Song song với development, viết test khi code hoàn thành |

### Bảng tiên quyết (Prerequisites)

| Module                     | Điều kiện tiên quyết                        | Blocker nếu thiếu                |
| -------------------------- | ------------------------------------------------ | ---------------------------------- |
| Auth                       | Foundation (Prisma schema có User table)        | Không có user trong DB           |
| User Profile               | Auth (cần session user)                         | Không biết user nào đang login |
| GitHub Auth (KYC)          | Auth                                             | Không có user để link GitHub   |
| Marketplace (Create Issue) | Auth + User Profile                              | Không biết ai tạo issue         |
| Marketplace (Apply)        | Auth + Marketplace (list issues)                 | Không có issues để apply       |
| Marketplace (Assign)       | Auth + Marketplace (apply)                       | Không có applicants để chọn   |
| Escrow (Deposit)           | Marketplace (assign) + Smart Contract (deployed) | Không có developer để deposit  |
| Escrow (Release)           | Escrow (deposited)                               | Chưa có tiền trong contract     |
| Chat                       | Auth + Marketplace (assigned)                    | Không có room để chat          |
| AI Guard                   | Chat (cần message stream)                       | Không có message để scan       |
| Dispute                    | Escrow + AI Guard                                | Không có escrow để dispute     |
| AI Dispute Assistant       | Dispute (cần case data)                         | Không có case để phân tích   |
| Notifications              | Auth                                             | Không có user để gửi          |
| Analytics                  | Marketplace + Escrow (cần data)                 | Không có data để thống kê    |
| GitHub Integration         | Auth + GitHub Auth                               | Không có repo để link          |

---

## 3. KIÊN — SMART CONTRACT ENGINEER & BACKEND SUPPORT

### Vai trò

Chịu trách nhiệm chính layer blockchain: thiết kế, phát triển, kiểm thử và triển khai smart contract trên **Ethereum L1 (Sepolia Testnet + Mainnet)**. Đồng thời **hỗ trợ backend** cho Khôi và Hiếu: review code, hỗ trợ tích hợp contract vào BE, hỗ trợ EIP-712 flow, Oracle/Relayer.

### Công cụ & Công nghệ

| Mục                  | Lựa chọn                                              | Ghi chú                        |
| --------------------- | ------------------------------------------------------- | ------------------------------- |
| Ngôn ngữ            | **Solidity 0.8.24**                               | Dùng OpenZeppelin v5.x         |
| Framework             | **Hardhat**                                       | JS/TS-based, console.log debug  |
| Testing               | **Hardhat + Chai**                                | Unit tests + gas report         |
| Network (dev)         | Hardhat local node                                      | `npx hardhat node`            |
| Network (testnet)     | **Ethereum Sepolia** (chainId: 11155111)    | Faucet lấy test ETH, Etherscan verify    |
| Network (mainnet)     | **Ethereum Mainnet** (chainId: 1)           | L1 EVM, bảo mật cao nhất               |
| RPC Provider          | **Alchemy** hoặc **Infura**               | Free tier đủ dùng              |
| Contract Verification | **Etherscan**                              | Verify source code              |
| Wallet (dev)          | Hardhat accounts                                        | Private key từ local node      |
| Wallet (deploy)       | Admin wallet (Metamask)                                 | Quản lý riêng, không commit |

### Nhiệm vụ chi tiết

#### Phase 1: Thiết lập môi trường (Sprint 0 — Tuần 1)

| #     | Task                       | Mô tả                                                 | Deliverable                       |
| ----- | -------------------------- | ------------------------------------------------------- | --------------------------------- |
| K-1.1 | Khởi tạo Hardhat project | Cài Hardhat, cấu hình`hardhat.config.ts`, networks | `apps/blockchain/` hoạt động |
| K-1.2 | Cài OpenZeppelin          | `@openzeppelin/contracts` v5.x                        | Dependency sẵn sàng             |

**Điều kiện tiên quyết:** Không — Smart Contract độc lập với BE/FE

#### Phase 2: Escrow Contract (Sprint 1 — Tuần 2-3)

| #      | Task                                        | Mô tả                                                                         | Deliverable          |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| K-2.1  | Thiết kế state machine                    | 5 states: AWAITING_DELIVERY → COMPLETED/CANCELLED/DISPUTED/RESOLUTION_PROPOSED | State diagram + spec |
| K-2.2  | Viết`BloodyRoarEscrow.sol` — Base       | Constructor, state enum, events, modifiers                                      | Contract skeleton    |
| K-2.3  | `deposit(issueId, worker)`                | Lock funds, emit Deposited                                                      | Function implemented |
| K-2.4  | `releaseFunds(issueId)`                   | Client-only, transfer to worker, emit Released                                  | Function implemented |
| K-2.5  | `mutualCancel(issueId)`                   | Both sign, 100% refund client, emit Cancelled                                   | Function implemented |
| K-2.6  | `claimTimeout(issueId)`                   | Worker claim after 30 days client inactivity                                    | Function implemented |
| K-2.7  | `raiseDispute(issueId)`                   | Either party, lock funds, emit Disputed                                         | Function implemented |
| K-2.8  | `proposeResolution(issueId, clientRatio)` | Arbiter-only, 24h timelock, emit ResolutionProposed                             | Function implemented |
| K-2.9  | `challengeResolution(issueId)`            | Either party during 24h window                                                  | Function implemented |
| K-2.10 | `executeResolution(issueId)`              | After 24h no challenge, split funds                                             | Function implemented |
| K-2.11 | `pause()` / `unpause()`                 | Owner-only circuit breaker                                                      | Function implemented |
| K-2.12 | Viết full unit tests (14+ cases)           | Deposit, release, cancel, timeout, dispute, partial resolution, timelock, pause | 14+ tests passing    |
| K-2.13 | Gas optimization report                     | Đo gas từng function, tối ưu                                                | Gas report           |
| K-2.14 | Security review                             | Check reentrancy, access control, integer overflow                              | Security checklist   |

**Điều kiện tiên quyết:** K-1 (Hardhat setup)
**Blocker cho:** Khôi (Escrow integration backend)

#### Phase 3: EIP-712 & Tích hợp (Sprint 2 — Tuần 4-5)

| #     | Task                                  | Mô tả                                                        | Deliverable               |
| ----- | ------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| K-3.1 | Thiết kế EIP-712 schema             | Định nghĩa typed data cho off-chain commitment              | EIP-712 domain + types    |
| K-3.2 | Viết helper`signCommitment()`      | JS/TS utility để tạo signature (dùng Viem/ethers)          | Helper function           |
| K-3.3 | Viết`verifyCommitment()` on-chain  | Smart contract verify EIP-712 signature                        | Contract function         |
| K-3.4 | Viết Oracle/Relayer service          | Node.js script: nhận event → ký tx → gọi releaseFunds     | Relayer hoạt động      |
| K-3.5 | Hỗ trợ Khôi tích hợp contract BE | Review code Thirdweb SDK integration, GraphQL escrow resolvers | Integration review        |
| K-3.6 | Deploy Escrow lên testnet            | Deploy + verify + document contract address                    | Contract address public   |
| K-3.7 | Hỗ trợ Hiếu backend logic          | Review marketplace + escrow logic, hỗ trợ debug              | Code review               |
| K-3.8 | Hỗ trợ dispute flow                 | Hỗ trợ Khôi thiết kế dispute state machine trên contract | Dispute flow hoàn chỉnh |

**Điều kiện tiên quyết:** K-2 (Escrow contract hoàn thành), Khôi/Hiếu (Marketplace BE ready)

#### Phase 4: EAS Attestation — Reputation On-chain (Sprint 4 — Tuần 8-9, v1.5)

| #     | Task                                 | Mô tả                                                              | Deliverable     |
| ----- | ------------------------------------ | -------------------------------------------------------------------- | --------------- |
| K-4.1 | Research EAS SDK                     | Đọc tài liệu EAS, cấu hình SDK trên Ethereum L1           | Knowledge base  |
| K-4.2 | Thiết kế Reputation Schema         | Định nghĩa schema attestation:`{completedTask, rating, skills}` | Schema design   |
| K-4.3 | Viết`attestCompletion()` helper   | Gọi EAS.attest() khi task complete                                  | Helper function |
| K-4.4 | Viết`revokeAttestation()`         | Revoke khi dispute phát hiện gian lận                             | Helper function |
| K-4.5 | Viết verify helper (off-chain read) | Query attestations của 1 address                                    | Verify helper   |
| K-4.6 | Hỗ trợ Khôi tích hợp BE trigger | Task complete → gọi attestation (gasless bởi platform)            | Integration     |

**Điều kiện tiên quyết:** K-3 (Escrow deployed), Khôi (Escrow integration BE)

#### Kết quả đầu ra của Kiên

| Deliverable                  | Mô tả                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `BloodyRoarEscrow.sol`     | Escrow v2: lazy-deposit, dispute, timelock, partial release, pause |
| Unit tests (14+ cases)       | Full coverage escrow contract                                      |
| EIP-712 schema + sign/verify | Off-chain commitment mechanism                                     |
| Oracle/Relayer script        | Tự động ký tx khi event trigger                                |
| EAS Attestation integration  | Reputation on-chain: attest/revoke/verify                          |
| Gas report                   | Tối ưu gas từng function                                        |
| Deployment scripts           | Deploy lên testnet + mainnet                                      |
| Hardhat config               | Multi-network, verify, gas reporter                                |
| Tài liệu contract API      | Function signatures, events, errors                                |
| BE support                   | Code review + hỗ trợ Khôi & Hiếu tích hợp contract           |

---

## 4. KHÔI — BACKEND LEAD & AI ENGINEER

### Vai trò

**Backend Lead** kiêm AI Engineer. Chịu trách nhiệm: Prisma schema & database, Socket.io server, toàn bộ layer AI (AI Guard, AI Dispute Assistant), tích hợp smart contract vào backend. Đồng thời **hỗ trợ frontend** (code review, logic phức tạp, Web3 integration).

### Công cụ & Công nghệ

| Mục              | Lựa chọn                                 | Ghi chú                              |
| ----------------- | ------------------------------------------ | ------------------------------------- |
| Database          | **PostgreSQL 16** + **Prisma** | Schema, migrations, type-safe client  |
| Real-time         | **Socket.io**                        | Attach vào custom server             |
| LLM Provider      | **OpenAI GPT-4o / GPT-4o-mini**      | Chat guard + Dispute analysis         |
| AI SDK            | **Vercel AI SDK**                    | Unified provider interface, streaming |
| Prompt Management | File-based (Markdown/JSON trong repo)      | Version control prompts               |
| Regex Engine      | JavaScript native`RegExp`                | Tầng 1 AI Guard                      |
| File Storage      | **AWS S3 / Supabase Storage**        | Pre-signed URLs                       |
| Web3 Client       | **Thirdweb SDK**                     | Contract interaction từ backend      |
| Validation        | **Zod**                              | Shared validation schemas             |

### Nhiệm vụ chi tiết

#### Phase 1: Foundation (Sprint 0 — Tuần 1)

| #      | Task                                             | Mô tả                                                                                                        | Deliverable          |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------- |
| V-1.1  | Khởi tạo monorepo với Bun                     | `bun init`, cấu hình workspaces                                                                            | Monorepo structure   |
| V-1.2  | Tạo shared package                              | `packages/shared/` với Prisma schema                                                                        | Shared package       |
| V-1.3  | Thiết kế toàn bộ Prisma schema               | 10+ models: User, Issue, Application, Message, Escrow, Dispute, Notification, AIGuardLog, GithubLink, AuditLog | `schema.prisma`    |
| V-1.4  | Chạy migration đầu tiên                      | `prisma migrate dev` → tạo bảng trong PostgreSQL                                                          | Database sẵn sàng  |
| V-1.5  | Seed database                                    | Dữ liệu mẫu: admin user, sample issues                                                                      | `seed.ts`          |
| V-1.6  | Tạo Next.js app + custom server                 | `bun create next-app` + `server.ts` với GraphQL + Socket.io attach                                        | App chạy được    |
| V-1.7  | Cấu hình Tailwind CSS v4 + shadcn/ui           | Theme tokens, global CSS, init components                                                                      | CSS sẵn sàng       |
| V-1.8  | Cấu hình TypeScript strict + ESLint + Prettier | Lint rules, format on save                                                                                     | Code quality         |
| V-1.9  | Cấu hình Pino logger                           | Logger setup, request logging                                                                                  | Logging hoạt động |
| V-1.10 | Cấu hình env vars                              | `.env.example` với tất cả biến cần thiết                                                               | File env template    |
| V-1.11 | Viết`docker-compose.yml`                      | PostgreSQL service                                                                                             | Dev DB sẵn sàng    |
| V-1.12 | Đăng ký OpenAI API key                        | Tạo key, set up billing                                                                                       | API key + usage plan |
| V-1.13 | Research Vercel AI SDK + viết sample            | Hiểu cách integrate với Next.js                                                                             | Sample streaming     |
| V-1.14 | Research PII detection patterns                  | 20+ regex patterns                                                                                             | Pattern library      |
| V-1.15 | Tạo thư mục`prompts/` trong repo            | Cấu trúc prompt chuẩn                                                                                       | Prompt templates     |

**Điều kiện tiên quyết:** Không — Foundation là bước đầu tiên
**Blocker cho:** TOÀN BỘ TEAM

#### Phase 2: Socket.io + Chat (Sprint 1 — Tuần 2-3)

| #     | Task                                     | Mô tả                                        | Deliverable        |
| ----- | ---------------------------------------- | ---------------------------------------------- | ------------------ |
| V-2.1 | Setup Socket.io server                   | Attach vào HTTP custom server, CORS           | Socket.io chạy    |
| V-2.2 | Viết Socket.io Auth middleware          | Verify Thirdweb JWT từ handshake              | Auth middleware    |
| V-2.3 | Viết Room Management                    | `join:task`, `leave:task`                  | Rooms hoạt động |
| V-2.4 | Viết Message handler                    | Save message vào DB (Prisma), broadcast       | Chat hoạt động  |
| V-2.5 | Viết File upload trong chat             | Upload → S3 presigned URL → gửi qua message | File sharing       |
| V-2.6 | Viết Chat Prisma model + migration      | Message model                                  | DB schema          |
| V-2.7 | Hỗ trợ Hiếu viết Chat GraphQL module | `messages(issueId)` query                    | Chat resolvers     |

**Điều kiện tiên quyết:** V-1 (Foundation), Hiếu hoàn thành Auth + Marketplace assign

#### Phase 3: AI Guard (Sprint 2 — Tuần 4)

| #     | Task                                         | Mô tả                                                                     | Deliverable           |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------- | --------------------- |
| V-3.1 | Viết Regex pattern library                  | 20+ patterns: private keys, API keys, mnemonics, connection strings, emails | `patterns.ts`       |
| V-3.2 | Viết`RegexScanner` class                  | Scan text, mask với`***REDACTED***`                                      | Class hoạt động    |
| V-3.3 | Viết GPT-4o-mini system prompt              | PII detection in context                                                    | `guard-system.txt`  |
| V-3.4 | Viết`AIGuardService` class                | Orchestrate: Regex → GPT → response, logging                              | Service class         |
| V-3.5 | Tích hợp AIGuard vào Socket.io middleware | Message tự động scan + mask trước broadcast                            | AI Guard hoạt động |
| V-3.6 | Viết 50+ test cases                         | API keys, private keys, emails, phones, DB URIs                             | Test suite            |
| V-3.7 | Đánh giá accuracy                         | False positive/negative rate                                                | Accuracy report >95%  |

**Điều kiện tiên quyết:** V-2 (Socket.io + Chat)

#### Phase 4: Escrow Integration (Sprint 2 — Tuần 5)

| #     | Task                                       | Mô tả                                       | Deliverable           |
| ----- | ------------------------------------------ | --------------------------------------------- | --------------------- |
| V-4.1 | Cấu hình Thirdweb SDK backend            | Kết nối contract, admin wallet              | Thirdweb hoạt động |
| V-4.2 | Viết Escrow Prisma model + migration      | Escrow model                                  | DB schema             |
| V-4.3 | Viết Transaction logger                   | Lưu txHash sau mỗi on-chain tx              | Audit log             |
| V-4.4 | Hỗ trợ Hiếu viết Escrow GraphQL module | Types + mutations với contract call          | Escrow resolvers      |
| V-4.5 | Tích hợp EIP-712 signing flow            | Frontend: gọi Thirdweb SDK → ký → gửi BE | E2E signing           |
| V-4.6 | Hỗ trợ Kiên Oracle/Relayer              | Kết nối Relayer với backend event system   | Integration           |

**Điều kiện tiên quyết:** V-2 (Socket.io), Kiên (EIP-712 schema + contract deployed), Hiếu (Marketplace)

#### Phase 5: AI Test Case Generator (Sprint 2 — Tuần 4-5)

| #     | Task                                  | Mô tả                                                                            | Deliverable            |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| V-5.1 | Thiết kế prompt cho Test Gen        | System prompt: phân tích mô tả bug → sinh test cases                          | `testgen-system.txt` |
| V-5.2 | Viết`TestGenerator` class          | Input: issue desc → Output:`{ testCases[], acceptanceCriteria[], edgeCases[] }` | Generator class        |
| V-5.3 | Xử lý structured output             | JSON schema cho test cases (given/when/then)                                       | Output parser          |
| V-5.4 | Viết Prisma model cho Test Cases     | Lưu generated test cases gắn với issue                                          | DB schema              |
| V-5.5 | Hỗ trợ Hiếu viết GraphQL mutation | `generateTestCases(issueId)`                                                     | AI resolver            |
| V-5.6 | Viết UI flow cho review test cases   | Client approve/chỉnh sửa test cases trước khi publish                          | Review flow            |

**Điều kiện tiên quyết:** V-1 (Foundation), Hiếu (Marketplace createIssue)

#### Phase 6: Model Router (Sprint 2 — Tuần 4-5)

| #     | Task                                      | Mô tả                                                                         | Deliverable          |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| V-6.1 | Đăng ký Groq API key (free)            | Tạo account, lấy key                                                          | Groq credentials     |
| V-6.2 | Đăng ký Google AI Studio (Gemini free) | Tạo key cho Gemini Flash                                                       | Gemini credentials   |
| V-6.3 | Viết`ModelRouter` class                | Chọn model theo task: Guard→llama-8b, TestGen→llama-70b, Judge→gpt-oss-120b | Router class         |
| V-6.4 | Cấu hình Vercel AI SDK multi-provider   | OpenAI + Groq + Google trong cùng SDK                                          | Multi-provider setup |
| V-6.5 | Viết fallback logic                      | Model lỗi → chuyển model dự phòng                                          | Fallback             |

**Điều kiện tiên quyết:** V-1 (Foundation)

#### Phase 7: AI Dispute Assistant + Multi-Agent Debate (Sprint 3 — Tuần 6-7)

| #      | Task                                          | Mô tả                                                         | Deliverable         |
| ------ | --------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| V-7.1  | Thiết kế prompt chain                       | Multi-step: summarize → analyze → recommend ratio             | Prompt chain design |
| V-7.2  | Viết`DisputeDataCollector`                 | Gom: issue desc + chat log + test cases + evidence              | Collector class     |
| V-7.3  | Thiết kế Multi-Agent Debate ("dive")        | 5 agent: Client Advocate, Dev Advocate, Critic, Judge, Verifier | Debate design       |
| V-7.4  | Viết prompt cho từng agent                  | Persona riêng cho 5 agent                                      | 5 prompt templates  |
| V-7.5  | Viết`DebateOrchestrator` class             | Điều phối vòng lặp tranh luận (config số vòng)          | Orchestrator class  |
| V-7.6  | Viết`DisputeAnalyzer` class (dùng debate) | Chạy debate → verdict`{ suggestedClientRatio, reasoning }`  | Analyzer class      |
| V-7.7  | Xử lý structured output                     | JSON schema cho verdict                                         | Output parser       |
| V-7.8  | Viết 10+ test scenarios                      | Scope creep, malicious tests, ghosting                          | Test suite          |
| V-7.9  | Hỗ trợ Hiếu viết Dispute GraphQL resolver | `analyzeDispute(issueId)`                                     | AI resolver         |
| V-7.10 | Hỗ trợ Kiên verdict → on-chain            | Verdict ratio → gọi proposeResolution()                       | Integration         |
| V-7.11 | Đánh giá chất lượng debate              | So sánh debate vs 1 model đơn lẻ, accuracy                  | Evaluation report   |

**Điều kiện tiên quyết:** V-4 (Escrow Integration), V-6 (Model Router), Hiếu (Dispute module), Kiên (Escrow contract)

#### Phase 8: CI/CD + Deploy + FE Support (Sprint 3-4 — Tuần 7-10)

| #     | Task                                      | Mô tả                                         | Deliverable            |
| ----- | ----------------------------------------- | ----------------------------------------------- | ---------------------- |
| V-8.1 | Viết GitHub Actions CI                   | Lint → Type-check → Vitest → Build           | CI pipeline            |
| V-8.2 | Cấu hình Deployment                     | Railway/Fly.io deploy, DB production            | Deploy hoạt động    |
| V-8.3 | Cấu hình Sentry                         | Error tracking BE + FE                          | Sentry hoạt động    |
| V-8.4 | Cấu hình domain + SSL                   | Cloudflare                                      | Domain sẵn sàng      |
| V-8.5 | Viết Health check endpoint               | `/api/health`                                 | Monitoring             |
| V-8.6 | Hỗ trợ Hân & Trâm FE                  | Code review, Web3 integration, logic phức tạp | FE code review         |
| V-8.7 | Hỗ trợ Kiên tích hợp EAS attestation | Task complete → trigger attestation từ BE     | Reputation integration |

**Điều kiện tiên quyết:** Tất cả module hoàn thành

#### Kết quả đầu ra của Khôi

| Deliverable             | Mô tả                                                |
| ----------------------- | ------------------------------------------------------ |
| Monorepo structure      | Bun workspaces, shared package                         |
| Prisma schema           | 10+ models với migrations                             |
| Next.js custom server   | server.ts với GraphQL Yoga + Socket.io                |
| Socket.io server        | Room management, auth, message handling                |
| AIGuardService          | 2-tầng: Regex + LLM PII masking                       |
| Regex pattern library   | 20+ patterns                                           |
| TestGenerator           | AI sinh test cases từ mô tả bug                     |
| ModelRouter             | Chọn model free theo task (Groq/Gemini)               |
| DebateOrchestrator      | Multi-agent debate (5 agents, config vòng)            |
| DisputeAnalyzer         | Debate → verdict structured JSON                      |
| Prompt collection       | 10+ prompt templates (guard, testgen, 5 debate agents) |
| AI test suite           | 50+ AI Guard tests, 10+ Dispute tests                  |
| Escrow integration      | Thirdweb SDK backend + EIP-712 flow                    |
| EAS attestation trigger | Task complete → attestation                           |
| File upload (S3)        | Pre-signed URL upload                                  |
| CI/CD pipeline          | GitHub Actions                                         |
| Deployment              | Railway/Fly.io + Neon/Supabase                         |
| Accuracy report         | AI Guard + TestGen + Debate evaluation                 |

---

## 5. HIẾU — BACKEND ENGINEER & FRONTEND SUPPORT

### Vai trò

Chịu trách nhiệm chính về GraphQL API server (Yoga + Pothos), Thirdweb Auth, marketplace business logic, dispute module, notifications, analytics, GitHub integration. Đồng thời **hỗ trợ frontend** cùng Khôi: code review, tích hợp API, debug.

### Công cụ & Công nghệ

| Mục       | Lựa chọn                      | Ghi chú                |
| ---------- | ------------------------------- | ----------------------- |
| Runtime    | **Next.js Custom Server** | Dùng chung với Khôi  |
| API        | **GraphQL Yoga + Pothos** | Code-first schema       |
| Auth       | **Thirdweb Auth**         | SIWE, JWT               |
| Validation | **Zod**                   | Schema validation       |
| Logging    | **Pino**                  | Structured JSON logging |

### Nhiệm vụ chi tiết

#### Phase 1: Hỗ trợ Foundation (Sprint 0 — Tuần 1)

| #     | Task                                | Mô tả                                        | Deliverable         |
| ----- | ----------------------------------- | ---------------------------------------------- | ------------------- |
| H-1.1 | Hỗ trợ Khôi review Prisma schema | Review models, relations, constraints          | Schema review       |
| H-1.2 | Hỗ trợ Khôi setup Next.js server | Cùng cấu hình GraphQL Yoga attach           | Server hoạt động |
| H-1.3 | Research GraphQL Yoga + Pothos      | Hiểu code-first schema builder, Prisma plugin | Knowledge base      |

**Điều kiện tiên quyết:** Không
**Blocker cho:** TOÀN BỘ TEAM

#### Phase 2: GraphQL Server + Auth (Sprint 1 — Tuần 2)

| #     | Task                              | Mô tả                                               | Deliverable              |
| ----- | --------------------------------- | ----------------------------------------------------- | ------------------------ |
| H-2.1 | Setup Pothos SchemaBuilder        | `builder.ts` với Prisma plugin                     | SchemaBuilder sẵn sàng |
| H-2.2 | Viết Context factory             | Inject Prisma client + current user                   | Context hoạt động     |
| H-2.3 | Tích hợp Thirdweb Auth          | Cấu hình provider, middleware                       | Auth hoạt động        |
| H-2.4 | Viết Auth middleware cho GraphQL | Check JWT, inject user vào context                   | Protected queries        |
| H-2.5 | Viết User module                 | Query`me`, `user(id)`, Mutation `updateProfile` | User resolvers           |
| H-2.6 | Viết Prisma seed cho admin       | Seed admin user                                       | Admin account            |

**Điều kiện tiên quyết:** V-1 (Foundation — Prisma schema ready)
**Blocker cho:** Hân, Trâm (cần Auth để test UI)

#### Phase 3: Marketplace (Sprint 1 — Tuần 3)

| #     | Task                        | Mô tả                                                   | Deliverable           |
| ----- | --------------------------- | --------------------------------------------------------- | --------------------- |
| H-3.1 | Viết Issue module — Types | Pothos types: Issue, IssueStatus, IssueFilter, Pagination | Type definitions      |
| H-3.2 | Viết Issue Queries         | `issues(filter, pagination)`, `issue(id)`             | Query resolvers       |
| H-3.3 | Viết Issue Mutations       | `createIssue`, `updateIssue`, `cancelIssue`         | Mutation resolvers    |
| H-3.4 | Viết Application module    | `applyIssue`, `getApplicants`, `assignDeveloper`    | Application resolvers |
| H-3.5 | Viết Search & Filter logic | Prisma`where` + `orderBy` + cursor pagination         | Search hoạt động   |

**Điều kiện tiên quyết:** H-2 (Auth + User)
**Blocker cho:** Hân/Trâm (UI cần API), Khôi (Chat cần task), Kiên (Escrow cần issue)

#### Phase 4: Chat GraphQL + Dispute (Sprint 2 — Tuần 4-5)

| #     | Task                                 | Mô tả                                                                          | Deliverable       |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------- | ----------------- |
| H-4.1 | Viết Chat GraphQL module            | `messages(issueId)` query, types                                               | Chat resolvers    |
| H-4.2 | Viết Dispute module — Types        | Pothos types: Dispute, DisputeStatus                                             | Type definitions  |
| H-4.3 | Viết Dispute Queries + Mutations    | `getDispute`, `raiseDispute`, `proposeResolution`, `challengeResolution` | Dispute resolvers |
| H-4.4 | Tích hợp AI Dispute Assistant      | Gọi DisputeAnalyzer (của Khôi) trong resolver                                 | AI integration    |
| H-4.5 | Hỗ trợ Khôi Escrow GraphQL module | Types: Escrow, EscrowStatus                                                      | Escrow types      |

**Điều kiện tiên quyết:** H-3 (Marketplace), Khôi (Socket.io + AIGuardService), Kiên (Escrow)

#### Phase 5: Escrow + Notifications (Sprint 2-3 — Tuần 5-6)

| #     | Task                       | Mô tả                                                 | Deliverable        |
| ----- | -------------------------- | ------------------------------------------------------- | ------------------ |
| H-5.1 | Viết Escrow Mutations     | `depositToEscrow`, `releaseFunds`, `cancelEscrow` | Mutation resolvers |
| H-5.2 | Viết Notification module  | DB persistence + GraphQL queries                        | Notifications      |
| H-5.3 | Gắn notification triggers | New applicant, assigned, dispute, paid                  | Auto-notify        |
| H-5.4 | Viết Admin resolvers      | Admin-only queries: all users, all disputes             | Admin API          |

**Điều kiện tiên quyết:** H-3 (Marketplace), Khôi (Escrow integration)

#### Phase 6: GitHub Auth (KYC) + Analytics (Sprint 3 — Tuần 6-7)

| #     | Task                                            | Mô tả                                               | Deliverable              |
| ----- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------ |
| H-6.1 | Đăng ký GitHub OAuth App                     | Client ID + secret, callback URL                      | OAuth credentials        |
| H-6.2 | Viết GitHub OAuth flow                         | Login with GitHub → verify → link account           | GitHub Auth hoạt động |
| H-6.3 | Viết GitHub verify GraphQL mutation            | `linkGithub` — lưu GitHub username, verify status | User.verified = true     |
| H-6.4 | Đăng ký GitHub App (webhook)                 | App ID + private key + webhook secret                 | Webhook setup            |
| H-6.5 | Viết Webhook handler (`pull_request.merged`) | Nhận webhook → verify → trigger                    | Webhook hoạt động     |
| H-6.6 | Viết auto-payment trigger                      | PR merged → khớp issue → gọi releaseFunds         | Auto-payment             |
| H-6.7 | Viết Analytics queries                         | SQL aggregate: task count, revenue, dispute rate      | Analytics data           |
| H-6.8 | Viết Analytics GraphQL queries                 | `adminStats`, `userStats(userId)`                 | Analytics resolvers      |
| H-6.9 | Viết GraphQL mutation`linkGithubRepo`        | Lưu repo URL + installation ID                       | Repo linking             |

**Điều kiện tiên quyết:** H-2 (Auth), H-3 (Marketplace), H-5 (Escrow)

#### Phase 7: FE Support + Documentation (Sprint 3-4 — Tuần 7-10)

| #     | Task                                    | Mô tả                                       | Deliverable   |
| ----- | --------------------------------------- | --------------------------------------------- | ------------- |
| H-7.1 | Hỗ trợ Hân & Trâm FE implementation | Code review, bug fix, API integration         | FE support    |
| H-7.2 | Viết tài liệu GraphQL API            | Schema reference, example queries             | API docs      |
| H-7.3 | Viết README.md + Setup guide           | Run được từ`bun install && bun run dev` | Documentation |

**Điều kiện tiên quyết:** Tất cả module hoàn thành

#### Kết quả đầu ra của Hiếu

| Deliverable          | Mô tả                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| GraphQL API (Pothos) | 8 modules: User, Issue, Application, Chat, Escrow, Dispute, Notification, Analytics |
| Auth middleware      | Thirdweb JWT verification                                                           |
| Marketplace CRUD     | Issue + Application + Search/Filter                                                 |
| Dispute module       | Raise, analyze, resolve, challenge                                                  |
| Notification system  | DB persistence + real-time push                                                     |
| GitHub Auth (KYC)    | OAuth login → verify user                                                          |
| GitHub Integration   | Webhook + auto-payment trigger                                                      |
| Analytics Dashboard  | Admin + user stats                                                                  |
| Admin API            | Admin-only queries                                                                  |
| API documentation    | Schema reference                                                                    |

---

## 6. HÂN — UI/UX DESIGNER & QA ENGINEER

### Vai trò

Thiết kế UI/UX cho toàn bộ frontend, xây dựng component library với shadcn/ui, đảm bảo responsive design và accessibility. Phụ trách E2E testing với Playwright. **Khôi và Hiếu hỗ trợ FE** (code review, logic phức tạp, Web3 integration).

### Công cụ & Công nghệ

| Mục              | Lựa chọn                         | Ghi chú                                      |
| ----------------- | ---------------------------------- | --------------------------------------------- |
| Thiết kế        | **Figma**                    | Design system, mockups, prototypes            |
| CSS Framework     | **Tailwind CSS v4**          | Utility-first                                 |
| Component Library | **shadcn/ui**                | Copy-paste components, Radix UI base          |
| Icons             | **Lucide React**             | Icon library                                  |
| E2E Testing       | **Playwright**               | Cross-browser testing                         |
| Animation         | **Framer Motion** (optional) | Page transitions, micro-interactions          |
| FE Support        | **Khôi, Hiếu**             | Code review, Web3 logic, API integration help |

### Nhiệm vụ chi tiết

#### Phase 1: Design System (Sprint 0 — Tuần 1)

| #     | Task                              | Mô tả                                                                        | Deliverable                    |
| ----- | --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| U-1.1 | Thiết kế Design Tokens          | Colors (dark theme Vercel-inspired), typography, spacing, shadows, radii       | Figma tokens + Tailwind config |
| U-1.2 | Thiết kế Layout System          | Navbar, Sidebar, Main Content                                                  | Figma layout + Next.js layout  |
| U-1.3 | Thiết kế Component variants     | Button, Input, Select, Dialog, Card, Table, Badge, Tabs, Toast                 | Figma components               |
| U-1.4 | Cấu hình shadcn/ui theme        | Override CSS variables khớp tokens                                            | `globals.css`                |
| U-1.5 | Thiết kế responsive breakpoints | Mobile-first: sm(640), md(768), lg(1024), xl(1280)                             | Breakpoint strategy            |
| U-1.6 | Thiết kế Loading + Error states | Skeleton screens, error boundaries, empty states                               | State patterns                 |
| U-1.7 | Thiết kế Mobile Navigation      | Hamburger menu → Sheet drawer, bottom tab bar, sticky action buttons          | Mobile nav design              |
| U-1.8 | Thiết kế responsive per page    | Marketplace (bottom sheet filter), Table → Card list, Chat full-screen mobile | Responsive spec                |

**Điều kiện tiên quyết:** V-1.7 (Tailwind setup)
**Blocker cho:** Trâm (cần design system để code components)

#### Phase 2: Core Pages UI (Sprint 1 — Tuần 2-3)

| #     | Task                               | Mô tả                                                        | Deliverable         |
| ----- | ---------------------------------- | -------------------------------------------------------------- | ------------------- |
| U-2.1 | Thiết kế Auth pages              | Login page, wallet connect flow, session expired               | Figma + React pages |
| U-2.2 | Thiết kế Main Layout             | Navbar (logo, search, notifications, avatar dropdown), sidebar | App layout          |
| U-2.3 | Thiết kế Profile page            | Avatar, bio, skills, reputation score, task history            | Profile page        |
| U-2.4 | Thiết kế Marketplace listing     | Grid card layout, filter bar, search input, sort dropdown      | Marketplace page    |
| U-2.5 | Thiết kế Issue Detail page       | Full description, bounty info, applicants list, action buttons | Issue detail page   |
| U-2.6 | Thiết kế Create Issue form       | Multi-step form: info → bounty → review                      | Create issue page   |
| U-2.7 | Thiết kế Dashboard               | My posted issues, my working issues, earnings summary          | Dashboard page      |
| U-2.8 | Thiết kế GitHub Auth (KYC) badge | Verified badge, connect GitHub button                          | KYC UI              |

**Điều kiện tiên quyết:** U-1 (Design System), Hiếu hoàn thành Auth + Marketplace API
**Blocker cho:** Trâm (cần UI xong để code)

#### Phase 3: Advanced Pages UI (Sprint 2 — Tuần 4-5)

| #     | Task                          | Mô tả                                                                           | Deliverable            |
| ----- | ----------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| U-3.1 | Thiết kế Chat UI            | Chat sidebar trong Issue Detail, message bubbles, file preview, typing indicator  | Chat component         |
| U-3.2 | Thiết kế Escrow UI          | Bounty status badge, deposit button, release button, transaction history timeline | Escrow components      |
| U-3.3 | Thiết kế Notification panel | Bell icon + dropdown, mark as read, notification list                             | Notification component |
| U-3.4 | Thiết kế Admin Dashboard    | Overview stats, charts (Tremor/Recharts), recent activity                         | Admin dashboard        |
| U-3.5 | Thiết kế Dispute Review     | Case list, AI report view, evidence viewer, resolution controls                   | Dispute management     |

#### Phase 4: Admin + Analytics UI (Sprint 3 — Tuần 6-7)

| #     | Task                              | Mô tả                                                        | Deliverable      |
| ----- | --------------------------------- | -------------------------------------------------------------- | ---------------- |
| U-4.1 | Thiết kế User Management        | User table, ban button, verified status filter                 | Admin users page |
| U-4.2 | Thiết kế Analytics page         | Revenue chart, task completion rate, dispute rate, user growth | Analytics page   |
| U-4.3 | Thiết kế GitHub repo linking UI | Connect repo, select repo for task                             | GitHub UI        |

#### Phase 5: E2E Testing (Sprint 3-4 — Tuần 7-10)

| #      | Task                        | Mô tả                                          | Deliverable             |
| ------ | --------------------------- | ------------------------------------------------ | ----------------------- |
| U-5.1  | Cài đặt Playwright       | `playwright.config.ts`, browsers               | Playwright sẵn sàng   |
| U-5.2  | Viết test Auth flow        | Login wallet → redirect → session persist      | `auth.spec.ts`        |
| U-5.3  | Viết test Marketplace flow | Create → browse → filter → view detail        | `marketplace.spec.ts` |
| U-5.4  | Viết test Apply flow       | Apply → client view applicants → assign        | `apply.spec.ts`       |
| U-5.5  | Viết test Chat flow        | Open chat → send message → AI guard → receive | `chat.spec.ts`        |
| U-5.6  | Viết test Escrow flow      | Sign EIP-712 → deposit → release → verify     | `escrow.spec.ts`      |
| U-5.7  | Viết test Dispute flow     | Raise → AI analyze → admin resolve → payout   | `dispute.spec.ts`     |
| U-5.8  | Viết test GitHub Auth flow | Connect GitHub → verified badge                 | `kyc.spec.ts`         |
| U-5.9  | Viết test Responsive       | Mobile, tablet, desktop                          | Responsive tests        |
| U-5.10 | Cấu hình CI Playwright    | GitHub Actions với Playwright reporters         | CI E2E                  |

**Điều kiện tiên quyết:** Tất cả module hoàn thành

#### Kết quả đầu ra của Hân

| Deliverable          | Mô tả                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Figma Design System  | Tokens, components, layouts, prototypes                                                               |
| shadcn/ui Theme      | CSS variables + Tailwind config                                                                       |
| 13+ Pages            | Auth, Marketplace, Issue Detail, Create Issue, Dashboard, Chat, Escrow, Admin, Analytics, GitHub Link |
| Responsive Design    | Mobile, tablet, desktop                                                                               |
| Playwright E2E tests | 9 spec files, full flow coverage                                                                      |
| E2E CI integration   | GitHub Actions chạy Playwright                                                                       |

---

## 7. TRÂM — UI/UX DESIGNER & TEST ENGINEER

### Vai trò

Đồng thiết kế UI/UX với Hân, xây dựng reusable components, đảm bảo accessibility (a11y). Phụ trách unit test và integration test với Vitest. **Khôi và Hiếu hỗ trợ FE** (code review, API integration help).

### Công cụ & Công nghệ

| Mục                  | Lựa chọn                                           | Ghi chú                            |
| --------------------- | ---------------------------------------------------- | ----------------------------------- |
| Thiết kế            | **Figma**                                      | Hỗ trợ Hân                       |
| Component Library     | **shadcn/ui**                                  | Cài đặt và customize components |
| Unit/Integration Test | **Vitest**                                     | Nhanh, ESM native                   |
| React Testing         | **@testing-library/react**                     | User-centric testing                |
| Accessibility         | **axe-core**, **eslint-plugin-jsx-a11y** | a11y audits                         |
| Animation             | **Framer Motion** (optional)                   | Micro-interactions                  |
| FE Support            | **Khôi, Hiếu**                               | Code review, logic phức tạp       |

### Nhiệm vụ chi tiết

#### Phase 1: Component Library (Sprint 0 — Tuần 1)

| #     | Task                            | Mô tả                                                                                        | Deliverable           |
| ----- | ------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| T-1.1 | Cài đặt shadcn/ui components | Button, Input, Select, Dialog, Card, Table, Badge, Tabs, Toast, DropdownMenu, Avatar, Skeleton | Components sẵn sàng |
| T-1.2 | Customize theme components      | Override variants, sizes, colors theo design tokens Hân tạo                                  | Customized components |
| T-1.3 | Xây dựng Form components      | FormField, FormInput, FormSelect, FormTextarea với React Hook Form + Zod                      | Form system           |
| T-1.4 | Xây dựng Layout components    | Navbar, Sidebar, PageLayout, Container, Grid                                                   | Layout components     |
| T-1.5 | Xây dựng Data Display         | DataTable (sortable, paginated), StatCard, Timeline, StatusBadge                               | Data components       |
| T-1.6 | Cấu hình Storybook (optional) | Document components, variants, states                                                          | Storybook             |
| T-1.7 | Cấu hình a11y tools           | axe-core, lint rules, keyboard navigation                                                      | Accessibility setup   |

**Điều kiện tiên quyết:** V-1.7 (Tailwind setup), U-1 (Design tokens từ Hân)

#### Phase 2: Page Implementation (Sprint 1-2 — Tuần 2-4)

| #     | Task                          | Mô tả                                                           | Deliverable      |
| ----- | ----------------------------- | ----------------------------------------------------------------- | ---------------- |
| T-2.1 | Implement Auth pages          | Login page với ConnectWallet, loading states                     | Auth pages       |
| T-2.2 | Implement Layout + Navigation | Responsive navbar, sidebar, mobile menu                           | App shell        |
| T-2.3 | Implement Profile page        | Avatar upload, form edit, task history                            | Profile page     |
| T-2.4 | Implement Marketplace listing | Grid cards, filter bar, search, pagination, loading skeletons     | Marketplace page |
| T-2.5 | Implement Issue Detail page   | Description render, applicants list, action buttons, status badge | Issue detail     |
| T-2.6 | Implement Create Issue form   | Multi-step form, validation, preview, submit                      | Create issue     |
| T-2.7 | Implement Dashboard page      | My issues tabs, earnings cards, stat cards                        | Dashboard        |
| T-2.8 | Implement GitHub Auth badge   | Connect GitHub → verified badge                                  | KYC UI           |

**Điều kiện tiên quyết:** T-1 (Components), U-2 (Design từ Hân), Hiếu API ready

#### Phase 3: Advanced Features UI (Sprint 2-3 — Tuần 4-6)

| #     | Task                          | Mô tả                                                                                     | Deliverable       |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------- | ----------------- |
| T-3.1 | Implement Chat UI             | Message list (auto-scroll), input with file upload, AI guard indicator, Monaco code preview | Chat interface    |
| T-3.2 | Implement Escrow UI           | Deposit modal, status timeline, transaction link (block explorer)                           | Escrow components |
| T-3.3 | Implement Notification system | Bell icon + unread badge, dropdown list, mark read, real-time update                        | Notifications     |
| T-3.4 | Implement Admin pages         | Dispute review table, AI report viewer, user management table, charts                       | Admin pages       |
| T-3.5 | Implement Analytics page      | Charts (Tremor/Recharts), date range filter                                                 | Analytics         |
| T-3.6 | Implement GitHub repo linking | Connect repo UI, select repo for task                                                       | GitHub UI         |

#### Phase 4: Unit & Integration Testing (Sprint 3-4 — Tuần 6-10)

| #      | Task                                | Mô tả                                         | Deliverable          |
| ------ | ----------------------------------- | ----------------------------------------------- | -------------------- |
| T-4.1  | Cài đặt Vitest + Testing Library | `vitest.config.ts`, setup file                | Test infrastructure  |
| T-4.2  | Viết test cho UI Components        | Button, Input, Dialog, Form fields              | Component tests      |
| T-4.3  | Viết test cho Auth hooks           | `useAuth`, `useUser`, login/logout          | Auth tests           |
| T-4.4  | Viết test cho Marketplace queries  | `useIssues`, `useIssue`, filter, pagination | Marketplace tests    |
| T-4.5  | Viết test cho Chat hooks           | `useMessages`, `useSocket`                  | Chat tests           |
| T-4.6  | Viết test cho Form validation      | Zod schemas: CreateIssue, UpdateProfile, Apply  | Validation tests     |
| T-4.7  | Viết integration test flow         | Create → apply → assign (mock API)            | Integration tests    |
| T-4.8  | Viết a11y audit tests              | axe-core checks trên mỗi page                 | Accessibility report |
| T-4.9  | Cấu hình CI Vitest                | GitHub Actions: vitest run --coverage           | CI unit tests        |
| T-4.10 | Responsive polish (all pages)       | Mobile-friendly tất cả pages                  | Responsive           |
| T-4.11 | Loading skeletons + empty states    | Không page nào flash trắng                   | Loading states       |
| T-4.12 | Error boundaries + error handling   | Toast/fallback, không crash app                | Error handling       |

**Điều kiện tiên quyết:** T-2, T-3 (pages hoàn thành)

#### Kết quả đầu ra của Trâm

| Deliverable                 | Mô tả                                   |
| --------------------------- | ----------------------------------------- |
| shadcn/ui Component Library | 20+ customized components                 |
| Form system                 | React Hook Form + Zod reusable components |
| Page implementations        | 13+ pages đầy đủ                      |
| Vitest test suite           | Unit + integration tests, coverage report |
| Accessibility audit         | a11y compliance report                    |
| Storybook (optional)        | Component documentation                   |

---

## 8. LỊCH TRÌNH PHỐI HỢP THEO SPRINT

### Sprint 0: Foundation (Tuần 1)

| Thành viên    | Nhiệm vụ chính                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------- |
| **Kiên** | K-1.1→K-1.2: Hardhat setup, OpenZeppelin                                                         |
| **Khôi** | V-1.1→V-1.15: Monorepo, Prisma schema, Next.js server, Docker compose, env vars, AI setup        |
| **Hiếu** | H-1.1→H-1.3: Review Prisma schema, hỗ trợ Next.js setup, research GraphQL Yoga + Pothos        |
| **Hân**  | U-1.1→U-1.8: Design tokens, layout system, component variants, loading states, responsive design |
| **Trâm** | T-1.1→T-1.7: shadcn/ui install + customize, form components, a11y setup                          |

**MVP Sprint 0:** Monorepo chạy được, Prisma schema + migrations sẵn sàng, Next.js custom server với GraphQL + Socket.io attached, design system Figma + component library base.

---

### Sprint 1: Auth + Marketplace Core (Tuần 2-3)

| Thành viên    | Tuần 2                                                             | Tuần 3                                                     |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Kiên** | K-2.1→K-2.6: Escrow state machine + deposit/release/cancel/timeout | K-2.7→K-2.14: Dispute + timelock + pause + tests           |
| **Khôi** | V-2.1→V-2.4: Socket.io setup + Room + Message handler              | V-2.5→V-2.7: File upload + Chat model + GraphQL support    |
| **Hiếu** | H-2.1→H-2.6: Pothos + Context + Auth + User module                 | H-3.1→H-3.5: Marketplace CRUD + Search/Filter              |
| **Hân**  | U-2.1→U-2.4: Auth + Layout + Marketplace + GitHub Auth design      | U-2.5→U-2.8: Issue Detail + Form + Dashboard + KYC         |
| **Trâm** | T-2.1→T-2.4: Auth + Layout + Profile + Marketplace impl            | T-2.5→T-2.8: Issue Detail + Create Issue + Dashboard + KYC |

**MVP Sprint 1:** User login với ví → xem/sửa profile → đăng task → duyệt marketplace → apply → client chọn developer. Escrow contract hoàn chỉnh (14+ tests).

---

### Sprint 2: Escrow + Chat + AI Guard (Tuần 4-5)

| Thành viên    | Tuần 4                                                                                           | Tuần 5                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Kiên** | K-3.1→K-3.4: EIP-712 schema + Relayer                                                            | K-3.5→K-3.8: Hỗ trợ BE tích hợp + Deploy testnet                                         |
| **Khôi** | V-3.1→V-3.7: AI Guard (Regex + LLM + middleware) + V-6.1→V-6.5: Model Router (Groq/Gemini free) | V-4.1→V-4.6: Escrow integration + V-5.1→V-5.6: AI Test Case Generator                       |
| **Hiếu** | H-4.1→H-4.3: Chat GraphQL + Dispute types + queries                                              | H-4.4→H-4.5, H-5.1→H-5.4: AI Dispute integration + Escrow mutations + Notifications + Admin |
| **Hân**  | U-3.1→U-3.5: Chat + Escrow + Notification + Admin + Dispute design                               | U-5.1→U-5.3: Playwright setup + Auth + Marketplace E2E                                       |
| **Trâm** | T-3.1→T-3.3: Chat + Escrow + Notifications UI                                                    | T-3.4→T-3.6: Admin + Analytics + GitHub UI                                                   |

**MVP Sprint 2:** Escrow flow E2E (ký EIP-712 → deposit → release), chat real-time với AI Guard tự động mask secrets, AI sinh test cases khi đăng bounty, dispute raise + admin resolve.

---

### Sprint 3: Dispute + GitHub Auth + Analytics (Tuần 6-7)

| Thành viên    | Tuần 6                                                                      | Tuần 7                                                                 |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Kiên** | Oracle/Relayer testing + hỗ trợ Khôi dispute contract flow                | Mainnet prep + security audit                                           |
| **Khôi** | V-7.1→V-7.5: Debate design + DataCollector + 5 agent prompts + Orchestrator | V-7.6→V-7.11: DisputeAnalyzer (debate) + tests + resolver + evaluation |
| **Hiếu** | H-6.1→H-6.4: GitHub OAuth App + verify + GitHub App webhook                 | H-6.5→H-6.9: Webhook handler + Auto-payment + Analytics + Repo linking |
| **Hân**  | U-4.1→U-4.3: User Mgmt + Analytics + GitHub UI design                       | U-5.4→U-5.7: Apply + Chat + Escrow + Dispute E2E                       |
| **Trâm** | T-4.1→T-4.6: Vitest setup + UI/Auth/Marketplace/Chat/Form tests             | T-4.7→T-4.9: Integration + a11y + CI Vitest                            |

**MVP Sprint 3:** AI Multi-Agent Debate phân tích tranh chấp (5 agents), GitHub Auth verify user, Admin dashboard + analytics, automated testing.

---

### Sprint 4: Polish + Deploy (Tuần 8-10)

| Thành viên    | Tuần 8                                                                             | Tuần 9                                                        | Tuần 10                        |
| --------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| **Kiên** | Contract audit + gas tối ưu + K-4.1→K-4.3: EAS Research + Schema + attest helper | K-4.4→K-4.6: EAS revoke/verify + BE integration               | Mainnet deployment + tài liệu |
| **Khôi** | V-8.1→V-8.3: CI/CD + Deploy + Sentry                                               | V-8.4→V-8.7: Domain + Health check + EAS trigger + FE support | Final AI tuning                 |
| **Hiếu** | H-7.1: Hỗ trợ FE implementation                                                   | H-7.2: GraphQL docs                                            | H-7.3: README + setup guide     |
| **Hân**  | U-5.8→U-5.9: GitHub Auth + Responsive E2E                                          | U-5.10: CI Playwright                                          | Final QA                        |
| **Trâm** | T-4.10→T-4.11: Responsive polish + Loading states                                  | T-4.12: Error boundaries                                       | Final polish + a11y             |

**MVP Sprint 4:** Full platform hoạt động: marketplace, escrow, chat, AI Guard, AI Test Gen, AI Debate, GitHub Auth, notifications, analytics, admin panel. EAS reputation attestation (v1.5). Deployed + tested + documented.

---

## 9. QUY TẮC LÀM VIỆC CHUNG

### Branch Strategy

```
main
  └── develop
        ├── feat/KIEN-escrow-contract
        ├── feat/KHOI-prisma-socket
        ├── feat/KHOI-ai-guard
        ├── feat/HIEU-graphql-marketplace
        ├── feat/HAN-marketplace-ui
        └── feat/TRAM-component-library
```

- **main**: Production-ready code
- **develop**: Integration branch
- **feat/***: Feature branches (1 branch per task)

### Commit Convention

```
<type>(<scope>): <description>

feat(escrow): implement deposit function
fix(chat): resolve socket reconnection issue
test(auth): add wallet disconnect scenario
docs(api): document GraphQL escrow mutations
chore(deps): update prisma to 5.x
```

### Code Review

- Mỗi PR cần ít nhất **1 review** từ thành viên khác
- **Khôi** là default reviewer cho: Prisma, Socket.io, AI (Guard/TestGen/Debate), contract integration
- **Hiếu** là default reviewer cho: GraphQL, Auth, Marketplace, Dispute, Notifications, Analytics
- **Kiên** là reviewer cho: Smart Contract, EIP-712, Oracle/Relayer, EAS Attestation
- **Khôi + Hiếu** hỗ trợ review FE code của Hân & Trâm
- **Hân + Trâm** review lẫn nhau cho UI code

### Quy tắc phát triển AI (cho Khôi)

- **Mọi prompt** phải nằm trong `apps/web/src/lib/ai/prompts/` (version control)
- **Mọi output AI** phải dùng `generateObject()` để có structured JSON, không parse JSON thủ công
- **Mọi call AI** đi qua `ModelRouter` — không gọi provider trực tiếp
- **Model free trước** (Groq/Gemini), chỉ fallback sang OpenAI paid khi cần chất lượng cao
- **AI không được tự động chốt verdict** — verdict phải có vòng Verifier + hiển thị cho Admin review
- **Log mọi AI call** (prompt, model, latency, cost) vào `AIGuardLog` để audit

### Tech Stack Final

| Lớp            | Công nghệ                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Package Manager | **Bun**                                                                                                 |
| Runtime         | **Next.js Custom Server** (TypeScript)                                                                  |
| Frontend        | Next.js 14+ App Router                                                                                        |
| CSS             | **Tailwind CSS v4 + shadcn/ui** (mobile-first responsive)                                               |
| API             | **GraphQL Yoga + Pothos**                                                                               |
| Auth            | **Thirdweb Auth**                                                                                       |
| Database        | **PostgreSQL**                                                                                          |
| ORM             | **Prisma**                                                                                              |
| Web3 Client     | **Thirdweb SDK**                                                                                        |
| Real-time       | **Socket.io**                                                                                           |
| AI SDK          | **Vercel AI SDK** (multi-provider)                                                                      |
| AI Models       | **Groq (llama-3.3-70b, llama-3.1-8b, free)** + **Gemini Flash (free)** + OpenAI GPT-4o (fallback) |
| AI Features     | AI Guard · AI Test Gen · Multi-Agent Debate (5 agents)                                                      |
| Storage         | **AWS S3** (primary) / **Supabase Storage** (fallback)                                            |
| KYC             | **GitHub OAuth** (verify qua GitHub account)                                                            |
| Reputation      | DB (v1) →**EAS Attestation on-chain** (v1.5)                                                           |
| Anti-Sybil      | **Gitcoin Passport** (v2)                                                                               |
| Sandbox         | **v2** (dời sang roadmap sau)                                                                          |
| State           | **Zustand + TanStack Query**                                                                            |
| Forms           | **React Hook Form + Zod**                                                                               |
| Testing         | **Vitest + Playwright**                                                                                 |
| Logging         | **Pino + Sentry**                                                                                       |
| Deploy          | **Railway/Fly.io + Neon/Supabase**                                                                      |
| CI/CD           | **GitHub Actions**                                                                                      |
| Smart Contracts | **Solidity + Hardhat** (Ethereum L1: Sepolia + Mainnet) + **EAS**                 |
