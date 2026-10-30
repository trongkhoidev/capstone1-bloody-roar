import { gqlAs } from "./gql";
import { sendPrepared } from "./funding";
import { waitFor } from "./waitFor";
import type { fixture } from "./fixture";
import type { Hex } from "@bloody-roar/shared/escrow";
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Prepared = { intentId: string; method: string; contractAddress: Hex; data: Hex; value: string };
export async function submitWork(f: Fixture, description: string) {
  const draft = await gqlAs(f.developer, `mutation($issue: ID!, $description: String!) { createSubmissionDraft(issueId: $issue, description: $description) { id deliveryHash } }`, { issue: f.issueId, description });
  if (draft.errors?.length) throw new Error(`Draft: ${draft.errors[0]?.message}`);
  const submission = draft.data?.createSubmissionDraft as { id: string; deliveryHash: string };
  const prepared = await gqlAs(f.developer, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: submission.id });
  if (prepared.errors?.length) throw new Error(`Prepare work: ${prepared.errors[0]?.message}`);
  await sendPrepared(f.developer, f.accounts[3]!, prepared.data?.prepareSubmitWork as Prepared);
  await waitFor(async () => (await f.prisma.submission.findUnique({ where: { id: submission.id } }))?.status === "SUBMITTED");
  return submission;
}
export async function releaseFunds(f: Fixture) {
  const prepared = await gqlAs(f.client, `mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId method contractAddress data value } }`, { id: f.issueId });
  if (prepared.errors?.length) throw new Error(`Prepare release: ${prepared.errors[0]?.message}`);
  await sendPrepared(f.client, f.accounts[2]!, prepared.data?.prepareReleaseFunds as Prepared);
  await waitFor(async () => (await f.prisma.issue.findUnique({ where: { id: f.issueId } }))?.status === "COMPLETED");
}
