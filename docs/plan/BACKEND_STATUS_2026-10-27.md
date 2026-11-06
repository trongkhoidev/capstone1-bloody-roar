# Trạng thái backend và kế hoạch hoàn thiện (27/10/2026)

**Ngày kiểm tra:** 27/10/2026
**Nhánh:** `feat/claude-ui-redesign` (PR #13), HEAD `e6a5a64`, working tree sạch
**Đối chiếu với:** [`BACKEND_REMAINING_TASKS.md`](BACKEND_REMAINING_TASKS.md) (audit 27/09 trên nhánh cũ) và [`BACKEND_EXECUTION_PLAN.md`](BACKEND_EXECUTION_PLAN.md) (quyết định QĐ-01 đến QĐ-32)

Tài liệu này ghi những gì đã kiểm bằng code và lệnh chạy hôm nay. Mục nào chưa kiểm được sẽ ghi rõ là "Chưa kiểm".

---

## 1. Tóm tắt

- **Phần marketplace chạy được.** Đăng nhập SIWE, profile, Issue, Application, chat qua socket, thông báo, upload, admin ban/unban đều có code. Typecheck, lint và test đều pass.
- **Phần tiền chưa đúng thiết kế.** Module escrow hiện tại tin vào `txHash` do client gửi lên, rồi đọc receipt để xác nhận. Kế hoạch yêu cầu ngược lại: trạng thái tiền chỉ đổi khi indexer fold một event canonical ở safe head. Hiện chưa có indexer, projection, reservation hay mutation `prepareX`.
- **Lịch đã trượt.** Kế hoạch đặt M0 đến M3 trong khoảng 28/09 đến 25/10. Phần lớn M0 còn dở, và chưa có việc nào của M1 trở đi.
- **Còn lại khoảng 38 ngày công** cho một người (ước lượng thô từ size của các task `BE-xx`, xem mục 5). Đường găng là indexer, fold và projection. Mọi task liên quan tiền đều phụ thuộc vào khối này.

**Về PR #13:** tiêu đề và mô tả nói về UI redesign, nhưng nhánh này đã merge PR #12 (backend escrow) nên backend hiện tại nằm trong PR #13. PR #12 vẫn đang OPEN.

---

## 2. Đã kiểm chứng hôm nay

| Kiểm tra | Kết quả |
|---|---|
| `bun run typecheck` | Pass (exit 0) |
| `bun run lint` | Pass, có 4 cảnh báo `no-explicit-any` ở `components/ui/moving-border.tsx` |
| `bun run --cwd apps/web test` | 18/18 file, 74/74 test |
| `bun run contracts:test` (Hardhat) | 35/35 pass |
| `apps/contracts/contracts/BloodyRoarEscrow.sol` | Giống hệt `c538e0c`, đúng QĐ-01 |
| `origin/main` đã vào nhánh | Có, không còn commit nào của `main` bị thiếu (BE-00 xong) |
| GraphQL schema build từ code | 23 query, 25 mutation, 15 field kiểu `Float` |

**Chưa chạy:** Foundry fuzz/invariant, `test:e2e:backend` (cần Postgres và chain local), build Docker image.

**Về contract đã deploy:** `.env` có sẵn một địa chỉ escrow Sepolia, nhưng chưa xác minh được bytecode on-chain. Lý do:
- Thư mục `deployments/` bị gitignore, nên repo không có manifest. Manifest hiện tại cũng chưa có `deployBlock`.
- Biến RPC trong `.env` (`ALCHEMY_RPC_URL_TESTNET`) không phải tên app đọc (app đọc `ESCROW_RPC_URL`). Giá trị đó cũng không bắt đầu bằng `http`. Tài liệu này không in giá trị.

---

## 3. Trạng thái từng task

Ký hiệu: **Xong**, **Dở** (làm một phần, ghi rõ phần nào), **Chưa**, **Chưa kiểm**.

### 3.1 Bug trong audit

| ID | Trạng thái | Bằng chứng |
|---|---|---|
| BUG-1 GitHub OAuth luôn fail | Chưa | `auth/github/start/route.ts:26` ký HMAC bằng chuỗi env thô. `callback/route.ts` verify bằng `keyBytes()`, hai bên không khớp nhau |
| BUG-2 vòng propose → challenge không giới hạn | Chưa | `dispute.module.ts` còn `proposeDisputeResolution` và `challengeDisputeResolution` |
| BUG-3 không đăng nhập được admin | Dở | `lib/admin-wallets.ts` đọc `ADMIN_WALLETS`, route login đã dùng. Seed vẫn tạo ví `0x…dead`. Chưa có CLI `grant-admin` |
| BUG-4 tiền dùng `Float` | Chưa | 15 field `Float` trong SDL. Có 16 dòng khớp `Float` trong `issue`, `dispute`, `escrow` module |
| BUG-5 server bind `localhost` | Xong | `server.ts:18` mặc định `0.0.0.0` khi production |
| BUG-6 file generate lạc chỗ | Chưa | Còn `packages/database/apps/web/src/graphql/generated/pothos-types.ts` |
| BUG-7, 8, 9 | Chưa kiểm | |
| BUG-11 hằng số lệch contract | Dở | Đã có `ESCROW_REVIEW_DAYS`, `DISPUTE_CHALLENGE_DAYS = 7`, `DISPUTE_FINAL_NOTICE_HOURS`, `ARBITER_STALL_DAYS`. Còn `PLATFORM_FEE_PERCENT = 2.5` kiểu float, và các hằng số này chưa sinh từ contract |
| BUG-12 socket sống sau khi token hết hạn | Chưa | Chưa thấy kiểm tra session định kỳ trong `socket/handlers.ts` |

### 3.2 Nền tảng, bảo mật, CI

| ID | Trạng thái | Ghi chú |
|---|---|---|
| BE-00 merge `origin/main` | Xong | |
| BE-01 rate limit nonce và login | Chưa | |
| BE-02 kiểm domain và chain SIWE | Dở | Có kiểm `domain` và `chain_id` (`siwe-validation.ts:34-36`). Chưa kiểm cách map lỗi P2002 thành replay |
| BE-09 bỏ chặn theo role (QĐ-21) | Chưa | `issue.module.ts:516` yêu cầu CLIENT, `application.module.ts:90` yêu cầu DEVELOPER |
| BE-22 `rejectApplication` | Xong | |
| BE-60 env schema bằng zod | Chưa | `lib/env.ts` chỉ nạp `.env`, không validate |
| BE-72 rate limit toàn hệ thống | Chưa | Không có code |
| BE-73 hardening GraphQL Yoga | Chưa | Không có CSRF prevention, giới hạn depth, hay tắt introspection |
| BE-59 rate limit socket | Chưa | |
| BE-80 test harness Postgres | Chưa | Test hiện tại là unit test |
| BE-85, BE-86 CI | Chưa | Không có `.github/workflows` |
| BE-87 secret scanning, drift check | Chưa | |

### 3.3 Lưu trữ và deploy

| ID | Trạng thái | Ghi chú |
|---|---|---|
| BE-50 hỗ trợ `S3_ENDPOINT` | Dở | `lib/storage.ts:21-23` đọc `S3_ENDPOINT`, nhưng `.env` chưa có biến này |
| BE-50a, 50b purpose, sha256, phân quyền file | Chưa | `Attachment` chưa có `purpose` và `sha256` |
| BE-88 Dockerfile | Dở | Có Dockerfile. Chưa build thử |
| BE-89 Railway web và worker | Dở | Có `railway.json` với healthcheck `/api/health` (`server.ts:38`) và migrate trước deploy. Chưa có worker |
| BE-90 Supabase | Chưa kiểm | |
| Seed production | Xong | `seed-prod.ts` dùng upsert, chạy lặp lại an toàn |

### 3.4 Schema và contract plumbing

| ID | Trạng thái | Ghi chú |
|---|---|---|
| BE-41 schema mới (FundingReservation, TransactionIntent, ChainEvent, ProjectionCheckpoint, EscrowProjection, RulingRecord, SettlementProposal, ClaimableBalance, ContractConfig, EvidenceManifest, ReconciliationFinding) | Chưa | Schema còn `Escrow`, `Transaction`, `EscrowStatus`, `TransactionType` cũ |
| BE-75 bỏ header FROZEN | Chưa | Header vẫn ghi "FROZEN 24/8" |
| BE-14 `Issue.deliveryDeadline`, `termsVersion`, `termsHash` | Chưa | Hai field deadline và hash đang nằm ở model `Escrow`, không phải `Issue` |
| BE-15 hashing RFC 8785 và test vector | Chưa | Không có `keccak256` hay `canonicalize` trong `apps/web/src` và `packages/shared/src` |
| BE-17 scalar tiền (cùng BUG-4) | Chưa | |
| BE-30 export ABI, manifest có `deployBlock` | Dở | ABI viết tay trong `packages/shared/src/escrow-abi.ts`. `deploy.ts` chưa ghi `deployBlock` |
| BE-32 spec EIP-712 và verifier | Chưa | |
| BE-33 kiểu `PreparedCall` | Chưa | |
| BE-35 `TransactionIntent` và state machine | Chưa | |
| BE-41f sinh `escrowKey`, lưu `escrowIdHash` | Chưa | |

### 3.5 Module escrow hiện tại (cần thay, không chỉ bổ sung)

- `depositToEscrow` nhận `txHash`, verify receipt rồi tạo bản ghi `Escrow`. Đây là đúng kiểu mà kế hoạch cấm: không đánh dấu thành công dựa trên tx hash.
- `confirmEscrowTransaction`, `releaseFunds`, `cancelEscrow` cùng kiểu. `cancelEscrow` gọi action `CANCEL`, nhưng contract không có hàm cancel (grep ra 0 kết quả). Nên gỡ.
- `escrowClaimableBalance` đọc RPC với block `latest`, không phải tag `safe`.
- Finality: toàn bộ luồng dùng `getBlockNumber()` thay vì tag `safe` (QĐ-11). Chưa có scanner định kỳ.
- `assignDeveloper` (`application.module.ts:311`) vẫn chuyển Issue sang `IN_PROGRESS` ngay (D9, BE-23 chưa làm).
- `IssueStatus` chưa có `AWAITING_FUNDING`.

### 3.6 Lifecycle, dispute, settlement

| ID | Trạng thái | Ghi chú |
|---|---|---|
| BE-23 `selectDeveloper` và reservation 24h | Chưa | |
| BE-31, 37, 38 reservation, hết hạn, hủy | Chưa | |
| BE-34 `prepareEscrowDeposit` | Chưa | |
| BE-36 fold `Deposited` | Chưa | |
| BE-39, 39a, 39b submission, manifest, `deliveryHash`, `submitWork` on-chain | Chưa | `Submission` chưa có `deliveryHash`, `manifest`, `supersededAt` |
| BE-42, 45, 46, 48 release, timeout, claim | Dở | Có `releaseFunds` nhưng theo kiểu tx hash, phải làm lại |
| BE-43 `requestChanges` | Chưa | |
| BE-44 fold `EscrowResolved` | Chưa | |
| BE-49, 49a settlement | Chưa | |
| BE-51 `Dispute` dùng bps, phase mirror | Chưa | `suggestedRatio`, `proposedClientRatio` vẫn là Decimal 0–100 |
| BE-52, 53 evidence manifest, raise dispute | Chưa | |
| BE-54 `draftRuling` | Chưa | `analyzeDispute` vẫn chạy, `proposeDisputeResolution` vẫn lật trạng thái off-chain |
| BE-55, 56, 57 ruling on-chain và gỡ luồng cũ | Chưa | |
| BE-58 admin xem evidence qua signed URL | Chưa | |

### 3.7 Indexer và worker

| ID | Trạng thái | Ghi chú |
|---|---|---|
| BE-40 skeleton worker | Chưa | Không có `apps/worker` |
| BE-41a log scanner | Chưa | |
| BE-41b hàm fold thuần | Chưa | |
| BE-41c reorg và rebuild | Chưa | |
| BE-41d CLI replay | Chưa | |
| BE-41e harness chain local | Chưa | |
| BE-82 test bảng cho fold | Chưa | |
| BE-59b NOTIFY sang web | Chưa | |
| BE-66, 66b, 66c reconciler, deposit lệch terms | Chưa | |
| BE-47 scheduler deadline | Chưa | |

### 3.8 Chat, thông báo, AI

- **BE-61** mở rộng `NotificationType`: Chưa. Hiện có 8 loại, kế hoạch cần khoảng 20.
- **BE-62** thông báo gắn vào fold: Chưa.
- **BE-59a** chính sách chat theo phase: Chưa.
- **AI Guard bỏ qua tin `FILE`** (`socket/handlers.ts:269-271`): Chưa sửa. Đây là lỗ hổng, QĐ-32 yêu cầu sửa ngay ở tuần 1.
- **Hash SHA-256 không salt** (`socket/handlers.ts:273`, `ai/model-router.ts:67`): Chưa sửa.
- **`AI_GUARD_PATTERNS`** còn trong `packages/shared/src/constants/index.ts:104`: Chưa xóa.
- Các mục AI còn lại: xem checklist cuối `BACKEND_REMAINING_TASKS.md`. Phần đó vẫn đúng với code hiện tại.

### 3.9 Admin, analytics, review

- **BE-64** `adminLogs`, `adminIssues`, `adminHideIssue`: Chưa.
- **BE-65** query ops (`indexerStatus`, `reconciliationFindings`, `stuckIntents`, `contractConfig`): Chưa.
- **BE-67** thống kê từ projection: Chưa. Chưa có projection để tính từ.
- **BE-12** review và reputation: Dở. Có model `Review` nhưng chưa có module hay mutation `submitReview`.

---

## 4. Chỗ tài liệu cũ đã lệch so với code

- BE-00 được ghi là chưa làm. Thực tế đã xong.
- Tài liệu 27/09 ghi "không có escrow GraphQL module". Hiện có module, nhưng theo thiết kế tx hash cũ.
- Tài liệu 27/09 ghi nhánh là `feat/ui-redesign-and-navbar`. Nhánh hiện tại là `feat/claude-ui-redesign`.
- Lịch trong `BACKEND_EXECUTION_PLAN.md` (M0 từ 28/09 đến M5 kết thúc 08/11) đã trượt. Cần đặt lại mốc.

---

## 5. Kế hoạch hoàn thiện

**Nguyên tắc:** làm theo đường găng. Indexer và fold là khối quan trọng nhất. Trước khi có fold, các mutation tiền chỉ là khung rỗng, không có gì để kiểm chứng.

Ước lượng là ngày công cho một người, dựa trên size trong `BACKEND_REMAINING_TASKS.md`. Các con số là ước lượng thô, sẽ điều chỉnh khi bắt đầu từng pha.

### Pha 1: Nền và bug (~5 ngày)

Làm trước vì các việc này đụng nhiều module. Để muộn sẽ tốn công hơn.

1. BUG-4 và BE-17: scalar `TokenAmount`, bỏ `Float`. Đụng `issue`, `dispute`, `escrow`.
2. BUG-11: hằng số lấy từ contract, bỏ `PLATFORM_FEE_PERCENT` kiểu float.
3. BUG-1: dùng chung một hàm `keyBytes()` cho start và callback, thêm unit test.
4. BUG-2: chặn challenge lần hai tạm thời. Xóa khi có luồng on-chain.
5. BUG-6, BUG-12.
6. AI Guard: quét tin `FILE`, đổi SHA-256 thành HMAC, xóa `AI_GUARD_PATTERNS`.
7. BE-09: bỏ chặn theo role, theo QĐ-21.
8. BE-60 env schema bằng zod, BE-72 rate limit, BE-73 hardening Yoga.
9. BE-85 CI cơ bản (lint, typecheck, test, `prisma generate`). BE-86 CI cho contract.
10. BE-15: hashing RFC 8785 và test vector dùng chung giữa TS và Solidity.
11. BE-30: export ABI từ artifacts, thêm `deployBlock` vào manifest.

### Pha 2: Schema và plumbing (~5 ngày)

- BE-41, BE-75, BE-14, BE-31 (model), BE-41f, BE-51 (bps), BE-39 (cột mới).
- Migration mới. Giữ bảng `Escrow`, `Transaction` cũ cho đến khi pha 4 xong rồi mới bỏ.
- Hệ quả: sau migration, module escrow cũ sẽ không chạy đúng. Cần chọn cách xử lý (xem mục 7).

### Pha 3: Indexer (~8 ngày), đường găng

- BE-40: skeleton `apps/worker` (entrypoint, `/health`, graceful shutdown).
- BE-41a: log scanner theo safe head, chia range, checkpoint, insert idempotent.
- BE-41b: hàm fold thuần cho 20 event. BE-82: test dạng bảng cho mọi transition.
- BE-41c: reorg và rebuild. BE-41d: CLI replay.
- BE-59b: NOTIFY sang web để emit `escrow:invalidate`.
- BE-41e: harness hardhat node, MockUSDC, deploy, chạy script lifecycle.

### Pha 4: Lifecycle mutation (~10 ngày)

Phần off-chain của pha này có thể làm song song với pha 3.

- Chọn developer và reservation: BE-23, 31, 37, 38, 16.
- EIP-712 và deposit: BE-32, 34, 36, 66c.
- Submission và release: BE-39, 39a, 39b, 42, 43, 44.
- Claim: BE-45, 46, 48.
- Settlement: BE-49, 49a.
- Chat theo phase: BE-59a.
- Gỡ luồng tx hash cũ sau khi các mutation mới chạy được.

### Pha 5: Dispute on-chain (~5 ngày)

- BE-52, 53, 54, 55, 56, 57, 58.
- Gỡ `proposeDisputeResolution` và `challengeDisputeResolution`, bỏ việc lật trạng thái off-chain.

### Pha 6: Đóng gói (~5 ngày)

- BE-83: E2E lifecycle trên chain local, đủ 6 kết cục. Mỗi nhánh kết thúc bằng claim và số dư khớp.
- BE-74, BE-81: ma trận authz và test resolver.
- BE-66, 66b: reconciler (có thể rút gọn, xem mục 7).
- BE-88, 89, 90, 91: Docker, Railway web và worker, Supabase, guard môi trường.
- BE-93, BE-95: correlation ID, health và metrics của worker.
- Smoke test trên Base Sepolia (cần Kiên).
- Cập nhật tài liệu: API, cách setup, trạng thái thật trong backlog.

### Pha 7: AI và việc P2 (cắt được)

- M6 trong `BACKEND_EXECUTION_PLAN.md`, và các mục P2 chưa liệt kê ở trên.

**Tổng pha 1 đến 6:** khoảng 38 ngày công. Nếu bắt đầu 28/10 và làm đều mỗi ngày làm việc, dự kiến xong khoảng 18/12/2026. Chưa tính nghỉ lễ và việc phát sinh.

---

## 6. Phụ thuộc bên ngoài

- **Kiên:** deploy contract lên Base Sepolia (S2-ESC-14), tạo 3 Safe 2-of-3 với 9 ví test, verify trên BaseScan, ghi manifest có `deployBlock`, review mọi PR liên quan tiền, diễn tập Arbiter Safe ký một ruling.
- **RPC:** cần một URL Alchemy hợp lệ trong `.env`, đúng tên biến app đọc. Hiện chưa dùng được.
- **Supabase:** bucket private, service key chỉ ở server.
- **Railway:** service web và worker, env group.

---

## 7. Quyết định cần bạn chốt

Ba việc này ảnh hưởng đến thời lượng. Không việc nào chặn việc bắt đầu pha 1.

1. **Cắt phạm vi MVP.** Đề xuất: đưa M6 (AI), BE-68, BE-69 (dedupe webhook GitHub), BE-70 (PR làm evidence) ra khỏi MVP. Rút gọn BE-12 xuống `submitReview` và cập nhật `completedTaskCount`. Giữ đầy đủ mọi việc thuộc đường tiền, authz, indexer và deploy.
2. **Gỡ module escrow cũ lúc nào.** Đề xuất: đóng băng và trả lỗi rõ ràng ngay ở pha 2, để không có hai luồng tiền chạy song song. Nếu giữ đến pha 4, cần một đường dẫn để frontend không gọi nhầm.
3. **Làm một mình hay chia việc.** Làm một mình thì mất khoảng 8 tuần. Nếu Hiếu nhận pha 4 và Hân viết test cho BE-74 và BE-81, thời gian rút xuống khoảng 5 tuần theo cách chia trong `BACKEND_EXECUTION_PLAN.md`.

---

## 8. Việc làm ngay

Bắt đầu từ pha 1, lấy bốn việc sau:

1. BUG-1: sửa một hàm và thêm test. Đây là việc nhỏ, làm nhanh.
2. BUG-4 và BE-17: scalar tiền. Đụng nhiều nhất nên làm sớm.
3. AI Guard quét tin `FILE`: lỗ hổng bảo mật, sửa một dòng điều kiện.
4. BE-85: CI cơ bản, để các PR sau có lưới an toàn.

---

## 9. Danh sách việc còn lại

Gom theo nhóm. ID đầy đủ và size nằm trong `BACKEND_REMAINING_TASKS.md`.

- **Bug:** BUG-1, 2, 3 (CLI `grant-admin`, seed), 4, 6, 7, 8, 9, 11 (phần còn lại), 12.
- **Nền tảng và bảo mật:** BE-01, 09, 14, 15, 17, 30, 59, 60, 72, 73, 80, 85, 86, 87.
- **Schema:** BE-31, 33, 35, 39 (cột), 41, 41f, 51, 75.
- **Escrow lifecycle:** BE-16, 23, 32, 34, 36, 37, 38, 39a, 39b, 42, 43, 44, 45, 46, 48, 49, 49a, 59a.
- **Dispute:** BE-50a, 50b, 52, 53, 54, 55, 56, 57, 58.
- **Worker và indexer:** BE-40, 41a, 41b, 41c, 41d, 41e, 47, 59b, 62, 66, 66b, 66c, 82.
- **Thông báo và chat:** BE-61, 62, 63.
- **Admin, analytics, review:** BE-12, 64, 65, 66a, 67, 68.
- **Deploy và vận hành:** BE-50, 88, 89, 90, 91, 93, 95, 76, 84.
- **Bảo mật AI (P0 tuần 1):** guard quét `FILE`, HMAC thay SHA-256, xóa `AI_GUARD_PATTERNS`.
- **AI (có thể cắt):** các mục còn lại trong checklist cuối `BACKEND_REMAINING_TASKS.md`.

---

## 10. Rủi ro

- **Indexer và RPC:** giới hạn `getLogs` hoặc RPC chập chờn có thể làm chậm đồng bộ. Cần range thích ứng và checkpoint (QĐ-11).
- **Fold lệch contract:** nếu projection tính sai số tiền thì mọi thống kê sai theo. Số tiền phải lấy từ event `EscrowResolved`, không tự tính.
- **Migration làm vỡ module cũ:** xem quyết định 2 ở mục 7.
- **Phụ thuộc vào Kiên:** deploy, Safe và review tiền đều nằm ở một người. Nên chốt lịch sớm.

---

## Phạm vi và giới hạn của tài liệu này

- Tài liệu này không sửa code. Chỉ thêm file này.
- Chưa chạy: Foundry fuzz/invariant, E2E với Postgres và chain, build Docker, kiểm chứng contract on-chain.
- Chưa kiểm: BUG-7, 8, 9, BE-90, và các chi tiết chính sách trong `BACKEND_REMAINING_TASKS.md` không liên quan đến code hiện tại.
