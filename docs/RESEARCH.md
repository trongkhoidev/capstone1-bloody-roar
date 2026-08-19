# 🩸 Bloody-Roar: Tài Liệu Nghiên Cứu Công Nghệ

> Tài liệu này tổng hợp kết quả nghiên cứu về các công nghệ, giải thích lý do chọn lựa, và đưa ra các giải pháp khả thi nên áp dụng cho dự án Bloody-Roar. Mục tiêu: để **mọi thành viên** (kể cả người chưa rành Web3/AI) đều hiểu tại sao dùng tech này, và biết khi nào cần thêm tech nào.

---

## MỤC LỤC

1. [Tổng Quan Kiến Trúc & Lý Do Chọn Tech](#1-tổng-quan-kiến-trúc--lý-do-chọn-tech)
2. [Giải Thích Thuật Ngữ (Glossary)](#2-giải-thích-thuật-ngữ-glossary)
3. [Nghiên Cứu: Chứng Chỉ & Danh Tiếng (NFT/Attestation)](#3-nghiên-cứu-chứng-chỉ--danh-tiếng-nftattestation)
4. [Nghiên Cứu: Chống Fake Danh Tính (Anti-Sybil)](#4-nghiên-cứu-chống-fake-danh-tính-anti-sybil)
5. [Nghiên Cứu: AI — Guard, Test Gen, Dispute](#5-nghiên-cứu-ai--guard-test-gen-dispute)
6. [Nghiên Cứu: Model AI Miễn Phí](#6-nghiên-cứu-model-ai-miễn-phí)
7. [Nghiên Cứu: Responsive Design (Mobile Web)](#7-nghiên-cứu-responsive-design-mobile-web)
8. [Nghiên Cứu: Storage & Các Thành Phần Còn Lại](#8-nghiên-cứu-storage--các-thành-phần-còn-lại)
9. [Kết Luận: Những Gì Nên Áp Dụng](#9-kết-luận-những-gì-nên-áp-dụng)

---

## 1. TỔNG QUAN KIẾN TRÚC & LÝ DO CHỌN TECH

### 1.1 Stack hiện tại của dự án

| Lớp | Công nghệ | Lý do chọn |
|-----|-----------|-----------|
| **Package Manager** | Bun | Nhanh hơn npm/pnpm (viết bằng Rust), tích hợp sẵn test runner, bundler, `.env` loader. Tương thích npm nên ít rủi ro |
| **Frontend + Backend** | Next.js Custom Server | Chạy cả FE (React) lẫn BE (API) trong 1 process. Cần custom server vì phải gắn thêm Socket.io (WebSocket) — thứ mà Next.js serverless không hỗ trợ |
| **Ngôn ngữ** | TypeScript | Type-safe từ DB → API → FE, giảm bug, dễ maintain |
| **CSS** | Tailwind CSS v4 + shadcn/ui | Tailwind: viết style nhanh. shadcn/ui: bộ components đẹp, copy-paste vào project (không lock-in) |
| **Database** | PostgreSQL | DB quan hệ mạnh, chuẩn công nghiệp, hỗ trợ transaction + full-text search |
| **ORM** | Prisma | Sinh type tự động từ schema, migration dễ, DX tốt nhất |
| **API** | GraphQL (Yoga + Pothos) | Frontend query đúng field cần (không over/under-fetching), schema type-safe |
| **Auth** | Thirdweb Auth | Login bằng ví Web3 (SIWE), hỗ trợ Next.js tốt |
| **Web3 Client** | Thirdweb SDK | Cùng ecosystem với Auth, gọi smart contract từ BE/FE dễ |
| **Real-time** | Socket.io | Chat 2 chiều, có room, auto-reconnect |
| **AI SDK** | Vercel AI SDK | Gọi nhiều model AI (Groq/Gemini/OpenAI) qua 1 API thống nhất |
| **Smart Contract** | Solidity + Hardhat | Chuẩn EVM, Hardhat quen thuộc với team JS/TS |
| **Storage** | AWS S3 (hoặc Supabase) | Lưu file, pre-signed URL |
| **Blockchain** | EVM L2 (Arbitrum/Base) | Gas rẻ (< $0.01), nhanh — cần thiết vì platform trả gas cho user |

### 1.2 Tại sao dùng L2 (Arbitrum/Base) thay vì L1 Ethereum?

- **Gas rẻ:** 1 giao dịch trên Ethereum L1 tốn $5-50, trên L2 tốn < $0.01. Platform phải trả gas cho user (SBT, attestation) nên gas rẻ là bắt buộc
- **Nhanh:** Xác nhận giao dịch ~2 giây thay vì 12 giây
- **Tương thích EVM:** Code Solidity chạy y hệt, không cần học ngôn ngữ mới

---

## 2. GIẢI THÍCH THUẬT NGỮ (GLOSSARY)

### 2.1 Blockchain & Web3

| Thuật ngữ | Giải thích đơn giản |
|-----------|---------------------|
| **EVM** | Ethereum Virtual Machine — "máy ảo" chạy smart contract. Mọi chain tương thích EVM (Ethereum, Arbitrum, Base, Polygon...) đều chạy cùng 1 code Solidity |
| **Smart Contract** | Chương trình chạy trên blockchain, không ai sửa được sau khi deploy. Dùng để giữ tiền (escrow) và phân xử tự động |
| **Escrow** | Cơ chế ký quỹ — tiền được khóa trong smart contract, chỉ giải phóng khi đủ điều kiện (vd: client approve hoặc dispute được xử) |
| **L1 / L2** | L1 = blockchain gốc (Ethereum). L2 = mạng "xây trên" L1 (Arbitrum, Base), kế thừa bảo mật nhưng rẻ + nhanh hơn |
| **Gas** | Phí phải trả để chạy giao dịch trên blockchain |
| **Wallet** | Ví tiền điện tử (MetaMask, WalletConnect). Là "tài khoản" của user trên blockchain |
| **SIWE** | Sign-In With Ethereum — user ký 1 thông điệp bằng ví để chứng minh họ sở hữu ví đó (dùng để login) |
| **EIP-712** | Chuẩn "ký dữ liệu có cấu trúc" — cho phép user ký 1 cam kết off-chain (không tốn gas) mà vẫn verify được on-chain |

### 2.2 Identity & Reputation

| Thuật ngữ | Giải thích đơn giản |
|-----------|---------------------|
| **NFT** | Token độc nhất trên blockchain, chứng nhận sở hữu 1 vật phẩm số. **Có thể chuyển nhượng** |
| **SBT (Soulbound Token)** | NFT nhưng **không chuyển nhượng được** — gắn vĩnh viễn vào 1 ví. Dùng cho danh tính, membership |
| **Attestation** | Một "lời xác nhận có chữ ký số" rằng "A nói B về C" (vd: "Bloody-Roar xác nhận Dev A hoàn thành task X với 5 sao"). Có thể revoke, có expiry, **rẻ hơn NFT** |
| **Verifiable Credential (VC)** | Chứng chỉ số có thể verify, không cần trung gian |
| **DID** | Decentralized Identifier — "CMND số" tự chủ, không phụ thuộc tổ chức nào |
| **Sybil Attack** | 1 người tạo nhiều tài khoản giả để lợi dụng hệ thống (fake review, nhận nhiều bounty) |
| **Reputation Score** | Điểm uy tín tích lũy từ hành vi (hoàn thành task, bị dispute...) |

### 2.3 AI

| Thuật ngữ | Giải thích đơn giản |
|-----------|---------------------|
| **LLM** | Large Language Model — mô hình AI xử lý ngôn ngữ (GPT-4o, Gemini, Llama...) |
| **Prompt** | Câu lệnh/mô tả đưa vào AI để nó sinh ra kết quả mong muốn |
| **Structured Output** | Bắt AI trả về JSON đúng cấu trúc (không phải text tự do) — dùng để lấy `{ratio, reasoning}` chính xác |
| **Function Calling / Tool Use** | Cho AI khả năng gọi function bên ngoài (query DB, gọi contract) |
| **Multi-Agent Debate** | Nhiều AI agent với vai trò khác nhau tranh luận trước khi chốt kết quả — giảm bias, tăng độ chính xác |
| **Streaming** | AI trả kết quả từng phần thay vì đợi xong hết — UX mượt hơn |
| **Embedding** | Chuyển văn bản thành vector số để tìm kiếm ngữ nghĩa (dùng cho RAG/search) |

### 2.4 Web Development

| Thuật ngữ | Giải thích đơn giản |
|-----------|---------------------|
| **Monorepo** | Nhiều project (web, blockchain, shared) nằm trong 1 repo, chia sẻ code |
| **Custom Server** | Tự viết file `server.ts` để kiểm soát HTTP server của Next.js (cần để gắn Socket.io) |
| **Pre-signed URL** | Server sinh 1 URL tạm thời cho phép client upload trực tiếp lên S3 — không cần file đi qua server |
| **Responsive Design** | Giao diện tự co giãn phù hợp mọi kích thước màn hình (mobile → desktop) |
| **Mobile-first** | Thiết kế cho mobile trước, rồi scale lên desktop |
| **Server Components (RSC)** | React component chạy trên server — giảm JS gửi về client, tăng tốc trang |

---

## 3. NGHIÊN CỨU: CHỨNG CHỈ & DANH TIẾNG (NFT/ATTESTATION)

### 3.1 Bài toán cần giải

1. Dev có **chứng chỉ/certificate** cần được "token hóa" — verifiable, không fake được
2. **Reputation** của Dev trên Bloody-Roar cần được **công nhận rộng rãi** (không bị khóa trong platform)
3. Chống **fake danh tính**
4. Thể hiện **năng lực** và tăng **độ nhận diện** của Dev

### 3.2 So sánh các phương án

| Phương án | Là gì | Ưu điểm | Nhược điểm | Phù hợp? |
|-----------|-------|---------|------------|----------|
| **EAS** (Ethereum Attestation Service) | Open-source primitive cho phép tạo "lời xác nhận" on-chain/off-chain | Free, chuẩn chung (interoperable), revocable, rẻ trên L2, không cần tự deploy contract | Cần học khái niệm attestation | ✅ **Nên dùng cho reputation/skill** |
| **Sign Protocol** | Attestation primitive đa chain (EVM + Solana + TON) | Omnichain, được Gitcoin dùng | Chỉ cần nếu muốn đa chain; EVM thì EAS đủ | ⚠️ Alternative |
| **TalentLayer** | Protocol chuyên dụng cho service marketplace (freelance) | Có sẵn reputation, review, network effect | Opinionated — phải build "trên" protocol họ, mất control | ⚠️ v2 nếu muốn network effect |
| **Gitcoin/Human Passport** | Identity + chống Sybil | Free (core + GitHub stamp), ML detect Sybil | Chỉ lo chống fake, không lo reputation skill | ✅ **Nên dùng cho anti-Sybil** |
| **Custom SBT** (tự viết) | Tự mint ERC-721 non-transferable | Full control | Không interoperable — reputation bị khóa trong platform | ❌ Không nên cho reputation |
| **Ceramic/ComposeDB** | Decentralized data graph + DID | Mutable, verifiable | Phức tạp, cần node riêng | ❌ Overkill |

### 3.3 Vì sao nên dùng Attestation (EAS) thay vì NFT/SBT cho reputation?

**Reputation thay đổi liên tục** (Dev hoàn thành thêm task, bị dispute). NFT/SBT **không sửa được** — mỗi lần đổi phải mint thêm 1 token mới, tốn gas và rối. Attestation thì:
- Mỗi task hoàn thành → tạo 1 attestation mới (rẻ, không cần mint token)
- Có thể **revoke** khi phát hiện gian lận
- Có **expiry** nếu cần
- Có thể là **off-chain** (EIP-712 signed, verify free) hoặc **on-chain** (verify bởi smart contract)

### 3.4 Giải pháp đề xuất

```
┌────────────────────────────────────────────────────────────┐
│              IDENTITY & REPUTATION STACK                    │
│                                                            │
│  Lớp 1: GitHub OAuth ──── định danh cơ bản (who you are)   │
│                                                            │
│  Lớp 2: Gitcoin Passport ── chống Sybil/fake identity      │
│         (GitHub Stamp free, Passport Models detect fake)   │
│                                                            │
│  Lớp 3: EAS Attestation ── reputation + certificate        │
│         (attest "hoàn thành task" + rating + skill)        │
│         (revocable, verifiable ở bất kỳ app nào)            │
└────────────────────────────────────────────────────────────┘
```

**Lộ trình:**
- **MVP (v1):** GitHub OAuth + reputation lưu off-chain trong DB
- **v1.5:** EAS attestation on-chain khi task hoàn thành
- **v2:** Gitcoin Passport (chống Sybil) + attestation đầy đủ

---

## 4. NGHIÊN CỨU: CHỐNG FAKE DANH TÍNH (ANTI-SYBIL)

### 4.1 Vấn đề

Kẻ xấu có thể tạo nhiều ví → nhiều tài khoản → fake review, tự nhận bounty của chính mình, thao túng danh tiếng.

### 4.2 Các phương án

| Phương án | Cách hoạt động | Chi phí | Hiệu quả |
|-----------|----------------|---------|----------|
| **GitHub OAuth** | User đăng nhập bằng GitHub account có lịch sử commit | Free | Trung bình — account GitHub có thể mua |
| **Gitcoin Passport** | User verify nhiều "Stamps" (GitHub, KYC, biometric...) → đạt score | Free (core) | Cao — chuyên chống Sybil |
| **Passport Models** | ML phân tích on-chain activity để phân loại Sybil/human | Free | Cao — không cần user làm gì |
| **KYC (Sumsub/Persona)** | Verify giấy tờ + face liveness | Đắt | Cao nhất — chứng minh là người thật |

### 4.3 Đề xuất

MVP dùng **GitHub OAuth** (đơn giản, đủ dùng). V2 thêm **Gitcoin Passport** để chống Sybil mạnh hơn — đặc biệt là **Passport Models** (ML tự phân loại address, user không phải làm gì) rất phù hợp vì không gây friction cho user.

---

## 5. NGHIÊN CỨU: AI — GUARD, TEST GEN, DISPUTE

### 5.1 Vercel AI SDK là gì?

**Vercel AI SDK** là 1 bộ **toolkit TypeScript** giúp build ứng dụng AI. Nó **KHÔNG phải là model AI** — nó là **lớp trung gian** thống nhất để gọi nhiều model khác nhau (OpenAI, Google Gemini, Groq, Anthropic, DeepSeek...) qua **cùng 1 API**.

**Vấn đề nó giải quyết:** Mỗi provider có API riêng (`openai` package, `@google/generative-ai`, `groq-sdk`...). Muốn đổi model phải đổi code. AI SDK thống nhất tất cả → đổi model = đổi 1 string.

**3 thành phần chính:**
| Thành phần | Dùng để làm gì |
|-----------|---------------|
| **AI SDK Core** | Backend API: `generateText()`, `generateObject()` (trả JSON chuẩn), `streamText()`, tool calling, agents |
| **AI SDK UI** | Frontend hooks: `useChat()`, `useCompletion()`, `useObject()` |
| **AI SDK Harnesses** | Chạy agent harness có sẵn (Claude Code, Codex...) |

**Ví dụ:** 
```typescript
import { generateText, generateObject } from 'ai';

// Sinh text
const { text } = await generateText({
  model: 'groq/llama-3.3-70b-versatile', // đổi model = đổi string này
  prompt: 'Phân tích tranh chấp...',
});

// Sinh structured JSON (dùng cho verdict, test cases)
const { object } = await generateObject({
  model: 'groq/llama-3.3-70b-versatile',
  schema: z.object({ ratio: z.number(), reasoning: z.string() }),
  prompt: 'Đề xuất tỷ lệ chia...',
});
```

### 5.2 5 Module AI của Bloody-Roar

| # | Module | Chức năng | Trigger | Model gợi ý |
|---|--------|-----------|---------|-------------|
| 1 | **AI Chat Guard** | Mask PII/secret trong chat (2 tầng: Regex + LLM) | Mỗi message | Groq llama-3.1-8b |
| 2 | **AI Test Case Generator** | Sinh test cases/acceptance criteria khi post bounty | Post bounty | Groq llama-3.3-70b / Gemini Flash |
| 3 | **AI Dispute Assistant** | Phân tích tranh chấp, đề xuất payout ratio | Raise dispute | Multi-agent debate |
| 4 | **AI Multi-Agent Debate** | Nhiều agent tranh luận trước khi chốt verdict | Dispute | Mix (xem 5.4) |
| 5 | **AI Code Quality Reviewer** (optional) | Review chất lượng code | Submit work | — |

### 5.3 AI Test Case Generator — giải quyết "định nghĩa done"

**Vấn đề:** Client mô tả bug bằng ngôn ngữ tự nhiên, không rõ "done" là gì → dễ tranh chấp "đã fix hay chưa".

**Giải pháp:**
```
Client post bounty (mô tả bug)
        ↓
AI phân tích mô tả → sinh:
  - Test cases (given/when/then)
  - Acceptance criteria
  - Edge cases
        ↓
Client review & approve (có thể sửa)
        ↓
Test cases trở thành "hợp đồng" giữa 2 bên
        ↓
Khi Dev nộp bài → đối chiếu test cases
```

**Lợi ích:** Tránh scope creep, malicious test cases, client bắt bẻ vô lý.

### 5.4 AI Multi-Agent Debate — cơ chế "dive" (đào sâu)

**Vấn đề:** 1 model AI phán 1 lần có thể bị bias (nghiêng về 1 bên).

**Giải pháp:** Dùng nhiều agent với vai trò khác nhau tranh luận trước khi chốt. Kỹ thuật này là **multi-agent debate** (nghiên cứu MIT: "Improving Factuality and Reasoning in Language Models through Multiagent Debate").

```
┌─────────────────────────────────────────────────────┐
│                    DISPUTE INPUT                      │
│   (mô tả bug + chat log + test cases + evidence)     │
└───────────────────────┬─────────────────────────────┘
                        ↓
         ┌──────────────────────────────────┐
         │  VÒNG 1: LẬP LUẬN HAI BÊN       │
         │  Agent A (Client Advocate)       │
         │  Agent B (Dev Advocate)          │
         └──────────────┬───────────────────┘
                        ↓
         ┌──────────────────────────────────┐
         │  VÒNG 2: PHẢN BIỆN              │
         │  Agent C (Critic)                │
         │  "A sai vì... B bỏ qua..."        │
         └──────────────┬───────────────────┘
                        ↓
         ┌──────────────────────────────────┐
         │  VÒNG 3: TRỌNG TÀI               │
         │  Agent D (Judge)                 │
         │  Cân nhắc → {ratio, reasoning}   │
         └──────────────┬───────────────────┘
                        ↓
         ┌──────────────────────────────────┐
         │  VÒNG 4: XÁC MINH               │
         │  Agent E (Verifier)              │
         │  Kiểm tra verdict hợp lý → chốt  │
         └──────────────┬───────────────────┘
                        ↓
                   FINAL VERDICT
```

**Lợi ích:**
- Giảm bias của 1 model đơn lẻ
- Xét cả 2 phía công bằng hơn
- Verdict có "quá trình tranh luận" → giải trình được cho Admin/User
- Có thể dùng model khác nhau cho từng agent (model mạnh cho Judge, rẻ cho Advocate)

**Lưu ý quan trọng:** AI **không tự động chốt verdict** — kết quả debate chỉ là **đề xuất** cho Admin. Admin con người xem quá trình debate rồi mới approve.

---

## 6. NGHIÊN CỨU: MODEL AI MIỄN PHÍ

> Mục tiêu: dùng model free trước, chỉ fallback sang model trả phí khi cần chất lượng cao.

### 6.1 Bảng so sánh model free/giá rẻ

| Provider | Model | Free tier | Giới hạn (free) | Điểm mạnh | Phù hợp cho |
|----------|-------|-----------|-----------------|-----------|-------------|
| **Groq** | llama-3.1-8b-instant | ✅ | 30 req/min, **14,400 req/ngày** | Cực nhanh (chip LPU), volume cao | AI Chat Guard |
| **Groq** | llama-3.3-70b-versatile | ✅ | 30 req/min, 1,000 req/ngày | Chất lượng khá, nhanh | Test Gen, Advocate/Critic |
| **Groq** | openai/gpt-oss-120b | ✅ | 30 req/min, 1,000 req/ngày | Chất lượng cao nhất trong free | Judge (trọng tài) |
| **Google** | Gemini 2.x Flash | ✅ (AI Studio) | Rate limit theo ngày | Context dài, đa năng | Test Gen, Dispute |
| **DeepSeek** | deepseek-chat | Rẻ (~$0.14/1M token) | — | Giá rẻ, chất lượng tốt | Fallback debate agents |
| **Ollama** | llama3, qwen, mistral | ✅ (self-host) | Phụ thuộc hardware | Chạy local, không giới hạn | Dev/test offline |
| **OpenAI** | gpt-4o-mini | Không free, rẻ | — | Ổn định, ecosystem lớn | Fallback khi cần |
| **OpenAI** | gpt-4o | Không free | — | Chất lượng cao nhất | Judge khi cần accuracy tối đa |

### 6.2 Chiến lược chọn model (cost-effective)

```
AI Chat Guard (tần suất cao nhất)   → Groq llama-3.1-8b-instant (free, 14K req/ngày)
AI Test Case Generator              → Groq llama-3.3-70b (free) hoặc Gemini Flash (free)
AI Debate — Advocate/Critic         → Groq llama-3.3-70b (free)
AI Debate — Judge                   → Groq gpt-oss-120b (free) → GPT-4o (paid fallback)
AI Debate — Verifier                → Groq llama-3.3-70b (free)
```

### 6.3 Nguyên tắc dùng AI trong dự án

1. **Mọi call AI đi qua ModelRouter** — không gọi provider trực tiếp (dễ đổi model, dễ fallback)
2. **Mọi output dùng `generateObject()`** — bắt AI trả JSON chuẩn, không parse text thủ công
3. **Prompt phải version-control** (lưu trong repo `prompts/`)
4. **Log mọi call** (prompt, model, latency, cost) để audit + tối ưu chi phí
5. **AI chỉ đề xuất, không tự chốt** — verdict phải có Admin approve

---

## 7. NGHIÊN CỨU: RESPONSIVE DESIGN (MOBILE WEB)

### 7.1 Mục tiêu

Web chạy tốt trên mobile (iOS Safari, Android Chrome) — không cần app native cho MVP.

### 7.2 Chiến lược với Tailwind CSS v4

**Breakpoints mobile-first (mặc định):**
| Prefix | Min-width | Thiết bị |
|--------|-----------|----------|
| (mặc định) | < 640px | Mobile (ưu tiên thiết kế trước) |
| `sm:` | 640px | Tablet nhỏ |
| `md:` | 768px | Tablet |
| `lg:` | 1024px | Laptop |
| `xl:` | 1280px | Desktop |

**Nguyên tắc:**
1. **Mobile-first** — viết CSS cho mobile trước, dùng `md:` `lg:` để scale lên
2. **Flexbox/Grid linh hoạt** — tránh fixed width
3. **Navigation** — desktop navbar → mobile hamburger + drawer (shadcn/ui `Sheet`)
4. **Table → Card list** trên mobile
5. **Touch target ≥ 44x44px**

### 7.3 Component shadcn/ui cho responsive

| Component | Dùng cho |
|-----------|----------|
| **Sheet / Drawer** | Menu mobile, filter panel mobile (bottom sheet) |
| **Dialog** | Modal (full-width trên mobile) |
| **DropdownMenu** | Menu options |

### 7.4 Responsive theo từng page

| Page | Desktop | Mobile |
|------|---------|--------|
| **Marketplace** | Grid 3 cột + sidebar filter | 1 cột + filter qua bottom sheet |
| **Issue Detail** | 2 cột (nội dung + sidebar) | Stack dọc, action button sticky bottom |
| **Chat** | Sidebar chat | Full-screen chat view |
| **Dashboard** | Table + charts | Card list, chart cuộn ngang |
| **Create Issue** | Multi-step ngang | Step-by-step dọc |
| **Admin** | Table rộng | Card list / table scroll ngang |

### 7.5 Testing responsive

- **Playwright** với 3 viewport: mobile (390px), tablet (768px), desktop (1280px)
- Kiểm tra: layout không vỡ, touch target đủ lớn, không overflow ngang

---

## 8. NGHIÊN CỨU: STORAGE & CÁC THÀNH PHẦN CÒN LẠI

### 8.1 Storage (File Upload)

| Phương án | Chi phí | Ưu điểm | Nhược điểm |
|-----------|---------|---------|------------|
| **AWS S3** (free tier) | 5GB free / 12 tháng | Phổ biến nhất, reliable, pre-signed URL | Hết free tier phải trả |
| **Supabase Storage** | Free tier 1GB | Tích hợp sẵn nếu dùng Supabase, có SDK | Giới hạn dung lượng |
| **Cloudflare R2** | Free 10GB | **Không tính phí egress** (download ra ngoài) | Cần Cloudflare account |
| **IPFS/Arweave** | Trả phí pinning | Phi tập trung, immutable | Chậm, phù hợp evidence không phải file thường |

**Đề xuất:** Dùng **AWS S3** (như user đã chọn) hoặc **Supabase Storage**. Nếu sau này có nhiều download (evidence, avatar), chuyển sang Cloudflare R2 vì không tốn phí egress.

### 8.2 State Management (Frontend)

| Thư viện | Dùng cho | Lý do |
|----------|----------|-------|
| **TanStack Query** | Server state (fetch/cache API, GraphQL data) | Tự cache, retry, refetch — chuẩn hiện tại |
| **Zustand** | Client state (UI state: modal, theme) | Nhẹ, đơn giản, không boilerplate |

### 8.3 Forms & Validation

**React Hook Form + Zod** — React Hook Form tối ưu hiệu năng (uncontrolled), Zod type-safe validation, infer type trực tiếp. Combo chuẩn hiện tại.

### 8.4 Testing

| Thư viện | Dùng cho |
|----------|----------|
| **Vitest** | Unit + integration test (nhanh, ESM native) |
| **Playwright** | E2E test (cross-browser, responsive) |
| **Hardhat + Chai** | Smart contract test |

### 8.5 Monitoring & Logging

| Công cụ | Dùng cho |
|---------|----------|
| **Pino** | Structured logging (backend) |
| **Sentry** | Error tracking (BE + FE) |

### 8.6 Deployment

| Layer | Đề xuất | Lý do |
|-------|---------|-------|
| App (custom server) | Railway / Fly.io | Hỗ trợ Docker + long-running process (cần cho Socket.io) |
| Database | Neon (serverless PG) / Supabase | Free tier, không cần tự vận hành |
| Blockchain RPC | Alchemy | Free tier đủ dùng |

---

## 9. KẾT LUẬN: NHỮNG GÌ NÊN ÁP DỤNG

### 9.1 Áp dụng ngay (MVP v1)

| Hạng mục | Giải pháp |
|----------|-----------|
| Chống fake danh tính | **GitHub OAuth** (verify qua account GitHub) |
| Reputation | Lưu off-chain trong DB (`reputation_score`) |
| AI Chat Guard | **Groq llama-3.1-8b** (free) + Regex |
| AI Test Gen | **Groq llama-3.3-70b** (free) |
| AI Dispute | **Multi-Agent Debate** (5 agent, model free) |
| Model AI | Vercel AI SDK + **ModelRouter** (Groq/Gemini free trước) |
| Responsive | Tailwind mobile-first + shadcn/ui Sheet/Drawer |
| Storage | AWS S3 (hoặc Supabase) pre-signed URL |

### 9.2 Áp dụng ở v1.5

| Hạng mục | Giải pháp |
|----------|-----------|
| Reputation on-chain | **EAS Attestation** (attest khi task hoàn thành, revocable) |

### 9.3 Áp dụng ở v2

| Hạng mục | Giải pháp |
|----------|-----------|
| Chống Sybil mạnh | **Gitcoin Passport** (GitHub Stamp + Passport Models) |
| KYC đầy đủ | Sumsub/Persona (face liveness) |
| Sandbox | Docker + code-server |
| Network effect | TalentLayer (nếu muốn pool user/offer chung) |

---

## PHỤ LỤC: NGUỒN THAM KHẢO

| Chủ đề | Link |
|--------|------|
| Vercel AI SDK | https://sdk.vercel.ai/docs |
| EAS (Ethereum Attestation Service) | https://docs.attest.org |
| Sign Protocol | https://sign.global |
| TalentLayer | https://docs.talentlayer.org |
| Gitcoin/Human Passport | https://docs.passport.xyz |
| Groq (model + rate limit free) | https://console.groq.com/docs/rate-limits |
| Google Gemini | https://ai.google.dev |
| Multi-agent debate | MIT: "Improving Factuality and Reasoning in LMs through Multiagent Debate" |
