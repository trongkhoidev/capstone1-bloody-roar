export interface ChatIssueState {
  clientId: string;
  developerId: string | null;
  status: string;
}

export interface ChatActor {
  id: string;
  role: string;
}

// Chat stays open through a dispute; after the task ends it becomes read-only history.
const READABLE_WORK_STATES = new Set(["AWAITING_FUNDING", "IN_PROGRESS", "DISPUTED", "COMPLETED", "CANCELLED"]);
const WRITABLE_WORK_STATES = new Set(["AWAITING_FUNDING", "IN_PROGRESS", "DISPUTED"]);

export function canReadIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN") return issue.status === "DISPUTED";
  if (!issue.developerId || !READABLE_WORK_STATES.has(issue.status)) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}

export function canWriteIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN" || !WRITABLE_WORK_STATES.has(issue.status) || !issue.developerId) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}
