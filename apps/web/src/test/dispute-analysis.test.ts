import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", () => ({ completeAI: mock.completeAI }));
import { schema } from "../graphql/schema";

const admin = { id: "admin-1", role: "ADMIN" };
const dispute = {
  id: "dispute-1", status: "OPEN", aiStatus: null, reason: "Work is disputed", createdAt: new Date(),
  issue: { id: "issue-1", title: "Task title", description: "Task description", category: "BUG_FIX", requiredSkills: [], clientId: "client", developerId: "developer", messages: [], submissions: [], testCases: [] },
};

function callAnalysis() {
  const db = { dispute: {
    findUnique: vi.fn().mockResolvedValue(dispute),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue(dispute),
  } };
  const field = schema.getMutationType()?.getFields().analyzeDispute;
  if (!field?.resolve) throw new Error("analyzeDispute resolver missing");
  return { db, result: field.resolve({} as never, { issueId: "issue-1" }, { db, user: admin } as never, {} as never) };
}

beforeEach(() => {
  mock.completeAI.mockReset();
  mock.completeAI.mockResolvedValue({ model: "mock", provider: "custom", text: JSON.stringify({
    summary: "The supplied evidence was reviewed for this dispute.", suggestedClientRatio: 50, confidenceScore: 0.5,
    findings: [{ evidenceType: "TASK", evidenceId: "issue-1", side: "NEUTRAL", finding: "The task states the requested work." }, { evidenceType: "TASK", evidenceId: "unknown", side: "NEUTRAL", finding: "This evidence should be discarded." }],
    missingEvidence: [], reasoning: "The evidence is incomplete and a human must make the final decision.",
  }) });
});

describe("advisory dispute analysis", () => {
  it("stores a report with verified citations without changing dispute status", async () => {
    const { db, result } = callAnalysis();
    await expect(result).resolves.toMatchObject({ id: dispute.id });
    const updates = db.dispute.updateMany.mock.calls.map(([input]) => input);
    expect(updates).toHaveLength(2);
    expect(updates.every((update) => !("status" in update.data))).toBe(true);
    expect(updates[0].data.aiStatus).toBe("ANALYZING");
    expect(updates[1].data.aiStatus).toBe("COMPLETED");
    expect(updates[1].data.aiReport.findings).toHaveLength(1);
  });

  it("clears the AI lock on failure without changing dispute status", async () => {
    mock.completeAI.mockRejectedValue(new Error("mock failed"));
    const { db, result } = callAnalysis();
    await expect(result).rejects.toThrow("mock failed");
    expect(db.dispute.updateMany.mock.calls[1]![0].data).toEqual({ aiStatus: "FAILED" });
  });
});
