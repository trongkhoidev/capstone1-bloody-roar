# Kế hoạch hoàn thiện Bloody-Roar (27/09/2026)

Thư mục này gom kết quả audit và kế hoạch cho giai đoạn tiếp theo. Mọi nhận định đều đối chiếu với code trên nhánh `feat/ui-redesign-and-navbar` (sau khi đã pull PR #10 và #11), `docs/PROPOSAL.md` v2.0 và `apps/contracts/contracts/BloodyRoarEscrow.sol`.

| File | Nội dung |
| --- | --- |
| [`BACKEND_REMAINING_TASKS.md`](BACKEND_REMAINING_TASKS.md) | Toàn bộ task backend còn lại (trừ AI), theo phase, có ID, priority, size, dependency. Checklist AI tách riêng ở cuối. |
| [`AI_STRATEGY_V1_V2.md`](AI_STRATEGY_V1_V2.md) | Phân tích từng tính năng AI, cách xử lý ở v1 (model API) và v2 (self-host + RAG/fine-tune), kiến trúc và lộ trình. |
| [`BACKEND_EXECUTION_PLAN.md`](BACKEND_EXECUTION_PLAN.md) | **Kế hoạch thực thi đã chốt**: 32 quyết định (QĐ-01..32), lộ trình M0–M6, API đóng băng cho FE, rà soát prototype. |
| [`UI_REDESIGN_SPEC.md`](UI_REDESIGN_SPEC.md) | Design system, sitemap theo role, spec từng trang, badge trạng thái. Prototype: https://claude.ai/artifact/5DgZDzkgGs2jpDtrybe8TL |

---

## 1. Nhật ký pull PR (không merge vào `main`)

| PR | Nội dung | Cách đưa vào nhánh | Kết quả |
| --- | --- | --- | --- |
| #10 `docs/proposal-backlog` (MrSufferer) | Viết lại `PROPOSAL.md` (VI), chỉnh `PRODUCT_BACKLOG.md`, 11 sơ đồ UML trong `docs/diagrams/rendered/` | Cherry-pick 5 commit docs (`8b33f29..de00c56`) | File docs giống hệt PR. Conflict duy nhất ở `docs/PROPOSAL.md` được giải quyết bằng bản cuối của PR. |
| #11 `feat/safe-escrow-amendments` (MrSufferer) | `BloodyRoarEscrow.sol` đầy đủ lifecycle, mock token/Safe, Hardhat + Foundry fuzz/invariant, deploy guard, `SECURITY.md` | Cherry-pick 1 commit (`c538e0c`) | 3 conflict: `.sol` lấy bản PR (nhánh mình chỉ đổi ký tự trong stub); `hardhat.config.ts` giữ thêm `evmVersion: "cancun"`; `package.json` giữ `ignition-core`, OZ chuyển sang `dependencies` pin `5.6.1` theo PR. **35/35 Hardhat test pass** sau merge. |

**Vì sao cherry-pick thay vì `git merge`:** cả hai PR base trên `origin/main` mới, trong đó có PR #6 (backend-marketplace) mà nhánh này chưa có. Merge thẳng sẽ kéo theo PR #6 và conflict ở khoảng 15 file backend, trong đó `issue.module.ts` và `application.module.ts` đang có thay đổi chưa commit. Cherry-pick chỉ đưa đúng nội dung của 2 PR vào, không đụng tới WIP.

**Việc còn lại:** merge `origin/main` (PR #6) vào nhánh này là task `BE-00` trong file backend. Nên làm ngay sau khi commit WIP hiện tại. Khi PR #10/#11 được merge vào `main` sau này, git sẽ nhận ra các thay đổi trùng nên không gây conflict lại.

---

## 2. Các điểm lệch giữa Contract và Proposal (đã chốt)

Các điểm dưới đây **đã được chốt** trong [`BACKEND_EXECUTION_PLAN.md`](BACKEND_EXECUTION_PLAN.md) mục 2. Tóm tắt: giữ nguyên contract v1.0 (`c538e0c`), sửa Proposal cho khớp; D7 giữ `string` + backend lưu hash; D8–D10 làm theo đề xuất.

| # | Contract hiện tại | Proposal ghi | Đề xuất ban đầu |
| --- | --- | --- | --- |
| D1 | `_resolve()` thu 2,5% trên **phần của Developer** ở mọi nhánh: release, review timeout, settlement, ruling, 50/50 split. Chỉ missed-delivery refund là 0 phí vì phần dev = 0. | Chỉ `releaseFunds` có phí; refund, timeout, settlement, ruling, arbiter-stall đều fee-free (§9.3 invariant 3, UC-02, UC-04). | Chọn một. Nếu giữ contract: sửa Proposal. Nếu giữ Proposal: truyền cờ `chargeFee` vào `_resolve` và thêm test. Dù chọn gì, projection phải đọc số tiền từ event `EscrowResolved`, không tự tính. |
| D2 | `CHALLENGE_PERIOD = 7 days` | Notice window sau initial ruling là 24h | Sửa Proposal và `DISPUTE_CHALLENGE_HOURS` trong `packages/shared` theo contract. |
| D3 | Có `EVIDENCE_RESPONSE_PERIOD = 72h`; arbiter không được rule trước khi hết | Không nhắc | Bổ sung vào Proposal và UI. |
| D4 | 50/50 fallback mở sau 30 ngày kể từ `raisedAt` **hoặc** `challengedAt` | Chỉ sau challenge | Bổ sung vào Proposal. |
| D5 | Pull-payment: `_resolve` chỉ ghi `claimable`, mỗi bên phải gọi `claim()` | Không nhắc | Bổ sung bước Claim vào mọi journey và UI. |
| D6 | Chỉ bên **mất principal** mới được `challengeRuling` | "một challenge" | Ghi rõ trong Proposal và UI. |
| D7 | `escrowId` là `string` indexed, nên log chỉ chứa `keccak256(escrowId)` | — | Chuyển sang `bytes32` (gọn nhất), hoặc backend lưu cả `escrowKey` + `escrowIdHash` trước deposit. |
| D8 | Backend đang có luồng dispute off-chain: web ADMIN "propose" tỉ lệ float 0–100 với cửa sổ 24h | §9.4: web ADMIN tách hẳn khỏi Arbiter Safe | Bỏ state mutation của admin, chuyển sang "draft ruling → payload cho Safe ký" (BE-54). |
| D9 | `assignDeveloper` chuyển Issue sang `IN_PROGRESS` ngay và reject mọi application khác | UC-01: reservation 24h `AWAITING_FUNDING`, giữ các application khác, chỉ `IN_PROGRESS` khi thấy `Deposited` | Refactor theo Proposal (BE-23, BE-31). |
| D10 | Backlog S3-GH-07 / US-8.4 "auto-pay khi PR merged" | §5.2, §9.4 cấm | Xóa khỏi backlog, đổi thành "thông báo cho client". |

## 3. Tài liệu đang ghi sai trạng thái

- `docs/documentation_bloody-roar.md` §9 liệt kê escrow, KYC, Web IDE, AI chấm code là "đã hoàn thiện". Không phần nào tồn tại trong repo. Proposal §15 yêu cầu báo cáo trung thực, nên cần sửa.
- Backlog ghi "chưa làm" cho uploads, notifications, GitHub OAuth, admin user management và cả 3 tính năng AI, trong khi backend đã có code chạy được.
- UI copy: `right-rail.tsx:66` ("Tranh chấp giải quyết bởi AI Arbiter trong 24h") và `layout.tsx:15` ("AI Dispute resolution") mâu thuẫn với Proposal §4.4.
