import { createHash } from "node:crypto";

export type ChallengeIdentity = {
  nonceHash: string;
  walletAddress: string;
  domain: string;
  uri: string;
  chainId: number;
};

export function buildChallengeIdentity(input: {
  nonce: string;
  address: string;
  domain: string;
  uri: string;
  chainId: string;
}): ChallengeIdentity {
  return {
    nonceHash: createHash("sha256").update(input.nonce).digest("hex"),
    walletAddress: input.address.toLowerCase(),
    domain: input.domain,
    uri: input.uri,
    chainId: Number.parseInt(input.chainId, 10),
  };
}

export class ChallengeReplayError extends Error {}

export async function consumeSiweChallenge(
  repository: {
    updateMany(args: unknown): Promise<{ count: number }>;
    findUnique(args: unknown): Promise<{ consumedAt: Date | null } | null>;
  },
  identity: ChallengeIdentity,
  now = new Date(),
): Promise<void> {
  const result = await repository.updateMany({
    where: {
      ...identity,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (result.count === 1) return;

  const row = await repository.findUnique({ where: { nonceHash: identity.nonceHash } });
  if (row?.consumedAt) throw new ChallengeReplayError("Login challenge already used");
  throw new Error("Invalid or expired login challenge");
}
