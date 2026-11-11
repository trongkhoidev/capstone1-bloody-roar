import { afterAll, expect, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { loadCheckpoint, checkpointKey } from "../src/indexer/checkpoint";
import { requestReplay } from "../src/indexer/replay";
import { cleanupChain, testConfig } from "./helpers";

const config = testConfig(); // escrowDeployBlock 100n

afterAll(async () => {
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("replay moves the cursor to fromBlock - 1 and flags the request", async () => {
  await loadCheckpoint(prisma, config);
  await prisma.projectionCheckpoint.update({
    where: checkpointKey(config),
    data: { lastScannedBlock: 500n, lastCanonicalBlockHash: "0xh500" },
  });

  await requestReplay(prisma, config, 150n);

  expect(await loadCheckpoint(prisma, config)).toMatchObject({
    lastScannedBlock: 149n,
    lastCanonicalBlockHash: "",
    replayStatus: "REPLAY_REQUESTED",
  });
});

test("replay before the escrow deploy block is refused", async () => {
  await expect(requestReplay(prisma, config, 99n)).rejects.toThrow(/before the escrow deploy block/);
});
