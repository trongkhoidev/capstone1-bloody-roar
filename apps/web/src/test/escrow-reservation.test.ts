import { createHash } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { computeTermsHash, keccakUtf8 } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const TOKEN_ADDRESS = "0x2222222222222222222222222222222222222222";
const client = { id: "client-1", role: "CLIENT", name: null, isBanned: false };
const developer = { id: "dev-1", role: "DEVELOPER", name: null, isBanned: false };
const description = "Reproduce the bug on the marketplace page and fix the release flow.";

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    title: "Fix the escrow release button",
    description,
    category: "BUG_FIX",
    githubRepo: null,
    termsVersion: 1,
    bountyAmount: new Prisma.Decimal("100"),
    status: "OPEN",
    isDraft: false,
    clientId: client.id,
    token: { address: TOKEN_ADDRESS, decimals: 6, symbol: "USDC" },
    ...overrides,
  };
}

const criteria = [
  {
    id: "tc-1",
    given: "the client approves the work",
    when: "the developer releases funds",
    then: "the developer receives the payout",
    isApproved: true,
  },
];

// Mô phỏng bản ghi reservation sau khi insert, có đủ trường mà resolver đọc
function reservationRow(data: Record<string, unknown>) {
  return {
    id: "reservation-1",
    ...data,
    status: "AWAITING_FUNDING",
    amountRaw: new Prisma.Decimal(String(data.amountRaw)),
    createdAt: new Date(),
  };
}

