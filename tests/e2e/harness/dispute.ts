import { rpc } from "./chain";
import { gqlAs } from "./gql";
import { sendPrepared, walletOf, type Prepared } from "./funding";
import type { fixture } from "./fixture";
import type { Hex } from "@bloody-roar/shared/escrow";
import { waitFor } from "./waitFor";

// Đợi indexer đưa projection sang phase mong muốn trước khi gọi bước tiếp theo.
export const waitForPhase = (f: Fixture, phase: string) => waitFor(async () => (await f.prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } }))?.phase === phase);

type Fixture = Awaited<ReturnType<typeof fixture>>;
type User = Fixture["client"];

export async function createEvidence(f: Fixture, user: User, statement: string, files: string[] = []) {
  const result = await gqlAs(user, `mutation($issue: ID!, $statement: String!, $files: [ID!]) { createEvidenceManifest(issueId: $issue, statement: $statement, attachmentIds: $files) { id manifestHash } }`, { issue: f.issueId, statement, files });
  if (result.errors?.length) throw new Error(`Evidence: ${result.errors[0]?.message}`);
  return result.data?.createEvidenceManifest as { id: string; manifestHash: string };
}

export async function raiseDispute(f: Fixture, user: User, manifestId: string) {
  const result = await gqlAs(user, `mutation($issue: ID!, $manifest: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $manifest) { intentId method contractAddress data value } }`, { issue: f.issueId, manifest: manifestId });
  if (result.errors?.length) throw new Error(`Raise dispute: ${result.errors[0]?.message}`);
  await sendPrepared(user, walletOf(f, user), result.data?.prepareRaiseDispute as Prepared);
}

export async function submitCounterpartyEvidence(f: Fixture, user: User, manifestId: string) {
  const result = await gqlAs(user, `mutation($issue: ID!, $manifest: ID!) { prepareSubmitCounterpartyEvidence(issueId: $issue, manifestId: $manifest) { intentId method contractAddress data value } }`, { issue: f.issueId, manifest: manifestId });
  if (result.errors?.length) throw new Error(`Counterparty evidence: ${result.errors[0]?.message}`);
  await sendPrepared(user, walletOf(f, user), result.data?.prepareSubmitCounterpartyEvidence as Prepared);
}

// Admin dựng bản nháp phán quyết; trả về bản Safe để arbiter gửi on-chain.
export async function draftRuling(f: Fixture, kind: "INITIAL" | "FINAL", clientBps: number) {
  const result = await gqlAs(f.admin, `mutation($issue: ID!, $kind: RulingDraftKind!, $bps: Int!) { draftRuling(issueId: $issue, kind: $kind, clientBps: $bps, rationale: "Evidence supports this decision.") { decisionHash safeTransactionJson } }`, { issue: f.issueId, kind, bps: clientBps });
  if (result.errors?.length) throw new Error(`Draft ruling: ${result.errors[0]?.message}`);
  return result.data?.draftRuling as { decisionHash: string; safeTransactionJson: string };
}

// Arbiter (ví #5) gửi giao dịch lấy từ bản Safe; trả về calldata để test so khớp.
export async function postRuling(f: Fixture, safeTransactionJson: string) {
  const tx = (JSON.parse(safeTransactionJson) as { transactions: Array<{ to: Hex; data: Hex }> }).transactions[0]!;
  await rpc<string>("eth_sendTransaction", [{ from: f.arbiter, to: tx.to, data: tx.data, gas: "0x500000" }]);
  return tx;
}
