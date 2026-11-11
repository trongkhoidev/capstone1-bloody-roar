// E2E: a real reorg on a local Hardhat node, read by the worker's scanner and reorg handler.
// Run: bun run --cwd apps/worker test:e2e   (needs `bun run contracts:compile` once)
import assert from "node:assert/strict";
import { prisma } from "@bloody-roar/database";
import { handleReorg } from "../src/indexer/reorg";
import { scanOnce } from "../src/indexer/scanner";
import { scanToHead } from "../test/helpers";
import { deployMockUsdc, mint, revert, snapshot, startHardhatNode, transfer } from "./harness";

const node = await startHardhatNode(8546);
let escrowAddress = "";
try {
  const { rpc } = node;
  const chainId = Number(BigInt(await rpc.call<string>("eth_chainId", [])));
  const [from] = await rpc.call<string[]>("eth_accounts", []);
  if (!from) throw new Error("hardhat has no accounts");
  const token = await deployMockUsdc(rpc, from);
  escrowAddress = token.address;
  const config = { chainId, escrowAddress, escrowDeployBlock: token.blockNumber, rangeSize: 2000, reorgWindow: 64 };
  const where = { chainId, contractAddress: escrowAddress };

  // Base state below the snapshot: a mint. Then one transfer, which the scanner stores.
  await mint(rpc, token.address, from, from, 10n);
  const base = await snapshot(rpc);
  const original = await transfer(rpc, token.address, from, from, 1n);
  await scanToHead({ db: prisma, rpc, config });

  // Revert to the snapshot and mine a different transfer at the same height.
  assert.equal(await revert(rpc, base), true);
  const replacement = await transfer(rpc, token.address, from, from, 2n);
  assert.notEqual(replacement.transactionHash, original.transactionHash);

  const rewound = await handleReorg({ db: prisma, rpc, config });
  assert.ok(rewound, "the handler should detect the reorg");
  await scanToHead({ db: prisma, rpc, config });

  const byTx = Object.fromEntries((await prisma.chainEvent.findMany({ where })).map((e) => [e.txHash, e]));
  assert.equal(byTx[String(original.transactionHash)]?.canonical, false, "orphaned transfer must be non-canonical");
  assert.equal(byTx[String(replacement.transactionHash)]?.canonical, true, "replacement transfer must be canonical");
  assert.equal(await scanOnce({ db: prisma, rpc, config }), null, "nothing left to scan");
  console.log(`reorg e2e passed on chain ${chainId} (rewound to ${rewound.rewoundTo})`);
} finally {
  if (escrowAddress) {
    const where = { contractAddress: escrowAddress };
    await prisma.chainEvent.deleteMany({ where });
    await prisma.projectionCheckpoint.deleteMany({ where });
  }
  await node.stop();
  await prisma.$disconnect();
}
