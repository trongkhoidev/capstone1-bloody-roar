import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { handleReorg } from "../src/indexer/reorg";
import { cleanupChain, fakeRpc, newChain, rawLog, scanToHead, testConfig } from "./helpers";

const config = testConfig();
const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
const address = config.escrowAddress;

afterAll(async () => {
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("a reorg marks orphaned events non-canonical and re-includes events that moved", async () => {
  const chain = newChain();
  chain.safe = 105n;
  for (let n = 100n; n <= 105n; n++) chain.blockHash.set(n, `0xA${n}`);
  chain.logs = [
    rawLog({ address, block: 101, blockHash: "0xA101", tx: "0xtx1" }),
    rawLog({ address, block: 103, blockHash: "0xA103", tx: "0xtx2" }),
    rawLog({ address, block: 104, blockHash: "0xA104", tx: "0xtx3" }),
    rawLog({ address, block: 105, blockHash: "0xA105", tx: "0xtx4" }),
  ];
  await scanToHead({ db: prisma, rpc: fakeRpc(chain), config });
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).toBeNull();

  // Blocks 104 and 105 are replaced. tx3 is included again in the new block 104. tx4 is gone.
  chain.blockHash.set(104n, "0xB104");
  chain.blockHash.set(105n, "0xB105");
  chain.logs = [
    rawLog({ address, block: 101, blockHash: "0xA101", tx: "0xtx1" }),
    rawLog({ address, block: 103, blockHash: "0xA103", tx: "0xtx2" }),
    rawLog({ address, block: 104, blockHash: "0xB104", tx: "0xtx3" }),
  ];
  const reorged = fakeRpc(chain);
  expect(await handleReorg({ db: prisma, rpc: reorged, config })).toEqual({ rewoundTo: 99n });
  await scanToHead({ db: prisma, rpc: reorged, config });

  const events = await prisma.chainEvent.findMany({ where });
  const byTx = Object.fromEntries(events.map((e) => [e.txHash, e]));
  expect(byTx["0xtx1"]?.canonical).toBe(true);
  expect(byTx["0xtx2"]?.canonical).toBe(true);
  expect(byTx["0xtx3"]).toMatchObject({ canonical: true, blockHash: "0xB104", blockNumber: 104n });
  expect(byTx["0xtx4"]?.canonical).toBe(false);
  expect(await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: where } })).toMatchObject({
    lastScannedBlock: 105n,
    lastCanonicalBlockHash: "0xB105",
  });
});
