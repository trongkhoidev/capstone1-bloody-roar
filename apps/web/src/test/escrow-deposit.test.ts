import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ethers } from "ethers";
import { Prisma } from "@bloody-roar/database";
import { encodeErc20Approve, encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

const mock = vi.hoisted(() => ({ readFundingState: vi.fn() }));
vi.mock("../lib/escrow/funding", () => ({ readFundingState: mock.readFundingState }));
beforeAll(loadSchema, 60_000);
const contract = "0x1111111111111111111111111111111111111111" as const;
const token = "0x2222222222222222222222222222222222222222" as const;
const developerAddress = "0x3333333333333333333333333333333333333333" as const;
const termsHash = `0x${"ab".repeat(32)}` as const;
const wallet = ethers.Wallet.createRandom();
const user = { id: "client-1", role: "CLIENT", walletAddress: wallet.address, isBanned: false };
const deadline = new Date(Date.now() + 30 * 86400_000);
const amount = 100_000_000n;
const typed = { FundingIntent: [
  { name: "escrowId", type: "string" }, { name: "client", type: "address" }, { name: "developer", type: "address" },
  { name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "deliveryDeadline", type: "uint256" },
  { name: "termsHash", type: "bytes32" }, { name: "intentExpiry", type: "uint256" }, { name: "nonce", type: "uint256" },
] };
const query = `mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId chainId contractAddress method data value expiresAt args { name value } } } }`;
let reservation: ReturnType<typeof row>;
function row(signature: string, expiry: Date) {
  return { id: "reservation-1", issueId: "issue-1", clientId: user.id, developerId: "dev-1", escrowKey: "br_issue-1_1",
    chainId: 84532, contractAddress: contract as string, tokenAddress: token as string, amountRaw: new Prisma.Decimal(amount.toString()),
    deliveryDeadline: deadline, termsHash, termsVersion: 1, status: "AWAITING_FUNDING", expiresAt: new Date(Date.now() + 86400_000),
    intentSignature: signature, intentNonce: "7", intentExpiresAt: expiry };
}
function fakeDb(fresh = reservation, issue: { status: string; termsVersion: number } | null = { status: "AWAITING_FUNDING", termsVersion: 1 }) {
  let next = 0;
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]), fundingReservation: { findUnique: vi.fn().mockResolvedValue(fresh) },
    issue: { findUnique: vi.fn().mockResolvedValue(issue) },
    transactionIntent: { create: vi.fn(async () => ({ id: `intent-${++next}` })) } };
  return { tx, fundingReservation: { findUnique: vi.fn().mockResolvedValue(reservation) },
    user: { findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => ({ walletAddress: where.id === user.id ? wallet.address : developerAddress })) },
    $transaction: vi.fn(async (fn: (transaction: typeof tx) => unknown) => fn(tx)) };
}
async function run(db = fakeDb(), actor = user) {
  return execute(query, { user: actor, db }, { id: "reservation-1" });
}
beforeEach(async () => {
  vi.stubEnv("CHAIN_ID", "84532"); vi.stubEnv("ESCROW_ADDRESS", contract);
  const expiry = new Date(Date.now() + 10 * 60_000);
  const signature = await wallet._signTypedData({ name: "BloodyRoarEscrow", version: "1", chainId: 84532, verifyingContract: contract }, typed, {
    escrowId: "br_issue-1_1", client: wallet.address, developer: developerAddress, token, amount: amount.toString(),
    deliveryDeadline: Math.floor(deadline.getTime() / 1000), termsHash, intentExpiry: Math.floor(expiry.getTime() / 1000), nonce: "7",
  });
  reservation = row(signature, expiry);
  mock.readFundingState.mockReset().mockResolvedValue({ balance: amount, allowance: 0n, paused: false, token, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) });
});

