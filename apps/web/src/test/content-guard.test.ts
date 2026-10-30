import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { guardMessage } from "../ai/guard/service";
import { execute, loadSchema } from "./graphql-execute";

// Built at run time so no real-looking key sits in the source; matches the private-key-env rule.
const leakedKey = () => `PRIVATE_KEY=0x${randomBytes(32).toString("hex")}`;

beforeAll(async () => {
  vi.stubEnv("AI_EXTERNAL_GUARD", "");
  await loadSchema();
}, 60_000);
afterAll(() => vi.unstubAllEnvs());

const userWithRole = (role: "CLIENT" | "DEVELOPER", id = `${role.toLowerCase()}-1`) => ({ id, role, name: null, isBanned: false });
const openIssue = { id: "issue-1", clientId: "client-owner", title: "Fix the escrow release button", isDraft: false, status: "OPEN", expiresAt: null };

function fakeDb(issue: Record<string, unknown> = openIssue) {
  const tx = {
    issue: { findUnique: vi.fn().mockResolvedValue(issue) },
    application: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "application-1", status: "PENDING" }),
    },
  };
  return {
    issue: {
      findUnique: vi.fn().mockResolvedValue(issue),
      create: vi.fn().mockResolvedValue({ id: "issue-new", clientId: "client-1" }),
    },
    token: {
      findUnique: vi.fn().mockResolvedValue({ id: "token-1", symbol: "USDC", decimals: 6, isActive: true, chainId: ACTIVE_CHAIN_ID }),
    },
    issueComment: { create: vi.fn().mockResolvedValue({ id: "comment-1", body: "", createdAt: new Date() }) },
    notification: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    tx,
  };
}

describe("content guard on stored user text", () => {
  it("masks a key in the guard output that every call site relies on", async () => {
    const key = leakedKey();
    const guarded = await guardMessage(`please check ${key} thanks`);
    expect(guarded.content).toContain("[REDACTED]");
    expect(guarded.content).not.toContain(key.slice("PRIVATE_KEY=".length));
  });

  it("masks a key in a new bounty description before saving it", async () => {
    const key = leakedKey();
    const db = fakeDb();
    const result = await execute(
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
      { user: userWithRole("CLIENT"), db },
      {
        input: {
          title: "Fix the escrow release button",
          description: `Reproduce the bug on the marketplace page. ${key}`,
          category: "BUG_FIX",
          bountyAmount: "100",
          tokenId: "token-1",
        },
      },
    );

    expect(result.errors).toBeUndefined();
    const saved = db.issue.create.mock.calls[0]?.[0].data.description as string;
    expect(saved).toContain("[REDACTED]");
    expect(saved).not.toContain(key);
  });

  it("masks a key in an issue comment before saving it", async () => {
    const key = leakedKey();
    const db = fakeDb();
    const result = await execute(
      `mutation($input: CreateIssueCommentInput!) { createIssueComment(input: $input) { id } }`,
      { user: userWithRole("CLIENT"), db },
      { input: { issueId: "issue-1", body: `use this ${key} for the deploy` } },
    );

    expect(result.errors).toBeUndefined();
    const saved = db.issueComment.create.mock.calls[0]?.[0].data.body as string;
    expect(saved).toContain("[REDACTED]");
    expect(saved).not.toContain(key);
  });

  it("masks a key in a cover letter before saving the application", async () => {
    const key = leakedKey();
    const db = fakeDb();
    const result = await execute(
      `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
      { user: userWithRole("DEVELOPER"), db },
      { input: { issueId: "issue-1", message: `my wallet ${key}` } },
    );

    expect(result.errors).toBeUndefined();
    const saved = db.tx.application.create.mock.calls[0]?.[0].data.message as string;
    expect(saved).toContain("[REDACTED]");
    expect(saved).not.toContain(key);
  });
});
