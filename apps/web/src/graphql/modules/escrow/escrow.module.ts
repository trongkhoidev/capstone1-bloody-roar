import { EscrowPhase, EscrowResolutionKind } from "@bloody-roar/database";
import { Contract, providers, utils } from "ethers";
import { ESCROW_ABI } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { escrowTarget } from "../../../lib/escrow/prepare";

export const EscrowPhaseEnum = builder.enumType(EscrowPhase, { name: "EscrowPhase" });
export const ResolutionKindEnum = builder.enumType(EscrowResolutionKind, { name: "EscrowResolutionKind" });

const ClaimableRef = builder.objectRef<{
  rawAmount: string;
  amount: string;
  tokenAddress: string;
  contractAddress: string;
  chainId: number;
}>("EscrowClaimableBalance");
ClaimableRef.implement({
  fields: (t) => ({
    rawAmount: t.exposeString("rawAmount"),
    amount: t.exposeString("amount"),
    tokenAddress: t.exposeString("tokenAddress"),
    contractAddress: t.exposeString("contractAddress"),
    chainId: t.exposeInt("chainId"),
  }),
});
builder.queryField("escrowClaimableBalance", (t) =>
  t.field({
    type: ClaimableRef,
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const settings = escrowTarget();
      const rpcUrl = process.env.RPC_URL;
      if (!rpcUrl || !/^https?:\/\//.test(rpcUrl))
        throw gqlError("RPC_URL is invalid or missing", "ESCROW_NOT_CONFIGURED");
      try {
        const provider = new providers.JsonRpcProvider(rpcUrl, settings.chainId);
        const contract = new Contract(settings.contractAddress, [...ESCROW_ABI], provider);
        const blockTag = await provider.getBlockNumber();
        const [tokenAddress, rawAmount] = await Promise.all([
          contract.token({ blockTag }),
          contract.claimable(user.walletAddress, { blockTag }),
        ]);
        return {
          rawAmount: rawAmount.toString(),
          amount: utils.formatUnits(rawAmount, 6),
          tokenAddress: utils.getAddress(tokenAddress),
          contractAddress: settings.contractAddress,
          chainId: settings.chainId,
        };
      } catch {
        throw gqlError("Unable to read claimable escrow balance", "ESCROW_RPC_UNAVAILABLE");
      }
    },
  }),
);
