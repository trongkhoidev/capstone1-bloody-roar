import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const CLIENT_WALLET = "0x2222222222222222222222222222222222222222";
const DEVELOPER_WALLET = "0x3333333333333333333333333333333333333333";
const DELIVERY_HASH = `0x${"ab".repeat(32)}`;
const client = {
  id: "client-1",
  role: "CLIENT",
  name: null,
  isBanned: false,
  walletAddress: CLIENT_WALLET,
};
const developer = {
  id: "dev-1",
  role: "DEVELOPER",
  name: null,
  isBanned: false,
  walletAddress: DEVELOPER_WALLET,
};

// Projection sau khi deposit đã được fold. deliveryDeadline và reviewDeadline theo unix của contract.
function projectionRow(overrides: Record<string, unknown> = {}) {
  const deliveryDeadline = new Date(Date.now() + 10 * DAY_MS);
  return {
    issueId: "issue-1",
    escrowKey: "br_issue-1_1",
    escrowIdHash: `0x${"22".repeat(32)}`,
    client: CLIENT_WALLET,
    developer: DEVELOPER_WALLET,
    phase: "FUNDED",
    deliveryHash: null,
    deliveryDeadline,
    reviewDeadline: new Date(deliveryDeadline.getTime() + 7 * DAY_MS),
    ...overrides,
  };
}

function fakeDb(projection: Record<string, unknown> | null = projectionRow()) {
  return {
    escrowProjection: { findUnique: vi.fn().mockResolvedValue(projection) },
    transactionIntent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "intent-1",
        ...data,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })),
    },
    claimableBalance: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const PREPARE = (name: string) => `mutation($issueId: ID!) {
  ${name}(issueId: $issueId) { intentId method contractAddress data value args { name value } }
}`;

beforeEach(() => {
  vi.stubEnv("ESCROW_CONTRACT_ADDRESS", CONTRACT);
  vi.stubEnv("ESCROW_CHAIN_ID", "84532");
});

