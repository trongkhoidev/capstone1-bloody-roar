# Quy tắc mở tranh chấp (S-203a, US-29)

Trạng thái: **chờ Khôi duyệt** mục 2.2 và 2.4. Mục 2.1 và 2.3 đã chốt với Khôi ngày 25/11.

Tham chiếu: `docs/plan/COMPLETION_PLAN_2026-11-15.md` mục 4.1 (G-6), 4.3 (W-1, W-2), 6.8.

## 1. Vấn đề (G-6)

`raiseDispute` hiện chỉ kiểm `phase == FUNDED` và người gọi là một trong hai bên. Hệ quả:

- Client mở tranh chấp ngay sau khi nạp tiền, trước khi dev nộp bài, để giữ tiền của dev trong ít nhất 72 giờ chờ bằng chứng cộng thời gian trọng tài.
- Client mở tranh chấp sau khi hạn duyệt 7 ngày đã hết, để chặn `claimReviewTimeout` mà dev đáng được gọi.
- Mở tranh chấp không mất gì, nên bên thua không chịu hậu quả nào.

## 2. Quy tắc

### 2.1 Không có tiền cọc (đã chốt)

Mở tranh chấp không mất phí, không đặt cọc. Lý do: escrow là thỏa thuận hai bên cùng có lợi, đặt cọc làm người ít tiền ngại dùng tranh chấp chính đáng. Hậu quả của tranh chấp sai nằm ở uy tín (2.3).

### 2.2 Ai và khi nào (đề xuất)

| Điều kiện | Quy tắc | Lý do |
|---|---|---|
| Ai | Client hoặc dev của escrow, như hiện tại | Hai bên đều có thể bị thiệt |
| Từ khi nào | Chỉ sau khi dev đã nộp bài (`deliveryHash != 0`) | Trước đó chưa có gì để tranh chấp. Client đã có `claimMissedDeliveryRefund` nếu dev không nộp |
| Đến khi nào | Trước khi hạn duyệt kết thúc (`block.timestamp < submittedAt + REVIEW_PERIOD`) | Sau hạn, dev có quyền gọi `claimReviewTimeout`. Không để client dùng tranh chấp chặn quyền đó |
| Mấy lần | Một lần mỗi escrow | Đã đúng sẵn: `DISPUTED` không quay về `FUNDED` |

Nộp lại bài (`submitWork` lần nữa) làm `submittedAt` mới, nên hạn duyệt và hạn mở tranh chấp cùng dời theo. Đây là hành vi hiện có của hạn duyệt, không đổi.

Contract dùng lại hai lỗi đã có, ABI không thêm lỗi mới:

- Chưa nộp bài: `NoDelivery()`.
- Hết hạn duyệt: `DeadlinePassed(submittedAt + REVIEW_PERIOD)`.

### 2.3 Hậu quả với uy tín (đã chốt)

Bên mở tranh chấp mà thua hoàn toàn thì bị ghi một lần "tranh chấp thua". Ghi off-chain, worker cập nhật khi escrow `RESOLVED`.

| Kết quả | Bên mở là client | Bên mở là dev |
|---|---|---|
| Phán quyết `clientBps = 0` (dev nhận hết) | Client thua | Dev thắng |
| Phán quyết `clientBps = 10000` (client nhận hết) | Client thắng | Dev thua |
| Chia một phần, `ARBITER_TIMEOUT_SPLIT`, `SETTLEMENT` | Không ghi | Không ghi |

Thỏa thuận (`SETTLEMENT`) không bị ghi vì hai bên tự đồng ý. Chia đôi do trọng tài quá hạn không phải lỗi của bên nào.

### 2.4 Lưu và hiển thị (đề xuất)

- Thêm `User.disputesLost Int @default(0)`. Worker tăng giá trị này trong cùng transaction với effect `RESOLVED`, và trừ lại khi reorg hoàn tác effect đó (`indexer/undo.ts`).
- Không trộn vào `reputationScore`, vì điểm này là trung bình đánh giá của client cho dev, còn client cũng có thể thua tranh chấp.
- Hiện số này ở hồ sơ công khai và ở danh sách ứng viên khi client chọn dev, cạnh điểm đánh giá.

## 3. Test đỏ (đã viết, đang skip)

`apps/contracts/test/BloodyRoarEscrow.test.ts`, khối `dispute opening rules (S-203a)`:

1. Client không mở được tranh chấp trước khi dev nộp bài (`NoDelivery`).
2. Dev không mở được tranh chấp trước khi nộp bài (`NoDelivery`).
3. Hai bên mở được tranh chấp trong hạn duyệt.
4. Không mở được tranh chấp khi hạn duyệt đã hết (`DeadlinePassed`), và dev vẫn gọi được `claimReviewTimeout`.
5. Nộp lại bài làm hạn mở tranh chấp dời theo.
6. Không mở được tranh chấp lần hai.

S-203b (US-50) bỏ skip, sửa `raiseDispute`, sửa helper `dispute()` trong test để nộp bài trước, cập nhật E2E tranh chấp, thêm điều kiện ở server (`availableActions.raiseDispute`) và phần uy tín ở mục 2.4.

## 4. Rủi ro

- Contract không nâng cấp được. Quy tắc chỉ có hiệu lực ở bản deploy sau. Trên Hardhat local thì deploy lại không tốn gì.
- Không có audit bên ngoài. Ghi rõ trong mô tả PR của S-203b.
