import { describe, expect, it } from "vitest";
import { schema } from "../graphql/schema";

const admin = { id: "admin-1", role: "ADMIN", walletAddress: "0xadmin" };
const party = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };
const dispute = { id: "d-1", aiReport: { summary: "Client gave clear acceptance tests." } };

// Reads the aiReport field resolver directly; the GraphQL engine instance differs between test and schema modules.
function readAiReport(user: unknown, parent: unknown) {
  const type = schema.getType("Dispute") as unknown as {
    getFields(): Record<string, { resolve?: (...args: unknown[]) => unknown }>;
  };
  const resolve = type.getFields().aiReport?.resolve;
  if (!resolve) throw new Error("no aiReport resolver");
  return resolve(parent, {}, { user }, {});
}

describe("aiReport visibility (AI-11)", () => {
  it("returns the advisory analysis to the arbiter", () => {
    expect(readAiReport(admin, dispute)).toBe(JSON.stringify(dispute.aiReport));
  });

  it("hides the advisory analysis from a party to the task", () => {
    expect(readAiReport(party, dispute)).toBeNull();
  });

  it("hides it from anonymous viewers too", () => {
    expect(readAiReport(null, dispute)).toBeNull();
  });
});
