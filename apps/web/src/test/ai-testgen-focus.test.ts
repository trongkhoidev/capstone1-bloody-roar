import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";
import { client } from "./helpers/users";

const { completeAI, aiRateLimit } = vi.hoisted(() => ({ completeAI: vi.fn(), aiRateLimit: vi.fn() }));
vi.mock("../ai/model-router", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../ai/model-router")),
  completeAI,
}));
vi.mock("../lib/rate-limit", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../lib/rate-limit")),
  aiRateLimit,
}));

const secret = ["sk-", "abcdefghijklmnopqrstuvwxyz012345"].join("");
const fileTree = [{ path: "src/cart.ts", size: 10 }, { path: "src/pay.ts", size: 10 }, { path: "src/a.ts", size: 1 }, { path: "src/b.ts", size: 1 }];

function db(snapshot: Record<string, unknown> | null = { status: "READY", framework: "VITEST", context: "src/cart.ts", fileTree }) {
  return {
    issue: { findUnique: async () => ({ id: "issue-1", clientId: client.id, status: "OPEN", title: "Cart", description: "Cart totals", requiredSkills: [] }) },
    sourceSnapshot: { findUnique: async () => snapshot },
  };
}

function callGenerate(args: Record<string, unknown>, database: unknown = db()) {
  const field = schema.getMutationType()?.getFields().generateTestCases;
  if (!field?.resolve) throw new Error("no resolver for generateTestCases");
  return field.resolve({} as never, { issueId: "issue-1", ...args }, { db: database, user: client } as never, {} as never);
}

async function rejectsBadInput(args: Record<string, unknown>, database?: unknown) {
  await expect(callGenerate(args, database)).rejects.toMatchObject({ extensions: { code: "BAD_USER_INPUT" } });
  expect(completeAI).not.toHaveBeenCalled();
  expect(aiRateLimit).not.toHaveBeenCalled();
}

beforeEach(() => { completeAI.mockReset(); aiRateLimit.mockReset(); });

describe("generateTestCases focusFiles and hint (US-44)", () => {
  it("rejects a focus file that is not in the snapshot file tree", async () => {
    await rejectsBadInput({ focusFiles: ["src/missing.ts"] });
  });

  it.each([
    ["four files", { focusFiles: ["src/cart.ts", "src/pay.ts", "src/a.ts", "src/b.ts"] }],
    ["duplicate files", { focusFiles: ["src/cart.ts", "src/cart.ts"] }],
    ["a 501-character hint", { hint: "x".repeat(501) }],
  ])("rejects %s", async (_name, args) => {
    await rejectsBadInput(args);
  });

  it("rejects focus files when the snapshot is not READY", async () => {
    await rejectsBadInput({ focusFiles: ["src/cart.ts"] }, db({ status: "PROCESSING", fileTree }));
    await rejectsBadInput({ focusFiles: ["src/cart.ts"] }, db(null));
  });

  it("sends focus files and a masked hint to the model", async () => {
    completeAI.mockRejectedValueOnce(new Error("stop after inspecting prompt"));
    await expect(callGenerate({ focusFiles: ["src/cart.ts"], hint: `  check totals, key=${secret}  ` })).rejects.toThrow();
    const prompt = completeAI.mock.calls[0]![0].messages[1].content as string;
    expect(prompt).not.toContain(secret);
    expect(JSON.parse(prompt)).toMatchObject({ focusFiles: ["src/cart.ts"], clientHint: expect.stringContaining("check totals") });
    expect(aiRateLimit).toHaveBeenCalledOnce();
  });

  it("keeps the prompt unchanged without the new arguments", async () => {
    completeAI.mockRejectedValueOnce(new Error("stop after inspecting prompt"));
    await expect(callGenerate({})).rejects.toThrow();
    const prompt = JSON.parse(completeAI.mock.calls[0]![0].messages[1].content as string);
    expect(Object.keys(prompt)).toEqual(["title", "description", "requiredSkills", "framework", "context"]);
  });
});
