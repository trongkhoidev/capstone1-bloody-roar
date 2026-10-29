import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { beforeAll } from "bun:test";
import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { encodeErrorResult } from "@bloody-roar/shared";
import { ESCROW_ABI } from "@bloody-roar/shared/escrow";
import { INTENT_DROP_AFTER_MS, failedTransactionReason, nextIntentState, reconcileIntents, type IntentView } from "../src/reconciler/intents";
import { fakeRpc, newChain } from "./helpers";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const now = new Date("2027-01-01T12:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
const view = (over: Partial<IntentView>): IntentView => ({ status: "SUBMITTED", expiresAt: new Date("2027-01-01T13:00:00Z"), submittedAt: minutesAgo(1), ...over });

test("an unsigned intent expires once its expiry passes", () => {
  const status = view({ status: "AWAITING_SIGNATURE", expiresAt: minutesAgo(1) });
  expect(nextIntentState(status, null, now)).toEqual({ status: "EXPIRED" });
  expect(nextIntentState({ ...status, expiresAt: new Date(now.getTime() + 1) }, null, now)).toBeNull();
});

test("a submitted tx becomes FAILED on a reverted receipt and PENDING_SAFE_HEAD on success", () => {
  const receipt = (status: 0 | 1) => ({ status, blockNumber: 10n, transactionHash: "0xt" });
  expect(nextIntentState(view({}), receipt(0), now)).toEqual({ status: "FAILED", failureReason: "reverted on chain" });
  expect(nextIntentState(view({}), receipt(1), now)).toEqual({ status: "PENDING_SAFE_HEAD" });
});

test("a submitted tx with no receipt is DROPPED only after the wait limit", () => {
  expect(nextIntentState(view({ submittedAt: minutesAgo(5) }), null, now)).toBeNull();
  const old = minutesAgo(INTENT_DROP_AFTER_MS / 60_000 + 1);
  expect(nextIntentState(view({ submittedAt: old }), null, now)).toEqual({ status: "DROPPED", failureReason: "no receipt" });
});

test("falls back when the RPC cannot provide a decodable revert trace", async () => {
  const chain = newChain();
  expect(await failedTransactionReason(fakeRpc(chain), "0xmissing")).toBe("reverted on chain");
  chain.traces.set("0xunknown", "0x12345678");
  expect(await failedTransactionReason(fakeRpc(chain), "0xunknown")).toBe("reverted on chain");
});

test("no receipt outcome ever sets CONFIRMED", () => {
  const outcomes = [0, 1].flatMap((status) =>
    (["SUBMITTED", "PENDING_SAFE_HEAD"] as const).map((s) =>
      nextIntentState(view({ status: s }), { status: status as 0 | 1, blockNumber: 1n, transactionHash: "0xt" }, now),
    ),
  );
  expect(outcomes.some((o) => o?.status === "CONFIRMED")).toBe(false);
});

const userId = `intent_test_${Date.now()}`;
afterAll(async () => {
  await prisma.transactionIntent.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

test("reconcileIntents applies the rules to stored intents", async () => {
  const base = { userId, chainId: 84532, contractAddress: "0x0000000000000000000000000000000000000abc", method: "deposit", args: {}, expiresAt: new Date("2027-01-01T13:00:00Z") };
  const make = (txHash: string | null, status: "AWAITING_SIGNATURE" | "SUBMITTED", submittedAt: Date | null, expiresAt = base.expiresAt) =>
    prisma.transactionIntent.create({ data: { ...base, txHash, status, submittedAt, expiresAt } });
  const expired = await make(null, "AWAITING_SIGNATURE", null, minutesAgo(1));
  const reverted = await make("0xreverted", "SUBMITTED", minutesAgo(1));
  const mined = await make("0xmined", "SUBMITTED", minutesAgo(1));
  const lost = await make("0xlost", "SUBMITTED", minutesAgo(INTENT_DROP_AFTER_MS / 60_000 + 1));

  const chain = newChain();
  chain.receipts.set("0xreverted", { status: "0x0", blockNumber: 10n });
  chain.traces.set("0xreverted", encodeErrorResult({ abi: ESCROW_ABI, errorName: "DeadlineNotReached", args: [123n] }));
  chain.receipts.set("0xmined", { status: "0x1", blockNumber: 10n });
  const changed = await reconcileIntents({ db: prisma, rpc: fakeRpc(chain), now: () => now });

  expect(changed).toBeGreaterThanOrEqual(4); // leftover open rows from other runs may also change
  const statusOf = async (id: string) => (await prisma.transactionIntent.findUniqueOrThrow({ where: { id } })).status;
  expect(await statusOf(expired.id)).toBe("EXPIRED");
  expect(await statusOf(reverted.id)).toBe("FAILED");
  expect((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: reverted.id } })).failureReason).toBe("DeadlineNotReached");
  expect(await statusOf(mined.id)).toBe("PENDING_SAFE_HEAD");
  expect(await statusOf(lost.id)).toBe("DROPPED");
});


test("a concurrent chain confirmation is not overwritten by receipt reconciliation", async () => {
  const intent = await prisma.transactionIntent.create({ data: { userId, chainId: 84532, contractAddress: "0x0000000000000000000000000000000000000abc", method: "deposit", args: {}, expiresAt: new Date("2027-01-01T13:00:00Z"), txHash: "0xrace", status: "SUBMITTED", submittedAt: minutesAgo(1) } });
  const chain = newChain();
  chain.receipts.set("0xrace", { status: "0x1", blockNumber: 10n });
  const fake = fakeRpc(chain);
  const rpc = { ...fake, async call<T>(method: string, params: unknown[]): Promise<T> {
    if (method === "eth_getTransactionReceipt" && params[0] === "0xrace") await prisma.transactionIntent.update({ where: { id: intent.id }, data: { status: "CONFIRMED" } });
    return fake.call<T>(method, params);
  } };
  await reconcileIntents({ db: prisma, rpc, now: () => now });
  expect((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: intent.id } })).status).toBe("CONFIRMED");
});
