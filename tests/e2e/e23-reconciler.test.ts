import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { createRpcClient } from "../../apps/worker/src/chain/client";
import { reconcileProjections } from "../../apps/worker/src/reconciler/projections";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E23: the reconciler opens a finding for a projection mismatch and closes it after repair", async () => {
  const f = await fixture();
  await fund(f);
  const projection = await f.prisma.escrowProjection.findUniqueOrThrow({ where: { issueId: f.issueId } });
  const config = { chainId: 31337, escrowAddress: process.env.ESCROW_ADDRESS!.toLowerCase(), escrowDeployBlock: BigInt(process.env.ESCROW_DEPLOY_BLOCK!), rangeSize: 2000, reorgWindow: 64, finality: "latest" as const };
  const rpc = createRpcClient({ url: "http://127.0.0.1:8545" });
  // Runs the reconciliation job directly; it returns null while the indexer has not reached the chain head.
  const reconcile = () => reconcileProjections({ db: f.prisma, rpc, config, now: () => new Date() });
  const openFindings = () => f.prisma.reconciliationFinding.count({ where: { escrowIdHash: projection.escrowIdHash, resolvedAt: null } });

  await waitFor(async () => (await reconcile()) !== null);
  expect(await openFindings()).toBe(0);

  await f.prisma.escrowProjection.update({ where: { issueId: f.issueId }, data: { amountRaw: "100000001" } });
  await waitFor(async () => { await reconcile(); return (await openFindings()) > 0; });
  const finding = await f.prisma.reconciliationFinding.findFirstOrThrow({ where: { escrowIdHash: projection.escrowIdHash, resolvedAt: null } });
  expect(finding.kind.endsWith(":amount")).toBe(true);

  await f.prisma.escrowProjection.update({ where: { issueId: f.issueId }, data: { amountRaw: "100000000" } });
  await waitFor(async () => { await reconcile(); return (await openFindings()) === 0; });
  expect((await f.prisma.reconciliationFinding.findUniqueOrThrow({ where: { id: finding.id } })).resolvedAt).not.toBeNull();
}, 180_000);
