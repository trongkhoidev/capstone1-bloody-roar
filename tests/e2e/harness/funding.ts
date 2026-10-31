import { randomBytes } from "node:crypto";
import { encodeFunctionData } from "@bloody-roar/shared";
import { fundingIntentTypedData, type Hex } from "@bloody-roar/shared/escrow";
import { rpc } from "./chain";
import { gqlAs } from "./gql";
import { fixture } from "./fixture";
import { waitFor } from "./waitFor";

type Fixture = Awaited<ReturnType<typeof fixture>>;
export type Prepared = { intentId: string; method: string; contractAddress: Hex; data: Hex; value: string };
const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
export async function sendPrepared(user: Fixture["client"], wallet: string, call: Prepared) {
  const hash = await rpc<string>("eth_sendTransaction", [{ from: wallet, to: call.contractAddress, data: call.data, value: `0x${BigInt(call.value).toString(16)}`, gas: "0x500000" }]);
  const recorded = await gqlAs(user, `mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { id } }`, { id: call.intentId, hash });
  if (recorded.errors?.length) throw new Error(`Record transaction: ${recorded.errors[0]?.message}`);
  const receipt = await waitFor(() => rpc<{ status: string } | null>("eth_getTransactionReceipt", [hash]));
  if (receipt.status !== "0x1") throw new Error("Prepared transaction reverted");
  return hash;
}
// Ví Hardhat của user (chuỗi checksum từ eth_accounts, để gửi giao dịch).
export const walletOf = (f: Fixture, user: Fixture["client"]) => f.accounts.find((a) => a.toLowerCase() === user.walletAddress.toLowerCase())!;
// Gọi một mutation prepare* chỉ cần issueId, rồi gửi giao dịch bằng ví của user.
export async function prepareAndSend(f: Fixture, user: Fixture["client"], field: string) {
  const result = await gqlAs(user, `mutation($issue: ID!) { ${field}(issueId: $issue) { intentId method contractAddress data value } }`, { issue: f.issueId });
  if (result.errors?.length) throw new Error(`${field}: ${result.errors[0]?.message}`);
  const step = result.data?.[field] as Prepared;
  await sendPrepared(user, walletOf(f, user), step);
  return step;
}
// Mints mock USDC to `to`, sent from the client account (the local token is mintable by anyone).
export async function mintUsdc(f: Fixture, to: string, amount: bigint) {
  await rpc("eth_sendTransaction", [{ from: f.accounts[2], to: f.token.address, data: encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [to as Hex, amount] }), gas: "0x500000" }]);
}
export async function fund(f: Fixture) {
  const selection = await f.select(f.applicationId);
  if (selection.errors?.length) throw new Error(`Select: ${selection.errors[0]?.message}`);
  const id = (selection.data?.selectDeveloper as { id: string }).id;
  const reservation = await f.prisma.fundingReservation.findUniqueOrThrow({ where: { id } });
  const expiry = new Date(Date.now() + 10 * 60_000), nonce = BigInt(`0x${randomBytes(16).toString("hex")}`);
  const typed = fundingIntentTypedData({ chainId: reservation.chainId, verifyingContract: reservation.contractAddress as Hex, escrowId: reservation.escrowKey,
    client: f.client.walletAddress as Hex, developer: f.developer.walletAddress as Hex, token: reservation.tokenAddress as Hex, amount: BigInt(reservation.amountRaw.toFixed()),
    deliveryDeadline: BigInt(Math.floor(reservation.deliveryDeadline.getTime() / 1000)), termsHash: reservation.termsHash as Hex,
    intentExpiry: BigInt(Math.floor(expiry.getTime() / 1000)), nonce });
  const payload = JSON.stringify({ ...typed, types: { EIP712Domain: [
    { name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
  ], ...typed.types } }, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  const signature = await rpc<string>("eth_signTypedData_v4", [f.accounts[2], payload]);
  const signed = await gqlAs(f.client, `mutation($id: ID!, $signature: String!, $nonce: String!, $expiry: String!) { submitFundingIntent(reservationId: $id, signature: $signature, nonce: $nonce, intentExpiry: $expiry) { id } }`, { id, signature, nonce: nonce.toString(), expiry: expiry.toISOString() });
  if (signed.errors?.length) throw new Error(`Funding signature: ${signed.errors[0]?.message}`);
  await mintUsdc(f, f.accounts[2]!, 100000000n);
  const prepared = await gqlAs(f.client, `mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId method contractAddress data value } } }`, { id });
  if (prepared.errors?.length) throw new Error(`Prepare deposit: ${prepared.errors[0]?.message}`);
  const steps = (prepared.data?.prepareEscrowDeposit as { steps: Prepared[] }).steps;
  for (const step of steps) await sendPrepared(f.client, f.accounts[2]!, step);
  await waitFor(async () => (await f.prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } }))?.phase === "FUNDED");
  await waitFor(async () => (await f.prisma.transactionIntent.count({ where: { id: { in: steps.map((step) => step.intentId) }, status: "CONFIRMED" } })) === steps.length);
  return { reservation, steps };
}

export async function externalDeposit(f: Fixture, reservation: Awaited<ReturnType<Fixture["prisma"]["fundingReservation"]["findUniqueOrThrow"]>>, overrides: { amount?: bigint; developer?: Hex } = {}) {
  const { encodeErc20Approve, encodeEscrowCall } = await import("@bloody-roar/shared/escrow");
  const amount = overrides.amount ?? BigInt(reservation.amountRaw.toFixed());
  const send = (to: string, data: string) => rpc<string>("eth_sendTransaction", [{ from: f.accounts[2], to, data, gas: "0x500000" }]);
  await send(f.token.address, encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [f.accounts[2] as Hex, amount] }));
  await send(f.token.address, encodeErc20Approve(reservation.contractAddress as Hex, amount.toString()));
  return send(reservation.contractAddress, encodeEscrowCall("deposit", { escrowId: reservation.escrowKey, developer: overrides.developer ?? f.developer.walletAddress,
    amount: amount.toString(), deliveryDeadline: String(Math.floor(reservation.deliveryDeadline.getTime() / 1000)), termsHash: reservation.termsHash }));
}
