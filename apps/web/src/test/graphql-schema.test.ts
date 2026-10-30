import { describe, expect, it } from "vitest";

describe("GraphQL schema", () => {
  it("builds without duplicate fields", async () => {
    const { schema } = await import("../graphql/schema");

    expect(schema.getQueryType()?.getFields().user).toBeDefined();
    const mutations = schema.getMutationType()?.getFields();
    const legacyMutations = [
      ["depositTo", "Escrow"], ["confirmEscrow", "Transaction"], ["release", "Funds"],
      ["cancel", "Escrow"], ["raise", "Dispute"], ["proposeDispute", "Resolution"],
      ["challengeDispute", "Resolution"],
    ];
    for (const parts of legacyMutations) expect(mutations?.[parts.join("")]).toBeUndefined();
    expect(mutations?.analyzeDispute).toBeDefined();
    expect(mutations?.submitWork).toBeUndefined();
    expect(mutations?.[["review", "Submission"].join("")]).toBeUndefined();
    expect(mutations?.createSubmissionDraft).toBeDefined();
    expect(mutations?.prepareSubmitWork).toBeDefined();
    expect(mutations?.requestChanges).toBeDefined();
    expect(mutations?.attachIssueFile).toBeDefined();
    const dispute = schema.getType("Dispute");
    const disputeFields = dispute && "getFields" in dispute ? dispute.getFields() : {};
    expect(disputeFields.suggestedClientBps?.type.toString()).toBe("Int");
    expect(disputeFields.proposedClientBps?.type.toString()).toBe("Int");
    expect(disputeFields.finalClientBps?.type.toString()).toBe("Int");
    expect(disputeFields.suggestedRatio).toBeUndefined();
    expect(disputeFields.proposedClientRatio).toBeUndefined();
    const escrow = schema.getType("Escrow");
    const escrowFields = escrow && "getFields" in escrow ? escrow.getFields() : {};
    for (const name of ["bountyAmount", "platformFeeAmount", "developerPayout", "clientRefund"]) {
      expect(escrowFields[name]).toBeUndefined();
      expect(escrowFields[`${name}Raw`]?.type.toString()).toBe("String");
    }
    const issue = schema.getType("Issue");
    expect(issue && "getFields" in issue ? issue.getFields().isDraft : undefined).toBeUndefined();
  }, 60_000);
});
