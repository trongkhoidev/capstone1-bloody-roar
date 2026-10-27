import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@bloody-roar/database";
import { encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { createPreparedCall } from "../lib/escrow/prepare";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const ARGS = {
  escrowKey: "br_issue-1_1",
  developer: "0x2222222222222222222222222222222222222222",
  amountRaw: "1250000000",
  deliveryDeadline: "1793000000",
  termsHash: `0x${"ab".repeat(32)}`,
};

function fakeDb() {
  return {
    transactionIntent: {
      create: vi.fn(async ({ data }: { data: object }) => ({ id: "intent-1", ...data })),
    },
  };
}

describe("createPreparedCall", () => {
  beforeEach(() => {
    vi.stubEnv("ESCROW_CONTRACT_ADDRESS", CONTRACT);
    vi.stubEnv("ESCROW_CHAIN_ID", "84532");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns calldata that matches encodeEscrowCall", async () => {
    const result = await createPreparedCall(fakeDb() as unknown as PrismaClient, {
      userId: "user-1",
      method: "deposit",
      args: ARGS,
    });

    expect(result.data).toBe(encodeEscrowCall("deposit", ARGS));
    expect(result).toMatchObject({ intentId: "intent-1", chainId: 84532, to: CONTRACT, value: "0" });
  });

  it("records an AWAITING_SIGNATURE intent that expires in 30 minutes by default", async () => {
    const db = fakeDb();

    const result = await createPreparedCall(db as unknown as PrismaClient, {
      userId: "user-1",
      method: "deposit",
      args: ARGS,
      issueId: "issue-1",
    });

    expect(db.transactionIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        issueId: "issue-1",
        status: "AWAITING_SIGNATURE",
        expiresAt: new Date("2026-10-27T00:30:00Z"),
      }),
    });
    expect(result.expiresAt).toBe("2026-10-27T00:30:00.000Z");
  });

  it("uses expiresInMinutes when the caller sets it", async () => {
    const result = await createPreparedCall(fakeDb() as unknown as PrismaClient, {
      userId: "user-1",
      method: "deposit",
      args: ARGS,
      expiresInMinutes: 5,
    });

    expect(result.expiresAt).toBe("2026-10-27T00:05:00.000Z");
  });

  it("refuses to prepare when the escrow contract is not configured", async () => {
    vi.stubEnv("ESCROW_CONTRACT_ADDRESS", "");
    const db = fakeDb();

    await expect(
      createPreparedCall(db as unknown as PrismaClient, {
        userId: "user-1",
        method: "deposit",
        args: ARGS,
      }),
    ).rejects.toThrow("Escrow chain integration is not configured");
    expect(db.transactionIntent.create).not.toHaveBeenCalled();
  });
});
