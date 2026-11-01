import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { rpc } from "./harness/chain";
import { waitFor } from "./harness/waitFor";
import { submitWork } from "./harness/work";
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
test("E9: deliver, request changes, resubmit and reject late work", async () => {
  const f = await fixture(); await fund(f);
  const first = await submitWork(f, "First delivery for review");
  expect((await f.prisma.escrowProjection.findUniqueOrThrow({ where: { issueId: f.issueId } })).deliveryHash).toBe(first.deliveryHash);
  expect(await f.prisma.notification.count({ where: { userId: f.client.id, type: "WORK_SUBMITTED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
  const changes = await gqlAs(f.client, `mutation($id: ID!) { requestChanges(submissionId: $id, notes: "Please revise the result") { changesRequested } }`, { id: first.id });
  expect(changes.errors).toBeUndefined();
  expect(await f.prisma.notification.count({ where: { userId: f.developer.id, type: "CHANGES_REQUESTED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
  await submitWork(f, "Revised delivery for review");
  expect((await f.prisma.submission.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SUPERSEDED");
  const snapshot = await rpc<string>("evm_snapshot");
  try {
    await rpc("evm_increaseTime", [6 * 86400]); await rpc("evm_mine");
    const late = await gqlAs(f.developer, `mutation($issue: ID!) { createSubmissionDraft(issueId: $issue, description: "Late work") { id } }`, { issue: f.issueId });
    expect(late.errors?.[0]?.extensions?.code).toBe("DEADLINE_PASSED");
  } finally {
    expect(await rpc<boolean>("evm_revert", [snapshot])).toBe(true);
    const checkpoint = await f.prisma.projectionCheckpoint.findFirstOrThrow({ where: { chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!.toLowerCase() } });
    while (BigInt(await rpc<string>("eth_blockNumber")) < checkpoint.lastScannedBlock) await rpc("evm_mine");
    await waitFor(async () => {
      const current = await f.prisma.projectionCheckpoint.findFirstOrThrow({ where: { chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!.toLowerCase() } });
      const block = await rpc<{ hash: string } | null>("eth_getBlockByNumber", [`0x${current.lastScannedBlock.toString(16)}`, false]);
      return !!block && block.hash.toLowerCase() === current.lastCanonicalBlockHash.toLowerCase();
    });
  }
}, 120_000);