function fakeDb(
  options: { issue?: Record<string, unknown>; criteria?: typeof criteria } = {},
) {
  const tx = {
    issue: {
      findUnique: vi.fn().mockResolvedValue(issueRow(options.issue)),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    application: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "app-1", issueId: "issue-1", developerId: developer.id }),
    },
    testCase: { findMany: vi.fn().mockResolvedValue(options.criteria ?? criteria) },
    fundingReservation: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => reservationRow(data)),
    },
  };
  return {
    tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    notification: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    fundingReservation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const SELECT = `mutation($issueId: ID!, $applicationId: ID!, $deliveryDeadline: String!) {
  selectDeveloper(issueId: $issueId, applicationId: $applicationId, deliveryDeadline: $deliveryDeadline) {
    id status escrowKey escrowIdHash amountRaw termsHash termsVersion
  }
}`;

function inDays(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

function inHours(hours: number) {
  return new Date(Date.now() + hours * HOUR_MS).toISOString();
}

function selectVariables(deliveryDeadline = inDays(30)) {
  return { issueId: "issue-1", applicationId: "app-1", deliveryDeadline };
}

beforeEach(() => {
  vi.stubEnv("ESCROW_CONTRACT_ADDRESS", CONTRACT);
  vi.stubEnv("ESCROW_CHAIN_ID", "84532");
});

describe("selectDeveloper (BE-23, BE-41f)", () => {
  it("creates an AWAITING_FUNDING reservation with the escrow key, hash and terms", async () => {
    const db = fakeDb();
    const deliveryDeadline = inDays(30);

    const result = await execute(SELECT, { user: client, db }, selectVariables(deliveryDeadline));

    expect(result.errors).toBeUndefined();
    expect(result.data?.selectDeveloper).toEqual({
      id: "reservation-1",
      status: "AWAITING_FUNDING",
      escrowKey: "br_issue-1_1",
      escrowIdHash: keccakUtf8("br_issue-1_1"),
      amountRaw: "100000000",
      termsHash: computeTermsHash({
        issueId: "issue-1",
        termsVersion: 1,
        title: "Fix the escrow release button",
        descriptionSha256: createHash("sha256").update(description, "utf8").digest("hex"),
        category: "BUG_FIX",
        acceptanceCriteria: [
          {
            id: "tc-1",
            text: "Given the client approves the work, when the developer releases funds, then the developer receives the payout",
            approved: true,
          },
        ],
        token: TOKEN_ADDRESS,
        amountRaw: "100000000",
        deliveryDeadline: String(Math.floor(new Date(deliveryDeadline).getTime() / 1000)),
        githubRepo: "",
      }),
      termsVersion: 1,
    });
    expect(db.tx.fundingReservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        issueId: "issue-1",
        applicationId: "app-1",
        clientId: client.id,
        developerId: developer.id,
        chainId: 84532,
        contractAddress: CONTRACT,
        tokenAddress: TOKEN_ADDRESS,
        expiresAt: expect.any(Date),
      }),
    });
    const created = db.tx.fundingReservation.create.mock.calls[0]?.[0].data as { expiresAt: Date };
    expect(Math.abs(created.expiresAt.getTime() - (Date.now() + 24 * HOUR_MS))).toBeLessThan(60_000);
  });

  it("moves the issue to AWAITING_FUNDING and notifies the developer once", async () => {
    const db = fakeDb();

    await execute(SELECT, { user: client, db }, selectVariables());

    expect(db.tx.issue.updateMany).toHaveBeenCalledWith({
      where: { id: "issue-1", status: "OPEN" },
      data: { status: "AWAITING_FUNDING" },
    });
    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: developer.id,
        type: "FUNDING_REQUIRED",
        dedupeKey: "reservation:reservation-1:FUNDING_REQUIRED",
      }),
    });
  });

  it("rejects a delivery deadline less than 72 hours away", async () => {
    const db = fakeDb();

    const result = await execute(SELECT, { user: client, db }, selectVariables(inHours(48)));

    expect(result.errors?.[0]?.extensions?.code).toBe("DELIVERY_DEADLINE_INVALID");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("rejects a delivery deadline more than 180 days away", async () => {
    const db = fakeDb();

    const result = await execute(SELECT, { user: client, db }, selectVariables(inDays(181)));

    expect(result.errors?.[0]?.extensions?.code).toBe("DELIVERY_DEADLINE_INVALID");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("rejects a bounty with no approved criterion (QĐ-20)", async () => {
    const db = fakeDb({ criteria: criteria.map((criterion) => ({ ...criterion, isApproved: false })) });

    const result = await execute(SELECT, { user: client, db }, selectVariables());

    expect(result.errors?.[0]?.extensions?.code).toBe("NO_APPROVED_CRITERIA");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("lets only the client select a developer", async () => {
    const db = fakeDb();

    const result = await execute(SELECT, { user: developer, db }, selectVariables());

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("rejects an application that is not pending on this issue", async () => {
    const db = fakeDb();
    db.tx.application.findFirst.mockResolvedValue(null);

    const result = await execute(SELECT, { user: client, db }, selectVariables());

    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("rejects a bounty that is no longer open", async () => {
    const db = fakeDb({ issue: { status: "AWAITING_FUNDING" } });

    const result = await execute(SELECT, { user: client, db }, selectVariables());

    expect(result.errors?.[0]?.extensions?.code).toBe("ISSUE_NOT_OPEN");
    expect(db.tx.fundingReservation.create).not.toHaveBeenCalled();
  });

  it("maps a unique violation (second active reservation) to ISSUE_ALREADY_RESERVED", async () => {
    const db = fakeDb();
    db.tx.fundingReservation.create.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const result = await execute(SELECT, { user: client, db }, selectVariables());

    expect(result.errors?.[0]?.extensions?.code).toBe("ISSUE_ALREADY_RESERVED");
  });
});

const CANCEL = `mutation($reservationId: ID!) { cancelReservation(reservationId: $reservationId) { id status } }`;

function cancelDb(status = "AWAITING_FUNDING", count = 1) {
  const tx = {
    fundingReservation: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "reservation-1",
        status: "CANCELLED",
        issueId: "issue-1",
      }),
    },
    issue: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return {
    tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    fundingReservation: {
      findUnique: vi.fn().mockResolvedValue({
        id: "reservation-1",
        issueId: "issue-1",
        clientId: client.id,
        developerId: developer.id,
        status,
      }),
    },
  };
}

describe("cancelReservation (BE-38)", () => {
  it("cancels the reservation and returns the issue to OPEN", async () => {
    const db = cancelDb();

    const result = await execute(CANCEL, { user: client, db }, { reservationId: "reservation-1" });

    expect(result.errors).toBeUndefined();
    expect(result.data?.cancelReservation).toEqual({ id: "reservation-1", status: "CANCELLED" });
    expect(db.tx.fundingReservation.updateMany).toHaveBeenCalledWith({
      where: { id: "reservation-1", status: "AWAITING_FUNDING" },
      data: { status: "CANCELLED" },
    });
    expect(db.tx.issue.updateMany).toHaveBeenCalledWith({
      where: { id: "issue-1", status: "AWAITING_FUNDING" },
      data: { status: "OPEN" },
    });
  });

  it("lets only the client cancel", async () => {
    const db = cancelDb();

    const result = await execute(CANCEL, { user: developer, db }, { reservationId: "reservation-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses once the reservation is funded", async () => {
    const db = cancelDb("FUNDED", 0);

    const result = await execute(CANCEL, { user: client, db }, { reservationId: "reservation-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_CANCELLABLE");
    expect(db.tx.issue.updateMany).not.toHaveBeenCalled();
  });
});

describe("reservation query (BE-31)", () => {
  it("returns only reservations where the caller is client or developer", async () => {
    const db = fakeDb();
    db.fundingReservation.findFirst.mockResolvedValue(null);

    const result = await execute(
      `{ reservation(issueId: "issue-1") { id } }`,
      { user: developer, db },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data?.reservation).toBeNull();
    expect(db.fundingReservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ clientId: developer.id }, { developerId: developer.id }],
        }),
      }),
    );
  });
});
