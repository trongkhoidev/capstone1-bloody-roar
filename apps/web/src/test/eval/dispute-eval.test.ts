import { beforeAll, describe, expect, it, vi } from "vitest";
import { completeAI } from "../../ai/model-router";
import { execute, loadSchema } from "../graphql-execute";

// The model is replaced; everything after it (parsing, citation checks, persistence) is the real analyzeDispute path.
vi.mock("../../ai/model-router", () => ({ completeAI: vi.fn() }));

const ANALYZE = `mutation($issueId: String!) { analyzeDispute(issueId: $issueId) { id } }`;
const admin = { id: "admin-eval", role: "ADMIN", name: null, isBanned: false };
const fixtures = import.meta.glob<Fixture>("./dispute/*.json", { eager: true, import: "default" });

type Fixture = {
  name: string;
  dispute: { id: string; issue: { id: string } } & Record<string, unknown>;
  mockResponse: { findings: unknown[] } & Record<string, unknown>;
  expect: { minClientBps: number; maxClientBps: number; validCitations: number; droppedCitations: number };
};

// Fixtures store dates as ISO strings; the resolver expects Date objects from Prisma.
function hydrate<T>(value: T): T {
  if (Array.isArray(value)) return value.map(hydrate) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /At$/.test(key) && typeof item === "string" ? new Date(item) : hydrate(item)])) as T;
  }
  return value;
}

function fakeDb(dispute: { id: string }) {
  return {
    dispute: {
      findUnique: vi.fn().mockResolvedValue(dispute),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: dispute.id }),
    },
    aILog: { create: vi.fn().mockResolvedValue({}) },
  };
}

beforeAll(loadSchema, 60_000);

describe.each(Object.keys(fixtures).sort())("dispute eval %s", (file) => {
  it("parses the report, keeps only cited evidence that exists, and logs the call", async () => {
    const fixture = hydrate(fixtures[file]!);
    const db = fakeDb(fixture.dispute);
    vi.mocked(completeAI).mockResolvedValueOnce({
      text: JSON.stringify(fixture.mockResponse),
      model: "eval-model",
      provider: "eval-provider",
      latencyMs: 1,
      promptTokens: 10,
      completionTokens: 10,
      status: "SUCCESS",
    });

    const result = await execute(ANALYZE, { user: admin, db }, { issueId: fixture.dispute.issue.id });

    expect(result.errors).toBeUndefined();
    const completed = db.dispute.updateMany.mock.calls.map((call) => call[0].data).find((data) => data.aiStatus === "COMPLETED");
    expect(completed?.suggestedClientBps).toBeGreaterThanOrEqual(fixture.expect.minClientBps);
    expect(completed?.suggestedClientBps).toBeLessThanOrEqual(fixture.expect.maxClientBps);
    const report = completed?.aiReport as { findings: unknown[] };
    expect(report.findings).toHaveLength(fixture.expect.validCitations);
    expect(fixture.mockResponse.findings.length - report.findings.length).toBe(fixture.expect.droppedCitations);
    expect(db.aILog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ task: "DEBATE", status: "SUCCESS" }) }));
  });
});
