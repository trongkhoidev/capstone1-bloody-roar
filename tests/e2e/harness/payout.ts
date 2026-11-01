import { decodeFunctionResult, encodeFunctionData } from "@bloody-roar/shared";
import type { PrismaClient } from "@bloody-roar/database";
import { rpc } from "./chain";
import { gqlAs } from "./gql";
import { sendPrepared, walletOf, type Prepared } from "./funding";
import { waitFor } from "./waitFor";
import type { fixture } from "./fixture";
import type { Hex } from "@bloody-roar/shared/escrow";

type Fixture = Awaited<ReturnType<typeof fixture>>;
type User = Fixture["client"];
const balanceAbi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

// Số dư đã ghi nhận trong projection. Cộng dồn giữa các file, nên test chỉ so hiệu số.
export async function claimable(prisma: PrismaClient, wallet: string) {
  const row = await prisma.claimableBalance.findUnique({ where: { chainId_contractAddress_address: { chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!.toLowerCase(), address: wallet.toLowerCase() } } });
  return BigInt(row?.amountRaw.toFixed() ?? "0");
}

// Số dư token on-chain của một ví (hoặc của escrow).
export async function tokenBalance(f: Fixture, wallet: string) {
  const data = encodeFunctionData({ abi: balanceAbi, functionName: "balanceOf", args: [wallet as Hex] });
  return decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: await rpc<Hex>("eth_call", [{ to: f.token.address, data }, "latest"]) });
}

// Ví phí dùng chung giữa các file, nên phải có user trong DB trước khi gọi gqlAs.
export const feeUser = (f: Fixture) => f.prisma.user.upsert({ where: { walletAddress: f.feeRecipient.toLowerCase() }, create: { walletAddress: f.feeRecipient.toLowerCase() }, update: {} });

// Rút toàn bộ số dư của chính user về ví của họ, rồi đợi indexer xác nhận intent.
export async function claimFunds(f: Fixture, user: User) {
  const result = await gqlAs(user, `mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId method contractAddress data value } }`, { recipient: user.walletAddress });
  if (result.errors?.length) throw new Error(`Claim: ${result.errors[0]?.message}`);
  const step = result.data?.prepareClaim as Prepared;
  await sendPrepared(user, walletOf(f, user), step);
  await waitFor(async () => (await f.prisma.transactionIntent.findUnique({ where: { id: step.intentId } }))?.status === "CONFIRMED");
}
