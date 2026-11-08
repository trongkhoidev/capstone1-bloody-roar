// Single source for task status wording and colour; cards, detail, filters and dashboard all read it.
export type IssueStatusKey = "OPEN" | "AWAITING_FUNDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";

export const ISSUE_STATUS: Record<IssueStatusKey, { label: string; badge: string; variant: "success" | "warning" | "danger" | "secondary" }> = {
  OPEN: { label: "Open", badge: "b-open", variant: "success" },
  AWAITING_FUNDING: { label: "Awaiting funding", badge: "b-attn", variant: "warning" },
  IN_PROGRESS: { label: "In progress", badge: "b-prog", variant: "warning" },
  COMPLETED: { label: "Completed", badge: "b-info", variant: "secondary" },
  CANCELLED: { label: "Cancelled", badge: "b-mut", variant: "secondary" },
  DISPUTED: { label: "Disputed", badge: "b-bad", variant: "danger" },
};

export const issueStatus = (status: string) =>
  ISSUE_STATUS[status as IssueStatusKey] ?? { label: status.replaceAll("_", " ").toLowerCase(), badge: "b-mut", variant: "secondary" as const };
