# Ma trận phân quyền GraphQL (mutation)

Ghi theo code ngày 27/10/2026. Mỗi ô là kết quả của guard trong resolver hoặc trong `lib/escrow/*`.
Các ô của khách và người ngoài được kiểm bởi `tests/e2e/e28-authz.test.ts`. Ô không ghi là chưa kiểm.

## Chú thích

- **Khách**: không có token.
- **Người ngoài**: đã đăng nhập nhưng không phải chủ hoặc bên tham gia của tài nguyên. Với mutation không gắn tài nguyên, cột này theo role.
- **Client / Developer**: chủ bài (client) hoặc developer được giao / bên tham gia của tài nguyên.
- **Admin**: role `ADMIN`.
- **Bị khóa**: `verifyJWT` trả `null` khi `isBanned` (`lib/auth.ts`), nên mọi mutation cần đăng nhập đều trả `UNAUTHORIZED`.
- ✅ được phép. Các ô còn lại ghi mã lỗi, hoặc `FORBIDDEN` khi không thuộc quyền.

## Hồ sơ và thông báo

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `unlinkGithub` | UNAUTHORIZED | ✅ (chỉ tài khoản mình) | ✅ (mình) | ✅ (mình) | ✅ (mình) | UNAUTHORIZED | Xóa liên kết GitHub của chính người gọi. |
| `updateProfile` | UNAUTHORIZED | ✅ (mình) | ✅ (mình) | ✅ (mình) | FORBIDDEN khi gửi `role` | UNAUTHORIZED | Admin không đổi được role (`user.module.ts`). |
| `markNotificationRead` | UNAUTHORIZED | ✅ (thông báo của mình) | ✅ | ✅ | ✅ | UNAUTHORIZED | `NOT_FOUND` nếu thông báo không thuộc người gọi. |
| `markAllNotificationsRead` | UNAUTHORIZED | ✅ (của mình) | ✅ | ✅ | ✅ | UNAUTHORIZED | Chỉ cập nhật thông báo của người gọi. |

## Bài toán, ứng tuyển, bài nộp

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `createIssue` | UNAUTHORIZED | ✅ (QĐ-21: mọi tài khoản trừ ADMIN) | ✅ | ✅ | ADMIN_NOT_ALLOWED | UNAUTHORIZED | Bỏ chặn theo role Client/Developer (QĐ-21, BE-09). Admin không đăng bài. |
| `updateIssue` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | Chỉ chủ bài. |
| `cancelIssue` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài, khi OPEN hoặc IN_PROGRESS chưa ký quỹ) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | `ISSUE_NOT_CANCELLABLE` khi đã có ký quỹ. |
| `createIssueComment` | UNAUTHORIZED | ✅ (bài công khai, chưa hủy) | ✅ | ✅ | ✅ | UNAUTHORIZED | `NOT_FOUND` với bản nháp, `ISSUE_CLOSED` khi đã hủy. |
| `generateTestCases` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài, role CLIENT) | CLIENT_ROLE_REQUIRED | CLIENT_ROLE_REQUIRED | UNAUTHORIZED | Chỉ chủ bài với role CLIENT. |
| `updateTestCase` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | |
| `applyToIssue` | UNAUTHORIZED | ✅ (không phải chủ bài, QĐ-21) | SELF_APPLICATION | ✅ | ADMIN_NOT_ALLOWED | UNAUTHORIZED | Bỏ chặn theo role (QĐ-21). Chủ bài không ứng tuyển bài của mình. |
| `withdrawApplication` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | ✅ (đơn của mình) | FORBIDDEN | UNAUTHORIZED | |
| `rejectApplication` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | |
| `selectDeveloper` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | — | — | UNAUTHORIZED | Thay `assignDeveloper` (BE-23). Các ô còn lại chưa kiểm. |
| `createSubmissionDraft` | UNAUTHORIZED | FORBIDDEN / NOT_FOUND | — | — | — | UNAUTHORIZED | Bản nháp bài nộp. Các ô còn lại chưa kiểm. |
| `assignDeveloper` | đã gỡ (thay bằng `selectDeveloper`, BE-23) | | | | | | | |
| `submitWork` | đã gỡ (thay bằng `prepareSubmitWork`) | | | | | | | |
| `reviewSubmission` | đã gỡ (thay bằng `requestChanges`) | | | | | | | |