describe("prepareEscrowDeposit", () => {
  it("returns approval followed by deposit with the correct calldata", async () => {
    const db = fakeDb(); const result = await run(db);
    expect(result.errors).toBeUndefined();
    const steps = (result.data?.prepareEscrowDeposit as { steps: Array<{ method: string; data: string; contractAddress: string }> }).steps;
    expect(steps.map((step) => step.method)).toEqual(["approve", "deposit"]);
    expect(steps[0]).toMatchObject({ contractAddress: token, data: encodeErc20Approve(contract, amount.toString()) });
    expect(steps[1]).toMatchObject({ contractAddress: contract, data: encodeEscrowCall("deposit", { escrowId: reservation.escrowKey, developer: developerAddress, amount: amount.toString(), deliveryDeadline: String(Math.floor(deadline.getTime() / 1000)), termsHash }) });
    expect(db.tx.transactionIntent.create).toHaveBeenCalledTimes(2);
  });
  it("omits approval when allowance is sufficient", async () => {
    mock.readFundingState.mockResolvedValue({ balance: amount, allowance: amount, paused: false, token, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) });
    const result = await run();
    expect(result.errors).toBeUndefined();
    expect((result.data?.prepareEscrowDeposit as { steps: Array<{ method: string }> }).steps.map((step) => step.method)).toEqual(["deposit"]);
  });
  it.each([
    ["paused", { paused: true }, "ESCROW_PAUSED"],
    ["insufficient balance", { balance: amount - 1n }, "INSUFFICIENT_BALANCE"],
    ["wrong token", { token: developerAddress }, "INVALID_TOKEN"],
    ["deadline passed on chain", { blockTimestamp: BigInt(Math.floor(deadline.getTime() / 1000)) }, "DELIVERY_DEADLINE_INVALID"],
  ])("rejects %s", async (_name, changes, code) => {
    mock.readFundingState.mockResolvedValue({ balance: amount, allowance: 0n, paused: false, token, blockTimestamp: 1n, ...changes });
    const db = fakeDb(); const result = await run(db);
    expect(result.errors?.[0]?.extensions?.code).toBe(code);
    expect(db.tx.transactionIntent.create).not.toHaveBeenCalled();
  });
  it("rejects an unsigned or expired funding intent", async () => {
    const signature = reservation.intentSignature;
    reservation.intentSignature = "";
    expect((await run()).errors?.[0]?.extensions?.code).toBe("FUNDING_INTENT_INVALID");
    reservation.intentSignature = signature;
    reservation.intentExpiresAt = new Date(Date.now() - 1000);
    expect((await run()).errors?.[0]?.extensions?.code).toBe("FUNDING_INTENT_INVALID");
  });
  it("rejects an expired or inactive reservation", async () => {
    reservation.status = "EXPIRED";
    expect((await run()).errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
    reservation.status = "AWAITING_FUNDING";
    reservation.expiresAt = new Date(Date.now() - 1000);
    expect((await run()).errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
  });
  it("rejects a reservation on a different contract", async () => {
    reservation.contractAddress = developerAddress;
    expect((await run()).errors?.[0]?.extensions?.code).toBe("ESCROW_CHAIN_MISMATCH");
  });
  it("rejects a changed signed amount", async () => {
    reservation.amountRaw = new Prisma.Decimal("999");
    expect((await run()).errors?.[0]?.extensions?.code).toBe("FUNDING_INTENT_INVALID");
  });
  it("rejects a reservation changed while the RPC was being read", async () => {
    const db = fakeDb({ ...reservation, termsVersion: 2 });
    expect((await run(db)).errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
    expect(db.tx.transactionIntent.create).not.toHaveBeenCalled();
  });
  it("rejects changed issue terms and a shortened reservation", async () => {
    const changedIssue = fakeDb(reservation, { status: "AWAITING_FUNDING", termsVersion: 2 });
    expect((await run(changedIssue)).errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
    const changedExpiry = fakeDb({ ...reservation, expiresAt: new Date(reservation.expiresAt.getTime() - 1000) });
    expect((await run(changedExpiry)).errors?.[0]?.extensions?.code).toBe("RESERVATION_NOT_FUNDABLE");
  });
  it("rejects an authenticated user whose wallet no longer matches the signature", async () => {
    expect((await run(fakeDb(), { ...user, walletAddress: developerAddress })).errors?.[0]?.extensions?.code).toBe("FUNDING_INTENT_INVALID");
  });
  it("rejects a caller other than the client", async () => {
    expect((await run(fakeDb(), { ...user, id: "other" })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});
