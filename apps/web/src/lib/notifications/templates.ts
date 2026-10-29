// apps/web/src/lib/notifications/templates.ts
// Vietnamese title and body for each NotificationType, with a deep link to the task

import type { NotificationType } from "@bloody-roar/database";

type Text = { title: string; body: string };

// Typed as a full Record, so a new NotificationType fails typecheck until it has a template.
const TEMPLATES: Record<NotificationType, (issueTitle: string) => Text> = {
  NEW_APPLICANT: (t) => ({ title: "Có ứng viên mới", body: `Có người vừa ứng tuyển vào “${t}”.` }),
  APPLICATION_ACCEPTED: (t) => ({ title: "Đơn ứng tuyển được chấp nhận", body: `Đơn của bạn cho “${t}” đã được chấp nhận.` }),
  APPLICATION_REJECTED: (t) => ({ title: "Đơn ứng tuyển chưa được chọn", body: `Đơn của bạn cho “${t}” chưa được chọn lần này.` }),
  TASK_ASSIGNED: (t) => ({ title: "Bạn được giao việc", body: `Bạn đã được giao “${t}”.` }),
  PAYMENT_RECEIVED: (t) => ({ title: "Đã nhận thanh toán", body: `Khoản thanh toán cho “${t}” đã được giải ngân.` }),
  DISPUTE_RAISED: (t) => ({ title: "Có tranh chấp mới", body: `Một tranh chấp đã được mở cho “${t}”.` }),
  DISPUTE_RESOLVED: (t) => ({ title: "Tranh chấp đã có kết quả", body: `Tranh chấp cho “${t}” đã được giải quyết.` }),
  FUNDING_REQUIRED: (t) => ({ title: "Cần nạp tiền", body: `Vui lòng nạp tiền cho “${t}”.` }),
  RESERVATION_EXPIRED: (t) => ({ title: "Đặt chỗ đã hết hạn", body: `Đặt chỗ cho “${t}” đã hết hạn.` }),
  DEPOSIT_CONFIRMED: (t) => ({ title: "Đã xác nhận tiền nạp", body: `Tiền nạp cho “${t}” đã được xác nhận.` }),
  WORK_SUBMITTED: (t) => ({ title: "Đã bàn giao công việc", body: `Công việc “${t}” đã được bàn giao.` }),
  CHANGES_REQUESTED: (t) => ({ title: "Yêu cầu chỉnh sửa", body: `Có yêu cầu chỉnh sửa cho “${t}”.` }),
  SETTLEMENT_PROPOSED: (t) => ({ title: "Đề xuất thỏa thuận", body: `Có đề xuất thỏa thuận cho “${t}”.` }),
  SETTLEMENT_REVOKED: (t) => ({ title: "Đã thu hồi đề xuất", body: `Đề xuất thỏa thuận cho “${t}” đã bị thu hồi.` }),
  EVIDENCE_SUBMITTED: (t) => ({ title: "Đã gửi bằng chứng", body: `Có bằng chứng mới cho “${t}”.` }),
  RULING_POSTED: (t) => ({ title: "Đã đưa ra phán quyết", body: `Phán quyết cho “${t}” đã được đưa ra.` }),
  RULING_CHALLENGED: (t) => ({ title: "Phán quyết bị khiếu nại", body: `Phán quyết cho “${t}” đã bị khiếu nại.` }),
  ESCROW_RESOLVED: (t) => ({ title: "Ký quỹ đã được giải quyết", body: `Ký quỹ cho “${t}” đã được giải quyết.` }),
  FUNDS_CLAIMABLE: (t) => ({ title: "Có thể nhận tiền", body: `Bạn có thể nhận khoản tiền cho “${t}”.` }),
  DEADLINE_APPROACHING: (t) => ({ title: "Sắp đến hạn", body: `Thời hạn của “${t}” sắp đến.` }),
  MESSAGE_RECEIVED: (t) => ({ title: "Tin nhắn mới", body: `Bạn có tin nhắn mới trong “${t}”.` }),
};

export function notificationTemplate(type: NotificationType, issue: { id: string; title: string }) {
  return { ...TEMPLATES[type](issue.title), link: `/issues/${issue.id}` };
}
