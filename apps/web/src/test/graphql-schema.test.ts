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
    expect(mutations?.reviewSubmission).toBeUndefined();
    expect(mutations?.createSubmissionDraft).toBeDefined();
    expect(mutations?.prepareSubmitWork).toBeDefined();
    expect(mutations?.requestChanges).toBeDefined();
  }, 60_000);
});
