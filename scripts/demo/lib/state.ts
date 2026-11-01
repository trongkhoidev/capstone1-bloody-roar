import * as fs from "node:fs";
import * as path from "node:path";

export interface DemoState {
  profilesUpdated: Record<string, boolean>;
  issues: Record<string, string>; // issueKey -> issueId
  issueMetadata: Record<string, { id: string; clientRole: string; category: string; bountyAmount: string }>;
  comments: Record<string, string>; // commentKey -> commentId
  applications: Record<string, string>; // appKey -> appId
  reservations: Record<string, { id: string; status: string; issueId: string; developerRole: string }>;
  chatRooms: Record<string, { issueId: string; messagesCount: number }>;
  submissions: Record<string, string>; // submissionKey -> submissionId
  disputes: Record<string, { issueId: string; disputeId: string; status: string }>;
  reviews: Record<string, string>; // reviewKey -> reviewId
}

export const STATE_PATH = path.resolve(process.cwd(), "demo-wallets/state.json");

export function loadState(statePath: string = STATE_PATH): DemoState {
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, "utf-8");
      return JSON.parse(raw) as DemoState;
    } catch {
      // Fallback to fresh state
    }
  }
  return {
    profilesUpdated: {},
    issues: {},
    issueMetadata: {},
    comments: {},
    applications: {},
    reservations: {},
    chatRooms: {},
    submissions: {},
    disputes: {},
    reviews: {},
  };
}

export function saveState(state: DemoState, statePath: string = STATE_PATH): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}
