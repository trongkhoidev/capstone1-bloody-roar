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
  MESSAGE_RECEIVED: (t) => ({ title: "Tin nhắn mới", body: `Bạn có tin nhắn mới trong “${t}”.` }),
};

export function notificationTemplate(type: NotificationType, issue: { id: string; title: string }) {
  return { ...TEMPLATES[type](issue.title), link: `/issues/${issue.id}` };
}
