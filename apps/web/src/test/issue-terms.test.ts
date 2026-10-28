import { beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const DAY_MS = 86_400_000;
const client = { id: "client-1", role: "CLIENT", name: null, isBanned: false };
const usdc = {
  id: "token-usdc",
  symbol: "USDC",
  decimals: 6,
  isActive: true,
  chainId: ACTIVE_CHAIN_ID,
};

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    clientId: client.id,
    tokenId: usdc.id,
    token: usdc,
    bountyAmount: new Prisma.Decimal("100"),
    deliveryDeadline: null,
    githubRepo: null,
    termsVersion: 1,
    status: "OPEN",
    ...overrides,
  };
}

function fakeDb(row = issueRow()) {
  return {
    token: {
      findUnique: vi.fn().mockResolvedValue(usdc),
      findFirst: vi.fn().mockResolvedValue(usdc),
      findMany: vi.fn().mockResolvedValue([]),
    },
    issue: {
      create: vi.fn().mockResolvedValue(row),
      findUnique: vi.fn().mockResolvedValue(row),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    application: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const CREATE_ISSUE = `mutation($input: CreateIssueInput!) {
  createIssue(input: $input) { id bountyAmount { raw decimals symbol formatted } bountyAmountRaw termsVersion }
}`;
const createInput = {
  title: "Fix the escrow release button",
  description: "Reproduce the bug on the marketplace page and fix the release flow.",
  category: "BUG_FIX",
  bountyAmount: "100.50",
  tokenId: usdc.id,
};

describe("createIssue bounty and deadline", () => {
  it("stores the bounty as a normalized decimal and returns it as TokenAmount", async () => {
    const db = fakeDb(issueRow({ bountyAmount: new Prisma.Decimal("100.5") }));

    const result = await execute(CREATE_ISSUE, { user: client, db }, { input: createInput });

    expect(result.errors).toBeUndefined();
    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bountyAmount: "100.5" }) }),
    );
    expect(result.data?.createIssue).toEqual({
      id: "issue-1",
      bountyAmount: { raw: "100500000", decimals: 6, symbol: "USDC", formatted: "100.5" },
      bountyAmountRaw: "100500000",
      termsVersion: 1,
    });
  });

  it("rejects more than six decimal places", async () => {
    const db = fakeDb();

    const result = await execute(
      CREATE_ISSUE,
      { user: client, db },
      { input: { ...createInput, bountyAmount: "100.1234567" } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(db.issue.create).not.toHaveBeenCalled();
  });

  it("rejects a bounty below the minimum", async () => {
    const db = fakeDb();

    const result = await execute(
      CREATE_ISSUE,
      { user: client, db },
      { input: { ...createInput, bountyAmount: "5" } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(db.issue.create).not.toHaveBeenCalled();
  });

  it("rejects a delivery deadline more than 180 days away", async () => {
    const db = fakeDb();
    const deliveryDeadline = new Date(Date.now() + 181 * DAY_MS).toISOString();

    const result = await execute(
      CREATE_ISSUE,
      { user: client, db },
      { input: { ...createInput, deliveryDeadline } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(db.issue.create).not.toHaveBeenCalled();
  });

  it("stores a delivery deadline within 180 days", async () => {
    const db = fakeDb();
    const deliveryDeadline = new Date(Date.now() + 30 * DAY_MS).toISOString();

    const result = await execute(
      CREATE_ISSUE,
      { user: client, db },
      { input: { ...createInput, deliveryDeadline } },
    );

    expect(result.errors).toBeUndefined();
    expect(db.issue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryDeadline: new Date(deliveryDeadline) }),
      }),
    );
  });
});

const UPDATE_ISSUE = `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id termsVersion } }`;

function updatedData(db: ReturnType<typeof fakeDb>) {
  return db.issue.updateMany.mock.calls[0]?.[0].data;
}

describe("updateIssue termsVersion (BE-16)", () => {
  it("bumps termsVersion when the bounty changes", async () => {
    const db = fakeDb();

    const result = await execute(
      UPDATE_ISSUE,
      { user: client, db },
      { input: { id: "issue-1", bountyAmount: "200" } },
    );

    expect(result.errors).toBeUndefined();
    expect(updatedData(db)).toEqual(
      expect.objectContaining({ bountyAmount: "200", termsVersion: { increment: 1 } }),
    );
  });

  it("bumps termsVersion when the delivery deadline changes", async () => {
    const db = fakeDb();
    const deliveryDeadline = new Date(Date.now() + 30 * DAY_MS).toISOString();

    await execute(UPDATE_ISSUE, { user: client, db }, { input: { id: "issue-1", deliveryDeadline } });

    expect(updatedData(db)).toEqual(expect.objectContaining({ termsVersion: { increment: 1 } }));
  });

  it("bumps termsVersion when the token changes", async () => {
    const db = fakeDb();
    db.token.findFirst.mockResolvedValue({ ...usdc, id: "token-dai", symbol: "DAI", decimals: 18 });

    await execute(UPDATE_ISSUE, { user: client, db }, { input: { id: "issue-1", tokenId: "token-dai" } });

    expect(updatedData(db)).toEqual(expect.objectContaining({ termsVersion: { increment: 1 } }));
  });

  it("keeps termsVersion when only the title changes", async () => {
    const db = fakeDb();

    const result = await execute(
      UPDATE_ISSUE,
      { user: client, db },
      { input: { id: "issue-1", title: "A clearer title for the bounty" } },
    );

    expect(result.errors).toBeUndefined();
    expect(updatedData(db)).not.toHaveProperty("termsVersion");
  });

  it("rejects edits while a reservation holds the issue", async () => {
    const db = fakeDb(issueRow({ status: "AWAITING_FUNDING" }));

    const result = await execute(
      UPDATE_ISSUE,
      { user: client, db },
      { input: { id: "issue-1", bountyAmount: "200" } },
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("ISSUE_NOT_EDITABLE");
    expect(db.issue.updateMany).not.toHaveBeenCalled();
  });
});

describe("issues bounty filters", () => {
  it("passes decimal bounds to the query", async () => {
    const db = fakeDb();

    const result = await execute(
      `{ issues(bountyMin: "10.5", bountyMax: "250") { totalCount } }`,
      { user: null, db },
    );

    expect(result.errors).toBeUndefined();
    expect(db.issue.findMany.mock.calls[0]?.[0].where).toEqual(
      expect.objectContaining({ bountyAmount: { gte: "10.5", lte: "250" } }),
    );
  });

  it("rejects bounds with more than six decimal places", async () => {
    const db = fakeDb();

    const result = await execute(`{ issues(bountyMin: "10.5555555") { totalCount } }`, {
      user: null,
      db,
    });

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("marketplaceStats bountyPool", () => {
  it("returns each token's pool as TokenAmount", async () => {
    const db = fakeDb();
    db.issue.count.mockResolvedValue(1);
    db.issue.groupBy.mockResolvedValue([
      { tokenId: usdc.id, _sum: { bountyAmount: new Prisma.Decimal("25.5") } },
    ]);
    db.token.findMany.mockResolvedValue([{ id: usdc.id, symbol: "USDC", decimals: 6 }]);

    const result = await execute(
      `{ marketplaceStats { openBounties bountyPool { raw formatted symbol } } }`,
      { user: null, db },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.marketplaceStats).toEqual({
      openBounties: 1,
      bountyPool: [{ raw: "25500000", formatted: "25.5", symbol: "USDC" }],
    });
  });
});
