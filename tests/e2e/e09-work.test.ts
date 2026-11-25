import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { advanceTime, restoreChain, snapshotChain } from "./harness/chain";
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
  const snapshot = await snapshotChain();
  try {
    await advanceTime(6 * 86400);
    const late = await gqlAs(f.developer, `mutation($issue: ID!) { createSubmissionDraft(issueId: $issue, description: "Late work") { id } }`, { issue: f.issueId });
    expect(late.errors?.[0]?.extensions?.code).toBe("DEADLINE_PASSED");
  } finally {
    await restoreChain(snapshot, { prisma: f.prisma });
  }
}, 120_000);
