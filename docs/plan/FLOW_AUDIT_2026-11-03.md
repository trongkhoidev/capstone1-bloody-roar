# Audit luồng nghiệp vụ theo role (03/11/2026)

> **Lưu ý:** audit này chạy trên `feat/ledger-palette-copy`, nhánh đang chậm `main` 287 commit. Trên `main` (sau PR #20), FE đã có đủ luồng escrow on-chain qua `prepareX`, cả 53 query của FE đều khớp schema, và nhánh tranh chấp off-chain đã bị gỡ. Việc vá tiếp theo nằm ở [`AGY_PROMPT_FIX_FLOW_2026-11-03.md`](AGY_PROMPT_FIX_FLOW_2026-11-03.md).

**Nhánh:** `feat/ledger-palette-copy` (có thay đổi chưa commit)
**Môi trường kiểm:** server local `localhost:4000`, Postgres local, `ESCROW_CHAIN_ID=31337`

## Cách kiểm

1. **Validate schema:** lấy toàn bộ 36 câu GraphQL mà FE gửi lên (11 component), chạy `graphql.validate` với schema thật build từ code. Kết quả: 35 câu hợp lệ, 1 câu lỗi.
2. **Chạy thử luồng:** script tạm dùng 3 ví ngẫu nhiên (client, dev, dev2) và ví admin trong `ADMIN_WALLETS`, gọi API thật theo thứ tự: tạo bài → ứng tuyển → chọn dev → nộp bài → duyệt → tranh chấp → admin xử lý → ban/unban. Script đã xoá sau khi chạy. Dữ liệu thử (3 issue tên `Probe A/B/C`) vẫn còn trong DB local.
3. `scripts/smoke-roles.ts`: 19/19 pass. `bun run typecheck` và `bun run lint` pass.
4. Đọc code các module `issue`, `application`, `submission`, `escrow`, `dispute`, `chat`, `admin`, `analytics`, `lib/escrow/*`, socket, rồi đối chiếu với các màn FE tương ứng.

**Chưa kiểm:** giao dịch on-chain thật (node Hardhat local không chạy: `escrowClaimableBalance` trả `ESCROW_RPC_UNAVAILABLE`), AI (chưa cấu hình provider), upload S3, GitHub OAuth (chưa có `GITHUB_CLIENT_ID`).

---

## 1. Tóm tắt

Phần trước khi có tiền chạy được: đăng nhập, phân quyền role, tạo bài, ứng tuyển, chọn dev, chat, comment, ban/unban.

Từ lúc chọn dev trở đi, **không task nào kết thúc được**:

- FE không có màn nào gọi escrow. Không có nút nạp tiền, giải ngân hay claim. Backend đã có mutation nhưng FE không dùng.
- Vì không có escrow, issue mắc ở `IN_PROGRESS` mãi, kể cả khi client đã duyệt bài.
- Form tranh chấp trên FE bắt buộc nhập tx hash, mà tx hash đó cần escrow tồn tại. Kết quả là luôn lỗi `Escrow not found`.
- Nhánh tranh chấp off-chain (không cần tx) không bao giờ về `RESOLVED`. Admin đề xuất rồi một bên phản đối, cứ lặp như vậy không có điểm dừng.

---

## 2. Lỗi chặn luồng (P0)

| # | Lỗi | Role | Bằng chứng |
|---|---|---|---|
| P0-1 | **FE không có luồng escrow.** Sau `assignDeveloper`, FE báo "proceed to fund the escrow contract" nhưng không có nút nào. Các mutation `depositToEscrow`, `releaseFunds`, `confirmEscrowTransaction`, `cancelEscrow` và query `escrow`, `escrowClaimableBalance` không có component nào gọi | Client, Dev | Grep `components/` không thấy. `issue-detail-view.tsx:179` |
| P0-2 | **Duyệt bài không kết thúc task.** `reviewSubmission(approved: true)` chỉ đổi trạng thái submission. Issue vẫn `IN_PROGRESS`, dev không còn nộp được bài (`SUBMISSION_ALREADY_APPROVED`), client cũng không có nút release | Client, Dev | Probe: sau khi approve, `issue A status = IN_PROGRESS`. `submission.module.ts:249-267` |
| P0-3 | **Form tranh chấp FE luôn lỗi khi chưa có escrow.** FE bắt nhập `txHash` và `evidenceManifestHash` (`required`). Backend thấy có 2 trường này thì đi nhánh on-chain và trả `NOT_FOUND: Escrow not found`. Người dùng cũng không có chỗ nào để tạo tx `raiseDispute` on-chain | Client, Dev | Probe: `raiseDispute FE shape → NOT_FOUND`. `issue-detail-view.tsx:196, 705-720` |
| P0-4 | **Tranh chấp off-chain không có điểm kết thúc.** `proposeDisputeResolution` → `PROPOSED`, `challengeDisputeResolution` → `CHALLENGED`, admin đề xuất lại được, bên kia phản đối lại được, không giới hạn. Không có mutation finalize, issue luôn ở `DISPUTED`. Đây là BUG-2 trong audit cũ, chưa sửa | Admin, Client, Dev | Probe: PROPOSED → CHALLENGED → PROPOSED → CHALLENGED, issue B cuối cùng vẫn `DISPUTED`. `dispute.module.ts:458-479, 509-533` |
| P0-5 | **Trang chủ luôn hiện bài giả.** Query gửi `sortBy: NEWEST` nhưng enum backend chỉ có `CREATED_AT`. Lỗi validation bị `catch` nuốt, rơi về `MOCK_ISSUES`. Bấm vào bài mock thì trang chi tiết báo không tìm thấy | Guest, mọi role | `home-page-view.tsx:16, 76-78`. Validate: `Value "NEWEST" does not exist in "IssueSortBy" enum` |

---

## 3. Lỗi logic và lệch FE/BE (P1)

### Client

| # | Lỗi | Bằng chứng |
|---|---|---|
| P1-1 | Client không xem được tranh chấp của chính mình. Query `dispute(issueId)` có ở backend nhưng FE không gọi, nên không thấy đề xuất của admin, hạn phản đối hay nút phản đối (`challengeDisputeResolution` không được dùng) | Grep FE |
| P1-2 | Không có nút từ chối ứng viên. `rejectApplication` có ở backend nhưng FE không gọi | `issue-detail-view.tsx:380-428` |
| P1-3 | Danh sách ứng viên hiện cả đơn `REJECTED` và `WITHDRAWN`, badge ghi "N pending" là đếm tất cả | `issue-detail-view.tsx:384` |
| P1-4 | Client hủy được task `IN_PROGRESS` khi chưa nạp tiền, dev đã được chọn mất việc mà không có bước xác nhận nào. Theo kế hoạch D9/BE-23 thì phải có trạng thái `AWAITING_FUNDING` kèm reservation 24h | Probe: `cancelIssue C → CANCELLED`. `issue.module.ts:650-657` |
| P1-5 | Tab "Escrow terms" và khung bên phải hiển thị số cứng (97.5%, "USDC", "72h", "24h reservation"), không đọc `escrow(issueId)`. Token local là `mUSDC` nhưng vẫn ghi "USDC" | `issue-detail-view.tsx:584-618, 763-767` |
| P1-6 | Không có màn sửa bài. `updateIssue` chạy đúng ở backend (probe OK) nhưng FE không dùng | Grep FE |

### Developer

| # | Lỗi | Bằng chứng |
|---|---|---|
| P1-7 | Dev nộp được bài khi client chưa nạp escrow. `submitWork` chỉ kiểm `IN_PROGRESS`, không kiểm escrow. Nộp xong thì không có gì đảm bảo được trả tiền | Probe: `submitWork WITHOUT escrow → SUBMITTED`. `submission.module.ts:114` |
| P1-8 | Sau khi ứng tuyển, trang chi tiết không cho biết dev đã ứng tuyển và không có nút rút đơn (`withdrawApplication` có ở backend nhưng FE không dùng). Bấm Apply lần nữa sẽ nhận lỗi `ALREADY_APPLIED` | `issue-detail-view.tsx:663-682` |
| P1-9 | Bài nộp không ghi lên chain. Contract chỉ cho release khi `deliveryHash != 0`, tức dev phải gọi `submitWork` on-chain. Backend có action `WORK`, nhưng `submitWork` GraphQL không tạo hash và FE không có bước ký. Nếu nối escrow (P0-1) mà thiếu bước này thì client release sẽ revert `NoDelivery` | `BloodyRoarEscrow.sol:278-283`, `submission.module.ts` |
| P1-10 | Không có màn claim tiền. Contract dùng mô hình pull (`claim(address)`). Sidebar có mục "Wallet & claims" nhưng không có trang tương ứng | `left-sidebar.tsx:82` |

### Admin

| # | Lỗi | Bằng chứng |
|---|---|---|
| P1-11 | Form ruling bắt nhập `txHash` và `decisionHash`. Nếu để trống, FE gửi chuỗi rỗng `""`, zod regex fail và trả lỗi validate thay vì đi nhánh off-chain. Nếu có nhập thì cần escrow (xem P0-1) | `admin-view.tsx:79` |
| P1-12 | Hạn phản đối off-chain là 24h, nhưng contract và hằng số shared là 7 ngày (`DISPUTE_CHALLENGE_DAYS = 7`). Text trên FE admin cũng ghi 7 ngày | `dispute.module.ts:474` |
| P1-13 | Admin chỉ xem được bài nộp và chat khi issue ở `DISPUTED`. Không xem được escrow/tx của task đang chạy để hỗ trợ (backend cho phép `escrow` với ADMIN, FE không gọi) | `issue-detail-view.tsx:108`, `chat-access.ts:15` |
| P1-14 | Admin không tạo bài được (`CLIENT_ROLE_REQUIRED`) và không đổi role được. Đúng thiết kế, nhưng nút "Post a bounty" trên dashboard vẫn hiện với mọi role | Probe |

### Thông báo (mọi role)

| # | Lỗi | Bằng chứng |
|---|---|---|
| P1-15 | `submitWork` và `reviewSubmission` không tạo notification. Client không biết có bài nộp. FE vẫn báo "The developer has been notified", câu này sai | Probe: notification của dev chỉ có `TASK_ASSIGNED`, `APPLICATION_ACCEPTED`. `issue-detail-view.tsx:158` |
| P1-16 | `PAYMENT_RECEIVED` và `DISPUTE_RESOLVED` có trong enum nhưng không chỗ nào phát | Grep `src/` |

---

## 4. Dữ liệu giả trên giao diện (P2)

- Marketplace chỉ gọi `marketplaceStats` khi user là ADMIN (`marketplace-view.tsx:160-167`). Người dùng thường thấy số tính từ `MOCK_ISSUES`.
- Trang chủ khởi tạo bằng số cứng `184,320` và `1942` (`home-page-view.tsx:59-60`). Số pool chỉ cập nhật khi token có symbol đúng `USDC`, trong khi local là `mUSDC`.
- Marketplace và trang chủ gặp lỗi API nào cũng rơi về mock và chỉ hiện banner "demo". Lỗi thật như P0-5 vì thế bị che.
- `right-rail.tsx:42` có ticker giao dịch giả ("Escrow giải ngân 1,200 USDT…").

---

## 5. Hạ tầng và cấu hình (không phải lỗi code)

| Mục | Trạng thái |
|---|---|
| Node Hardhat local (`ESCROW_RPC_URL`) | Không chạy, mọi lệnh đọc chain đều fail |
| AI provider | Chưa cấu hình. `analyzeDispute` và `generateTestCases` trả `AI_UNAVAILABLE` |
| S3 | Chưa có `AWS_S3_BUCKET`, upload dùng thư mục local `.uploads` |
| GitHub OAuth | Chưa có `GITHUB_CLIENT_ID`, `/api/auth/github/start` trả 503. BUG-1 (lệch khoá HMAC) chưa kiểm lại |
| Upload ảnh cho issue | `ISSUE_INCLUDE` đọc `attachments` ảnh, nhưng route upload không nhận `issueId` và form tạo bài không có ô upload. Ảnh bài toán không bao giờ có |

---

## 6. Phần đã chạy đúng (đã kiểm bằng probe)

- SIWE login, ví mới mặc định là DEVELOPER, ví trong `ADMIN_WALLETS` thành ADMIN
- Đổi role qua profile, auth store được cập nhật ngay
- Chặn role: dev không tạo được bài, client không tự ứng tuyển, user thường không gọi được API admin, route guard `/admin` và `/dashboard`
- `createIssue`, `updateIssue`, `applyToIssue`, `rejectApplication`, `assignDeveloper` (tự từ chối các đơn còn lại và gửi thông báo)
- `applications` chỉ chủ bài xem được, `submissions` và `dispute` chỉ hai bên và admin xem được
- Chat: đọc theo trạng thái, admin chỉ đọc khi `DISPUTED`. Comment công khai
- Ban: session bị thu hồi ngay (`me` trả null), unban xong phải đăng nhập lại
- `adminStats`, `adminUsers`, `adminDisputes`, `userStats`, `myIssues`, `myApplications`

---

## 7. Gợi ý thứ tự sửa

1. **P0-5** (1 dòng): đổi `NEWEST` thành `CREATED_AT` ở `home-page-view.tsx:16`.
2. **Quyết định hướng cho bản demo:** có bắt buộc escrow on-chain hay không.
   - **Nếu có:** làm FE cho deposit (approve USDC + `deposit`), `submitWork` on-chain, `releaseFunds`, `claim`, rồi gọi `confirmEscrowTransaction`/`depositToEscrow` với tx hash. Chặn `submitWork` GraphQL khi chưa có escrow (P1-7).
   - **Nếu không (chỉ off-chain):** `reviewSubmission(approved)` chuyển issue sang `COMPLETED` và phát `PAYMENT_RECEIVED`. Form tranh chấp bỏ ô tx hash (P0-3). Admin ruling không gửi chuỗi rỗng (P1-11).
3. **P0-4:** thêm bước kết thúc tranh chấp off-chain (ruling cuối, hoặc hết hạn challenge thì tự resolve), giới hạn một lần challenge, đưa hạn về 7 ngày (P1-12).
4. **FE cho client/dev:** xem tranh chấp và phản đối (P1-1), từ chối ứng viên (P1-2, P1-3), trạng thái đã ứng tuyển và rút đơn (P1-8).
5. Notification cho submit, review, release, resolve (P1-15, P1-16).
6. Bỏ số giả (mục 4).
