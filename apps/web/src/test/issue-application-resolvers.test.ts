import { beforeAll, describe, expect, it, vi } from "vitest";
import { createYoga } from "graphql-yoga";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import type { schema as AppSchema } from "../graphql/schema";

type Role = "CLIENT" | "DEVELOPER" | "ADMIN";

function userWithRole(role: Role, id = `${role.toLowerCase()}-1`) {
  return { id, role, name: null, isBanned: false };
}

function fakeDb() {
  return {
    issue: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: "issue-new", clientId: "developer-1" }),
    },
    token: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "token-1", isActive: true, chainId: ACTIVE_CHAIN_ID }),
    },
    notification: { create: vi.fn().mockResolvedValue({}) },
  };
}

type GraphQLResult = {
  data?: Record<string, unknown> | null;
  errors?: Array<{ extensions?: { code?: string } }>;
};

let schema: typeof AppSchema;

beforeAll(async () => {
  ({ schema } = await import("../graphql/schema"));
}, 60_000);

// Chạy qua Yoga như route thật. Tắt mask để giữ extensions.code: vitest nạp hai bản graphql,
// nên Yoga không nhận ra GraphQLError từ gqlError và che lỗi thành INTERNAL_SERVER_ERROR.
async function execute(
  query: string,
  contextValue: { user: unknown; db: unknown },
  variables?: Record<string, unknown>,
): Promise<GraphQLResult> {
  const yoga = createYoga({
    schema,
    context: () => contextValue,
    logging: false,
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<GraphQLResult>;
}

describe("issues DEADLINE sort", () => {
  it.each([
    ["ASC", "asc"],
    ["DESC", "desc"],
  ] as const)("applies sortOrder %s to expiresAt", async (sortOrder, sort) => {
    const db = fakeDb();

    const result = await execute(
      "query($sortOrder: SortOrder) { issues(sortBy: DEADLINE, sortOrder: $sortOrder) { totalCount } }",
      { user: null, db },
      { sortOrder },
    );

    expect(result.errors).toBeUndefined();
    expect(db.issue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ expiresAt: { sort, nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }],
      }),
    );
  });
});

const CREATE_ISSUE = `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id clientId } }`;
const createInput = {
  title: "Fix the escrow release button",
  description: "Reproduce the bug on the marketplace page and fix the release flow.",
  category: "BUG_FIX",
  bountyAmount: 100,
  tokenId: "token-1",
};

describe("createIssue roles", () => {
  it.each(["CLIENT", "DEVELOPER"] as const)("lets a %s post a bounty", async (role) => {
    const user = userWithRole(role);
    const db = fakeDb();

    const result = await execute(CREATE_ISSUE, { user, db }, { input: createInput });

    expect(result.errors).toBeUndefined();
    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: user.id }) }),
    );
  });

  it("blocks an admin from posting a bounty", async () => {
    const db = fakeDb();

    const result = await execute(
      CREATE_ISSUE,
      { user: userWithRole("ADMIN"), db },
      { input: createInput },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("ADMIN_NOT_ALLOWED");
    expect(db.issue.create).not.toHaveBeenCalled();
  });
});

const APPLY = `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`;

function applyDb(issue: Record<string, unknown>) {
  const tx = {
    issue: { findUnique: vi.fn().mockResolvedValue(issue) },
    application: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "application-1", status: "PENDING" }),
    },
  };
  return Object.assign(fakeDb(), {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    tx,
  });
}

const openIssue = {
  id: "issue-1",
  clientId: "client-owner",
  title: "Fix the escrow release button",
  isDraft: false,
  status: "OPEN",
  expiresAt: null,
};

describe("applyToIssue roles", () => {
  it.each(["CLIENT", "DEVELOPER"] as const)(
    "lets a %s apply to someone else's bounty",
    async (role) => {
      const db = applyDb(openIssue);

      const result = await execute(
        APPLY,
        { user: userWithRole(role), db },
        { input: { issueId: "issue-1", message: "I can take this." } },
      );

      expect(result.errors).toBeUndefined();
      expect(db.tx.application.create).toHaveBeenCalledTimes(1);
    },
  );

  it("blocks an admin from applying", async () => {
    const db = applyDb(openIssue);

    const result = await execute(
      APPLY,
      { user: userWithRole("ADMIN"), db },
      { input: { issueId: "issue-1" } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("ADMIN_NOT_ALLOWED");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks a user from applying to their own bounty", async () => {
    const db = applyDb({ ...openIssue, clientId: "client-1" });

    const result = await execute(
      APPLY,
      { user: userWithRole("CLIENT", "client-1"), db },
      { input: { issueId: "issue-1" } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("SELF_APPLICATION");
    expect(db.tx.application.create).not.toHaveBeenCalled();
  });
});