## Tranh chấp

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raiseDispute` | đã gỡ (thay bằng `prepareRaiseDispute`) | | | | | | | |
| `challengeDisputeResolution` | đã gỡ (thay bằng `prepareChallengeRuling`) | | | | | | | |
| `analyzeDispute` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | |
| `proposeDisputeResolution` | đã gỡ (phán quyết qua `draftRuling`, P1-16d) | | | | | | | |

## Quản trị

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `banUser` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | Admin không khóa chính mình hay admin khác (`FORBIDDEN`). |
| `unbanUser` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | |

## Escrow

Quy tắc theo `lib/escrow/access.ts` và `lib/escrow/confirmation.ts`. Phần này thuộc A4 và A2.

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `depositToEscrow` | đã gỡ (nạp qua `prepareEscrowDeposit`) | | | | | | | |
| `releaseFunds` | đã gỡ (thay bằng `prepareReleaseFunds`) | | | | | | | |
| `prepareReleaseFunds` | UNAUTHORIZED | NOT_FOUND | — | — | — | UNAUTHORIZED | Thay `releaseFunds`. Chưa có escrow thì `NOT_FOUND`. Các ô còn lại chưa kiểm. |
| `confirmEscrowTransaction` | đã gỡ (tách thành các mutation `prepare*`) | | | | | | | |
| `cancelEscrow` | đã gỡ khỏi schema | | | | | | | |

## Phase D–F (mới)

Kiểm bằng `tests/e2e/e28-authz.test.ts`: khách và người ngoài theo mã trong bảng. Dòng "✅ (bất kỳ người đăng nhập)" chỉ kiểm không bị `FORBIDDEN` hay `UNAUTHORIZED`. Ô không ghi là chưa kiểm.

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `prepareRaiseDispute` | UNAUTHORIZED | FORBIDDEN / NOT_FOUND | ✅ (bên tham gia) | ✅ (bên tham gia) | FORBIDDEN | UNAUTHORIZED | Bằng chứng qua `createEvidenceManifest`. |
| `prepareSubmitCounterpartyEvidence` | UNAUTHORIZED | NOT_FOUND | FORBIDDEN | ✅ (bên còn lại) | FORBIDDEN | UNAUTHORIZED | Trong 72 giờ. Chưa có escrow thì `NOT_FOUND`; `FORBIDDEN` khi đã có escrow (chưa kiểm ở trạng thái này). |
| `prepareChallengeRuling` | UNAUTHORIZED | NOT_FOUND | ✅ (khi bên đó bị phán thua) | ✅ (khi bên đó bị phán thua) | FORBIDDEN | UNAUTHORIZED | `INVALID_PHASE` sau lần kháng cáo đầu. Chưa có escrow thì `NOT_FOUND`; `FORBIDDEN` khi đã có phán quyết (chưa kiểm ở trạng thái này). |
| `prepareFinalizeRuling` | UNAUTHORIZED | ✅ (bất kỳ người đăng nhập) | ✅ | ✅ | ✅ | UNAUTHORIZED | Sau hạn kháng cáo. |
| `prepareFinalizeArbiterTimeoutSplit` | UNAUTHORIZED | ✅ (bất kỳ người đăng nhập) | ✅ | ✅ | ✅ | UNAUTHORIZED | `DEADLINE_NOT_REACHED` trước 30 ngày. |
| `prepareClaimMissedDeliveryRefund` | UNAUTHORIZED | ✅ (sau deadline) | ✅ | ✅ | ✅ | UNAUTHORIZED | Không liên quan quyền bên tham gia. |
| `prepareClaimReviewTimeout` | UNAUTHORIZED | ✅ (sau cửa sổ review) | ✅ | ✅ | ✅ | UNAUTHORIZED | `REVIEW_WINDOW_NOT_REACHED` trước mốc. |
| `prepareClaim` | UNAUTHORIZED | FORBIDDEN (ví khác) / NOTHING_TO_CLAIM | ✅ (ví mình) | ✅ (ví mình) | ✅ (ví mình) | UNAUTHORIZED | Chỉ rút về ví của người gọi. |
| `prepareProposeSettlement` | UNAUTHORIZED | NOT_FOUND | ✅ | ✅ | FORBIDDEN | UNAUTHORIZED | `SETTLEMENT_PENDING` khi đã có đề xuất. Chưa có escrow thì `NOT_FOUND`. |
| `prepareAcceptSettlement` | UNAUTHORIZED | NOT_FOUND | ✅ (không phải người đề xuất) | ✅ (không phải người đề xuất) | FORBIDDEN | UNAUTHORIZED | Người đề xuất bị `FORBIDDEN`. Chưa có escrow thì `NOT_FOUND`. |
| `prepareRevokeSettlement` | UNAUTHORIZED | NOT_FOUND | ✅ (người đề xuất) | ✅ (người đề xuất) | FORBIDDEN | UNAUTHORIZED | `NO_PENDING_SETTLEMENT` khi không có đề xuất. Chưa có escrow thì `NOT_FOUND`. |
| `draftRuling` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | Phán quyết nháp cho arbiter. |
| `createEvidenceManifest` | UNAUTHORIZED | FORBIDDEN / NOT_FOUND | ✅ (bên tham gia) | ✅ (bên tham gia) | FORBIDDEN | UNAUTHORIZED | Tệp phải thuộc người gửi. |
| `submitReview` | UNAUTHORIZED | FORBIDDEN / INVALID_STATE | ✅ (client, sau COMPLETED) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | Mỗi issue một lần (`CONFLICT`). |
| `adminHideIssue` / `adminUnhideIssue` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | Ghi `AdminLog`. |
| `revokeSession` | UNAUTHORIZED | NOT_FOUND (phiên không thuộc mình) | ✅ (phiên mình) | ✅ (phiên mình) | ✅ (phiên mình) | UNAUTHORIZED | |
| `revokeOtherSessions` | UNAUTHORIZED | ✅ (phiên của mình) | ✅ | ✅ | ✅ | UNAUTHORIZED | Trả số phiên đã thu hồi. |
| `markAllNotificationsRead` | UNAUTHORIZED | ✅ (của mình) | ✅ | ✅ | ✅ | UNAUTHORIZED | |

## Ghi chú

1. **Người bị khóa.** `createIssueComment` còn kiểm `user.isBanned`, nhưng nhánh đó không bao giờ chạy vì `verifyJWT` đã loại người bị khóa. Giữ lại để không đổi phạm vi.
2. **`cancelEscrow` cho admin (cần quyết định, owner A4).** Cổng trong `confirmEscrowAction` cho admin đi qua mọi action không nằm trong danh sách chỉ bên tham gia, và `CANCEL` không nằm trong danh sách đó. `assertEscrowAccess` cũng không được gọi cho `CANCEL` trong đường confirm. `lib/escrow/access.ts` ghi `CANCEL` chỉ dành cho bên tham gia. Cần quyết định: thêm `CANCEL` vào danh sách bên tham gia, hoặc ghi rõ admin được hủy. **Cập nhật:** mutation `cancelEscrow` đã gỡ khỏi schema (e28 kiểm vắng mặt), nên quyết định này hiện không áp dụng; giữ để tham chiếu nếu mutation được thêm lại.
3. **Mutation mới.** Mutation của A4 và A5 sẽ thêm vào cuối bảng này khi merge.
