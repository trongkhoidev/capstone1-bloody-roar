import * as fs from "node:fs";
import * as path from "node:path";

export interface DemoState {
  profilesUpdated: Record<string, boolean>;
  issues: Record<string, string>; // issueKey -> issueId
  issueMetadata: Record<string, { id: string; clientRole: string; category: string; bountyAmount: string }>;
  comments: Record<string, string>; // commentKey -> commentId
  applications: Record<string, string>; // appKey -> appId
  criteria: Record<string, number>; // issueKey -> test cases already created and approved
  reservations: Record<string, { id: string; status: string; issueId: string; developerRole: string }>;
  chatRooms: Record<string, { issueId: string; messagesCount: number }>;
  submissions: Record<string, string>; // submissionKey -> submissionId
  disputes: Record<string, { issueId: string; disputeId: string; status: string }>;
  reviews: Record<string, string>; // reviewKey -> reviewId
  deploymentTx?: string; // escrow deployment tx this state was built against
}

export const STATE_PATH = path.resolve(process.cwd(), "demo-wallets/state.json");
export const STATE_HARDHAT_PATH = path.resolve(process.cwd(), "demo-wallets/state-hardhat.json");

export function getDefaultStatePath(): string {
  return process.env.DEMO_ACCOUNTS === "hardhat" ? STATE_HARDHAT_PATH : STATE_PATH;
}

export function loadState(statePath: string = getDefaultStatePath()): DemoState {
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, "utf-8");
      const parsed = JSON.parse(raw) as DemoState;
      // State files written before `criteria` existed: treat every saved issue as complete so a re-run adds no duplicates.
      parsed.criteria ??= Object.fromEntries(Object.keys(parsed.issues).map((key) => [key, Number.MAX_SAFE_INTEGER]));
      return parsed;
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
    criteria: {},
    reservations: {},
    chatRooms: {},
    submissions: {},
    disputes: {},
    reviews: {},
  };
}

export function saveState(state: DemoState, statePath: string = getDefaultStatePath()): void {
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// A reset Hardhat chain deploys the escrow in a new tx. Saved reservations/submissions then point at escrows
// that no longer exist, and re-running waves cannot repair them (the database still holds them as funded).
export function assertSameDeployment(state: DemoState, deploymentTx: string): void {
  if (state.deploymentTx && state.deploymentTx !== deploymentTx) {
    throw new Error(
      `Demo state was built against deployment ${state.deploymentTx}, but the chain now has ${deploymentTx}. ` +
        "After a Hardhat reset use a fresh database, delete the state file and run every wave (W1-W9).",
    );
  }
  state.deploymentTx = deploymentTx;
}
