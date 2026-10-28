import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { Prisma } from "@bloody-roar/database";
import type { FundingIntentInput } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

beforeAll(loadSchema, 60_000);

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const CONTRACT = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const DEVELOPER_ADDRESS = "0x3333333333333333333333333333333333333333" as const;
const TERMS = `0x${"11".repeat(32)}` as const;
const DEADLINE = new Date(Date.now() + 30 * DAY_MS);
const client = { id: "client-1", role: "CLIENT", name: null, isBanned: false };
const developer = { id: "dev-1", role: "DEVELOPER", name: null, isBanned: false };
const clientWallet = ethers.Wallet.createRandom();

// Domain và kiểu theo QĐ-18, viết tay để test không dùng lại hàm đang kiểm.
// Ethers không nhận EIP712Domain trong types.
const domain = {
  name: "BloodyRoarEscrow",
  version: "1",
  chainId: 84532,
  verifyingContract: CONTRACT,
};
const ethersTypes = {
  FundingIntent: [
    { name: "escrowId", type: "string" },
    { name: "client", type: "address" },
    { name: "developer", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deliveryDeadline", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "intentExpiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

function reservationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "reservation-1",
    issueId: "issue-1",
    applicationId: "app-1",
    clientId: client.id,
    developerId: developer.id,
    escrowKey: "br_issue-1_1",
    escrowIdHash: `0x${"22".repeat(32)}`,
    chainId: 84532,
    contractAddress: CONTRACT,
    tokenAddress: TOKEN,
    amountRaw: new Prisma.Decimal("100000000"),
    deliveryDeadline: DEADLINE,
    termsHash: TERMS,
    termsVersion: 1,
    intentSignature: null,
    intentNonce: null,
    intentExpiresAt: null,
    status: "AWAITING_FUNDING",
    expiresAt: new Date(Date.now() + DAY_MS),
    fundedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function fakeDb(row = reservationRow()) {
  return {
    fundingReservation: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
    },
    user: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === client.id
          ? { walletAddress: clientWallet.address }
          : { walletAddress: DEVELOPER_ADDRESS },
      ),
    },
    transactionIntent: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

// Ký đúng các trường mà resolver dựng lại từ reservation
async function signIntent(
  signer: ethers.Wallet,
  options: { expiry?: Date; nonce?: bigint } = {},
) {
  const expiry = options.expiry ?? new Date(Date.now() + 20 * MINUTE_MS);
  const nonce = options.nonce ?? 1n;
  const message: Omit<FundingIntentInput, "chainId" | "verifyingContract"> = {
    escrowId: "br_issue-1_1",
    client: clientWallet.address as `0x${string}`,
    developer: DEVELOPER_ADDRESS,
    token: TOKEN,
    amount: 100_000_000n,
    deliveryDeadline: BigInt(Math.floor(DEADLINE.getTime() / 1000)),
    termsHash: TERMS,
    intentExpiry: BigInt(Math.floor(expiry.getTime() / 1000)),
    nonce,
  };
  const signature = await signer._signTypedData(domain, ethersTypes, message);
  return { signature, expiry, nonce: nonce.toString() };
}

const SUBMIT = `mutation($reservationId: ID!, $signature: String!, $nonce: String!, $intentExpiry: String!) {
  submitFundingIntent(reservationId: $reservationId, signature: $signature, nonce: $nonce, intentExpiry: $intentExpiry) { id status }
}`;

function submitVariables(signature: string, nonce: string, expiry: Date) {
  return {
    reservationId: "reservation-1",
    signature,
    nonce,
    intentExpiry: expiry.toISOString(),
  };
}

describe("submitFundingIntent (BE-32)", () => {
  it("stores the signature when the client signs the intent", async () => {
    const db = fakeDb();
    const { signature, expiry, nonce } = await signIntent(clientWallet);

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors).toBeUndefined();
    expect(db.fundingReservation.update).toHaveBeenCalledWith({
      where: { id: "reservation-1" },
      data: { intentSignature: signature, intentNonce: nonce, intentExpiresAt: expiry },
    });
  });

  it("rejects a signature from a wallet other than the client's", async () => {
    const db = fakeDb();
    const { signature, expiry, nonce } = await signIntent(ethers.Wallet.createRandom());

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("INVALID_SIGNATURE");
    expect(db.fundingReservation.update).not.toHaveBeenCalled();
  });

  it("rejects an intent that expires more than 30 minutes from now", async () => {
    const db = fakeDb();
    const expiry = new Date(Date.now() + 31 * MINUTE_MS);
    const { signature, nonce } = await signIntent(clientWallet, { expiry });

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("INTENT_EXPIRY_INVALID");
    expect(db.fundingReservation.update).not.toHaveBeenCalled();
  });

  it("rejects a nonce that was already used", async () => {
    const db = fakeDb();
    db.fundingReservation.update.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    const { signature, expiry, nonce } = await signIntent(clientWallet);

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("NONCE_USED");
  });

  it("lets only the client sign", async () => {
    const db = fakeDb();
    const { signature, expiry, nonce } = await signIntent(clientWallet);

    const result = await execute(
      SUBMIT,
      { user: developer, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("refuses once the reservation is no longer awaiting funding", async () => {
    const db = fakeDb(reservationRow({ status: "FUNDED" }));
    const { signature, expiry, nonce } = await signIntent(clientWallet);

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables(signature, nonce, expiry),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
  });

  it("rejects a malformed signature before touching the database", async () => {
    const db = fakeDb();

    const result = await execute(
      SUBMIT,
      { user: client, db },
      submitVariables("0x1234", "1", new Date(Date.now() + MINUTE_MS)),
    );

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
    expect(db.fundingReservation.findUnique).not.toHaveBeenCalled();
  });
});

const RECORD = `mutation($intentId: ID!, $txHash: String!) {
  recordTransactionSubmitted(intentId: $intentId, txHash: $txHash) { id status txHash }
}`;
const TX_HASH = `0x${"ab".repeat(32)}`;

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "intent-1",
    userId: client.id,
    method: "deposit",
    status: "AWAITING_SIGNATURE",
    issueId: "issue-1",
    escrowKey: "br_issue-1_1",
    txHash: null,
    failureReason: null,
    expiresAt: new Date(Date.now() + 30 * MINUTE_MS),
    createdAt: new Date(),
    ...overrides,
  };
}

function intentDb(row = intentRow()) {
  const db = fakeDb();
  db.transactionIntent.findUnique.mockResolvedValue(row);
  db.transactionIntent.updateMany.mockResolvedValue({ count: 1 });
  db.transactionIntent.findUniqueOrThrow.mockResolvedValue({
    ...row,
    status: "SUBMITTED",
    txHash: TX_HASH,
  });
  return db;
}

describe("recordTransactionSubmitted (BE-35)", () => {
  it("moves an awaiting intent to SUBMITTED with the lowercased hash", async () => {
    const db = intentDb();

    const result = await execute(
      RECORD,
      { user: client, db },
      { intentId: "intent-1", txHash: TX_HASH.toUpperCase().replace("0X", "0x") },
    );

    expect(result.errors).toBeUndefined();
    expect(db.transactionIntent.updateMany).toHaveBeenCalledWith({
      where: { id: "intent-1", status: "AWAITING_SIGNATURE" },
      data: expect.objectContaining({ status: "SUBMITTED", txHash: TX_HASH }),
    });
    expect(result.data?.recordTransactionSubmitted).toEqual({
      id: "intent-1",
      status: "SUBMITTED",
      txHash: TX_HASH,
    });
  });

  it("rejects another user's intent", async () => {
    const db = intentDb(intentRow({ userId: "someone-else" }));

    const result = await execute(RECORD, { user: client, db }, { intentId: "intent-1", txHash: TX_HASH });

    expect(result.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
    expect(db.transactionIntent.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an intent that is not awaiting a signature", async () => {
    const db = intentDb(intentRow({ status: "SUBMITTED" }));

    const result = await execute(RECORD, { user: client, db }, { intentId: "intent-1", txHash: TX_HASH });

    expect(result.errors?.[0]?.extensions?.code).toBe("INTENT_NOT_SUBMITTABLE");
  });

  it("rejects an expired intent", async () => {
    const db = intentDb(intentRow({ expiresAt: new Date(Date.now() - MINUTE_MS) }));

    const result = await execute(RECORD, { user: client, db }, { intentId: "intent-1", txHash: TX_HASH });

    expect(result.errors?.[0]?.extensions?.code).toBe("INTENT_EXPIRED");
  });

  it("rejects a malformed transaction hash", async () => {
    const db = intentDb();

    const result = await execute(RECORD, { user: client, db }, { intentId: "intent-1", txHash: "0x12" });

    expect(result.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("rejects a hash that is already recorded for another intent", async () => {
    const db = intentDb();
    db.transactionIntent.updateMany.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const result = await execute(RECORD, { user: client, db }, { intentId: "intent-1", txHash: TX_HASH });

    expect(result.errors?.[0]?.extensions?.code).toBe("TX_HASH_USED");
  });
});

describe("myTransactions", () => {
  it("returns only the caller's intents", async () => {
    const db = intentDb();

    await execute(`{ myTransactions { id } }`, { user: client, db });

    expect(db.transactionIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: client.id } }),
    );
  });
});

describe("only the applier sets CONFIRMED", () => {
  it("no source file under apps/web/src writes IntentStatus.CONFIRMED", () => {
    const root = join(__dirname, "..");
    const files = readdirSync(root, { recursive: true }) as string[];
    const offenders = files.filter((file) => {
      // File này chứa chính mẫu tìm kiếm, nên bỏ qua
      if (!/\.(ts|tsx)$/.test(file) || file.includes("generated")) return false;
      if (file === join("test", "escrow-intent.test.ts")) return false;
      const source = readFileSync(join(root, file), "utf8");
      return /IntentStatus\.CONFIRMED|intent[^\n]*status:\s*"CONFIRMED"/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
