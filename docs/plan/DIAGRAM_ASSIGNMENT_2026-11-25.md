# Phân công vẽ và sửa sơ đồ – C1SE.25 Bloody-Roar

Nháp: **28/11** · Review chéo: **30/11** · Chốt và chèn vào docx: **02/12**

| # | Người | Sơ đồ | Nội dung bắt buộc | Chèn vào tài liệu |
|---|---|---|---|---|
| 1 | **Khôi** | Sequence (2 luồng) | ① SIWE login (nonce → ký → session). ② Chọn dev → reservation 24h → approve USDC → deposit (110 USDC cho bounty 100) → indexer cập nhật | TR 3.5, Arch |
| 2 | **Khôi** | ADD + C4 + C&C | Bổ sung các vòng lặp ADD (driver → tactic → lý do) và bảng QA ↔ tactic. Đặt tên C4: Context (L1), Container (L2), Component (L3, phần web). Gộp C&C của Arch và TR: tách Implemented và Target | Arch 3–4, TR 3.2 |
| 3 | **Kiên** | Sequence (2 luồng) | ③ Submit work → client release → claim (dev 100, phí 10). ④ Raise dispute → evidence 72h → initial ruling (Arbiter Safe) → challenge 7 ngày → final ruling 24h → claim | TR 3.5.4 |
| 4 | **Kiên** | State diagram escrow + Activity escrow | Sửa chú thích `PLATFORM_FEE_BPS 1000 (10%, client trả thêm)`. Activity: release / missed delivery refund / review timeout / settlement | TR 3.5.4, Arch |
| 5 | **Hiếu** | ERD (crow's foot) | 38 model hiện tại, chia 5 nhóm như hình cũ; mỗi bảng có PK, FK, field chính, cardinality 1–n / n–n. Mỗi nhóm một hình, thêm một hình tổng | TR 3.3 + Appendix A |
| 6 | **Hiếu** | Class diagram + Module view | Class: User, Issue, Application, Submission, Dispute, Escrow, Message… kèm thuộc tính, method và quan hệ. Cập nhật Module view theo 38 model và các module mới (similarity, reuse) | TR 3.2.2, Arch 5 |
| 7 | **Hân** | Use case diagram + đặc tả UC | Actor: Guest, Client, Developer, Admin, Arbiter Safe, GitHub, AI. Khoảng 12–15 UC. Mỗi UC có bảng đặc tả: ID, actor, tiền điều kiện, luồng chính, luồng phụ, hậu điều kiện | SRS (doc 12) |
| 8 | **Hân** | Activity (3 luồng) | Đăng bounty (kể cả AI TestGen) · Ứng tuyển và chọn dev (kể cả giá reuse) · Nộp bài và review / request changes | SRS (doc 12) |
| 9 | **Trâm** | BFD | Cây chức năng: Tài khoản · Marketplace · Escrow & thanh toán · Làm việc (chat, nộp bài) · Tranh chấp · Quản trị · AI | SRS (doc 12) |
| 10 | **Trâm** | DFD mức 0 + mức 1 + sửa Context | Vẽ lại Context trong Proposal: tách Admin / Arbiter Safe, thêm GitHub, AI, Storage, sửa lỗi "Interation". DFD mức 1 có process, data store (bảng DB), luồng dữ liệu | Proposal 4.1, SRS |

## Quy ước chung (ai cũng phải theo)

- Công cụ: draw.io. Nộp file `.drawio` và PNG xuất ở scale 2x vào `docs/diagrams/<tên>.png`.
- Tên actor thống nhất: **Client, Developer, Admin, Arbiter Safe (2-of-3)**. Không dùng "Admin/Arbiter".
- Số liệu thống nhất: phí **10% client trả thêm** (bounty 100 → nạp 110), review 7 ngày, evidence 72h, challenge 7 ngày, final notice 24h, arbiter stall 30 ngày, chain Base Sepolia 84532, **38 model / 25 enum**.
- Không vẽ EAS, multi-agent debate 5 agent hay auto-payout GitHub. Thứ gì chưa code thì ghi nhãn **[Target]**.
- Mỗi hình có caption dạng `Figure N: <tên>` và được nhắc tới trong phần text.
- Review chéo ngày 30/11: Khôi ↔ Kiên, Hiếu ↔ Hân, Trâm ↔ Khôi.
