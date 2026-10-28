import { describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const client = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };
const deadline = new Date(Date.now() + 60 * 60 * 1000);

// Calls a mutation resolver directly; the GraphQL engine instance differs between test and schema modules.
function callChallenge(dispute: Record<string, unknown>) {
  const db = {
    dispute: {
      findUnique: vi.fn(async () => dispute),
      update: vi.fn(async () => ({ ...dispute, status: "CHALLENGED" })),
    },
  };
  const field = schema.getMutationType()?.getFields().challengeDisputeResolution;
  if (!field?.resolve) throw new Error("no resolver for challengeDisputeResolution");
  const result = field.resolve({} as never, { issueId: "issue-1" }, { db, user: client } as never, {} as never);
  return { result, db };
}

describe("challengeDisputeResolution (BUG-2)", () => {
  it("lets a party challenge a proposed ruling once", async () => {
    const { result, db } = callChallenge({
      id: "d1",
      status: "PROPOSED",
      challengeDeadline: deadline,
      challengedAt: null,
      issue: { clientId: "client-1", developerId: "dev-1" },
    });

    await expect(result).resolves.toMatchObject({ status: "CHALLENGED" });
    expect(db.dispute.update).toHaveBeenCalledOnce();
  });

  it("rejects a second challenge after the proposal cycle returns to PROPOSED", async () => {
    const { result, db } = callChallenge({
      id: "d1",
      status: "PROPOSED",
      challengeDeadline: deadline,
      challengedAt: new Date(),
      issue: { clientId: "client-1", developerId: "dev-1" },
    });

    await expect(result).rejects.toThrow("Tranh chấp này đã được phản đối một lần");
    expect(db.dispute.update).not.toHaveBeenCalled();
  });
});
