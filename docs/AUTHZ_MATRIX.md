# Ma trận phân quyền GraphQL (mutation)

Ghi theo code ngày 27/10/2026. Mỗi ô là kết quả của guard trong resolver hoặc trong `lib/escrow/*`.
Chưa có test tự động cho từng ô. Test integration (BE-80) sẽ kiểm dần.

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
| `createIssue` | UNAUTHORIZED | CLIENT_ROLE_REQUIRED | ✅ | CLIENT_ROLE_REQUIRED | CLIENT_ROLE_REQUIRED | UNAUTHORIZED | Chỉ role `CLIENT` đăng bài. |
| `updateIssue` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | Chỉ chủ bài. |
| `cancelIssue` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài, khi OPEN hoặc IN_PROGRESS chưa ký quỹ) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | `ISSUE_NOT_CANCELLABLE` khi đã có ký quỹ. |
| `createIssueComment` | UNAUTHORIZED | ✅ (bài công khai, chưa hủy) | ✅ | ✅ | ✅ | UNAUTHORIZED | `NOT_FOUND` với bản nháp, `ISSUE_CLOSED` khi đã hủy. |
| `generateTestCases` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài, role CLIENT) | CLIENT_ROLE_REQUIRED | CLIENT_ROLE_REQUIRED | UNAUTHORIZED | Chỉ chủ bài với role CLIENT. |
| `updateTestCase` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | |
| `applyToIssue` | UNAUTHORIZED | ✅ (role DEVELOPER, không phải chủ bài) | DEVELOPER_ROLE_REQUIRED | ✅ | DEVELOPER_ROLE_REQUIRED | UNAUTHORIZED | Chỉ role `DEVELOPER` ứng tuyển. |
| `withdrawApplication` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | ✅ (đơn của mình) | FORBIDDEN | UNAUTHORIZED | |
| `rejectApplication` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | |
| `assignDeveloper` | UNAUTHORIZED | FORBIDDEN | ✅ (chủ bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | |
| `submitWork` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | ✅ (developer được giao) | FORBIDDEN | UNAUTHORIZED | |
| `reviewSubmission` | UNAUTHORIZED | FORBIDDEN | ✅ (client của bài) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | Chỉ client được duyệt bài nộp. |

## Tranh chấp

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raiseDispute` | UNAUTHORIZED | FORBIDDEN | ✅ (bên tham gia) | ✅ (bên tham gia) | FORBIDDEN | UNAUTHORIZED | Admin không tự mở tranh chấp. |
| `challengeDisputeResolution` | UNAUTHORIZED | FORBIDDEN | ✅ (bên tham gia) | ✅ (bên tham gia) | FORBIDDEN | UNAUTHORIZED | |
| `analyzeDispute` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | |
| `proposeDisputeResolution` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | Admin soạn đề xuất. |

## Quản trị

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `banUser` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | Admin không khóa chính mình hay admin khác (`FORBIDDEN`). |
| `unbanUser` | UNAUTHORIZED | FORBIDDEN | FORBIDDEN | FORBIDDEN | ✅ | UNAUTHORIZED | |

## Escrow

Quy tắc theo `lib/escrow/access.ts` và `lib/escrow/confirmation.ts`. Phần này thuộc A4 và A2.

| Mutation | Khách | Người ngoài | Client | Developer | Admin | Bị khóa | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `depositToEscrow` | UNAUTHORIZED | FORBIDDEN | ✅ (client của escrow) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | `DEPOSIT` chỉ client. |
| `releaseFunds` | UNAUTHORIZED | FORBIDDEN | ✅ (client của escrow) | FORBIDDEN | FORBIDDEN | UNAUTHORIZED | `RELEASE` chỉ client. |
| `confirmEscrowTransaction` | UNAUTHORIZED | FORBIDDEN | theo action | theo action | chỉ `INITIAL_RULING` và `FINAL_RULING` | UNAUTHORIZED | `WORK` chỉ developer. Settlement, dispute, evidence, challenge chỉ bên tham gia. |
| `cancelEscrow` | UNAUTHORIZED | FORBIDDEN | ✅ | ✅ | ⚠️ đang được phép | UNAUTHORIZED | Xem ghi chú 2. |

## Ghi chú

1. **Người bị khóa.** `createIssueComment` còn kiểm `user.isBanned`, nhưng nhánh đó không bao giờ chạy vì `verifyJWT` đã loại người bị khóa. Giữ lại để không đổi phạm vi.
2. **`cancelEscrow` cho admin (cần quyết định, owner A4).** Cổng trong `confirmEscrowAction` cho admin đi qua mọi action không nằm trong danh sách chỉ bên tham gia, và `CANCEL` không nằm trong danh sách đó. `assertEscrowAccess` cũng không được gọi cho `CANCEL` trong đường confirm. `lib/escrow/access.ts` ghi `CANCEL` chỉ dành cho bên tham gia. Cần quyết định: thêm `CANCEL` vào danh sách bên tham gia, hoặc ghi rõ admin được hủy.
3. **Mutation mới.** Mutation của A4 và A5 sẽ thêm vào cuối bảng này khi merge.
