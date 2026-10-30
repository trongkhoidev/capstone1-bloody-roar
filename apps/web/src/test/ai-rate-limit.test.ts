import { beforeAll, describe, expect, it, vi } from "vitest";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const GENERATE = `mutation($issueId: String!) { generateTestCases(issueId: $issueId) { id } }`;
const ANALYZE = `mutation($issueId: String!) { analyzeDispute(issueId: $issueId) { id } }`;

// The limit is checked before any lookup, so an empty database is enough: a call that passes the limit ends in NOT_FOUND.
function emptyDb() {
  return {
    issue: { findUnique: vi.fn().mockResolvedValue(null) },
    dispute: { findUnique: vi.fn().mockResolvedValue(null) },
  };
}

const client = (id: string) => ({ id, role: "CLIENT", name: null, isBanned: false });
const admin = (id: string) => ({ id, role: "ADMIN", name: null, isBanned: false });

describe("AI mutation rate limit", () => {
  it("refuses the eleventh generation call in an hour for a normal user", async () => {
    const user = client("rate-client");
    const db = emptyDb();
    const codes: Array<string | undefined> = [];
    for (let call = 0; call < 11; call += 1) {
      const result = await execute(GENERATE, { user, db }, { issueId: "issue-1" });
      codes.push(result.errors?.[0]?.extensions?.code as string | undefined);
    }

    expect(codes.slice(0, 10)).toEqual(Array(10).fill("NOT_FOUND"));
    expect(codes[10]).toBe("RATE_LIMITED");
    expect(db.issue.findUnique).toHaveBeenCalledTimes(10);
  });

  it("gives an admin thirty dispute analyses an hour before refusing", async () => {
    const user = admin("rate-admin");
    const db = emptyDb();
    const codes: Array<string | undefined> = [];
    for (let call = 0; call < 31; call += 1) {
      const result = await execute(ANALYZE, { user, db }, { issueId: "issue-1" });
      codes.push(result.errors?.[0]?.extensions?.code as string | undefined);
    }

    expect(codes.slice(0, 30).every((code) => code !== "RATE_LIMITED")).toBe(true);
    expect(codes[30]).toBe("RATE_LIMITED");
  });
});
