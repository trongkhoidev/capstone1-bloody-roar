import { afterAll, beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { reconcileProjections } from "../src/reconciler/projections";
import { cleanupChain, fakeRpc, newChain, testConfig } from "./helpers";

const config = testConfig();
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
afterAll(async () => {
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("skips comparison while the indexer is behind the selected head", async () => {
  const chain = newChain();
  chain.safe = 100n;
  chain.blockHash.set(100n, "0xabc100");
  expect(await reconcileProjections({ db: prisma, rpc: fakeRpc(chain), config, now: () => new Date() })).toBeNull();
  expect(await prisma.reconciliationFinding.count({ where: { kind: { startsWith: `chain:${config.chainId}:${config.escrowAddress}:` } } })).toBe(0);
});