describe("prepareReleaseFunds (BE-42)", () => {
  it("returns releaseFunds calldata bound to the escrow key", async () => {
    const db = fakeDb(projectionRow({ deliveryHash: DELIVERY_HASH }));

    const result = await execute(PREPARE("prepareReleaseFunds"), { user: client, db }, { issueId: "issue-1" });

    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareReleaseFunds).toEqual({
      intentId: "intent-1",
      method: "releaseFunds",
      contractAddress: CONTRACT,
      data: encodeEscrowCall("releaseFunds", { escrowId: "br_issue-1_1" }),
      value: "0",
      args: [{ name: "escrowId", value: "br_issue-1_1" }],
    });
    expect(db.transactionIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ issueId: "issue-1", method: "releaseFunds", status: "AWAITING_SIGNATURE" }),
    });
  });

  it("refuses when the caller is not the client", async () => {
    const result = await execute(PREPARE("prepareReleaseFunds"), { user: developer, db: fakeDb() }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("refuses without a delivery on chain", async () => {
    const result = await execute(PREPARE("prepareReleaseFunds"), { user: client, db: fakeDb() }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("NO_DELIVERY");
  });

  it("refuses when the escrow is not FUNDED", async () => {
    const db = fakeDb(projectionRow({ phase: "DISPUTED", deliveryHash: DELIVERY_HASH }));

    const result = await execute(PREPARE("prepareReleaseFunds"), { user: client, db }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("INVALID_PHASE");
  });

  it("refuses an issue without an escrow", async () => {
    const result = await execute(PREPARE("prepareReleaseFunds"), { user: client, db: fakeDb(null) }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});

describe("prepareClaimMissedDeliveryRefund (BE-45)", () => {
  it("prepares the refund after the delivery deadline with no delivery", async () => {
    const db = fakeDb(projectionRow({ deliveryDeadline: new Date(Date.now() - HOUR_MS) }));

    const result = await execute(PREPARE("prepareClaimMissedDeliveryRefund"), { user: client, db }, { issueId: "issue-1" });

    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareClaimMissedDeliveryRefund).toMatchObject({
      method: "claimMissedDeliveryRefund",
      data: encodeEscrowCall("claimMissedDeliveryRefund", { escrowId: "br_issue-1_1" }),
    });
  });

  it("refuses before the delivery deadline", async () => {
    const result = await execute(PREPARE("prepareClaimMissedDeliveryRefund"), { user: client, db: fakeDb() }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("DEADLINE_NOT_REACHED");
  });

  it("refuses once a delivery exists", async () => {
    const db = fakeDb(
      projectionRow({ deliveryDeadline: new Date(Date.now() - HOUR_MS), deliveryHash: DELIVERY_HASH }),
    );

    const result = await execute(PREPARE("prepareClaimMissedDeliveryRefund"), { user: client, db }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("DELIVERY_EXISTS");
  });

  it("lets only the client take the refund", async () => {
    const db = fakeDb(projectionRow({ deliveryDeadline: new Date(Date.now() - HOUR_MS) }));

    const result = await execute(PREPARE("prepareClaimMissedDeliveryRefund"), { user: developer, db }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});

describe("prepareClaimReviewTimeout (BE-46)", () => {
  it("prepares the developer's claim after the review window", async () => {
    const db = fakeDb(
      projectionRow({
        deliveryHash: DELIVERY_HASH,
        deliveryDeadline: new Date(Date.now() - 8 * DAY_MS),
        reviewDeadline: new Date(Date.now() - HOUR_MS),
      }),
    );

    const result = await execute(PREPARE("prepareClaimReviewTimeout"), { user: developer, db }, { issueId: "issue-1" });

    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareClaimReviewTimeout).toMatchObject({
      method: "claimReviewTimeout",
      data: encodeEscrowCall("claimReviewTimeout", { escrowId: "br_issue-1_1" }),
    });
  });

  it("refuses inside the review window", async () => {
    const db = fakeDb(projectionRow({ deliveryHash: DELIVERY_HASH }));

    const result = await execute(PREPARE("prepareClaimReviewTimeout"), { user: developer, db }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("REVIEW_WINDOW_NOT_REACHED");
  });

  it("lets only the developer take the timeout claim", async () => {
    const db = fakeDb(
      projectionRow({ deliveryHash: DELIVERY_HASH, reviewDeadline: new Date(Date.now() - HOUR_MS) }),
    );

    const result = await execute(PREPARE("prepareClaimReviewTimeout"), { user: client, db }, { issueId: "issue-1" });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});

const CLAIM = `mutation($recipient: String!) { prepareClaim(recipient: $recipient) { method data args { name value } } }`;

describe("prepareClaim and myClaimable (BE-48)", () => {
  it("prepares claim(recipient) for the caller's own balance", async () => {
    const db = fakeDb();
    db.claimableBalance.findFirst.mockResolvedValue({
      amountRaw: { isZero: () => false, toFixed: () => "5000000" },
    });

    const result = await execute(CLAIM, { user: developer, db }, { recipient: DEVELOPER_WALLET });

    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareClaim).toMatchObject({
      method: "claim",
      data: encodeEscrowCall("claim", { recipient: DEVELOPER_WALLET }),
      args: [{ name: "recipient", value: DEVELOPER_WALLET }],
    });
  });

  it("refuses to claim another wallet's balance", async () => {
    const result = await execute(CLAIM, { user: developer, db: fakeDb() }, { recipient: CLIENT_WALLET });

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("refuses when there is nothing to claim", async () => {
    const result = await execute(CLAIM, { user: developer, db: fakeDb() }, { recipient: DEVELOPER_WALLET });

    expect(result.errors?.[0]?.extensions?.code).toBe("NOTHING_TO_CLAIM");
  });

  it("lists only the caller's positive balances on the configured contract", async () => {
    const db = fakeDb();

    await execute(`{ myClaimable { address amountRaw } }`, { user: developer, db });

    expect(db.claimableBalance.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        contractAddress: CONTRACT,
        address: { equals: DEVELOPER_WALLET, mode: "insensitive" },
        amountRaw: { gt: 0 },
      }),
    });
  });
});
