export interface ChatIssueState {
  clientId: string;
  developerId: string | null;
  status: string;
}

export interface ChatActor {
  id: string;
  role: string;
}

const READABLE_WORK_STATES = new Set(["IN_PROGRESS", "COMPLETED", "DISPUTED"]);

export function canReadIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN") return issue.status === "DISPUTED";
  if (!issue.developerId || !READABLE_WORK_STATES.has(issue.status)) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}

export function canWriteIssueChat(issue: ChatIssueState, actor: ChatActor): boolean {
  if (actor.role === "ADMIN" || issue.status !== "IN_PROGRESS" || !issue.developerId) return false;
  return issue.clientId === actor.id || issue.developerId === actor.id;
}
