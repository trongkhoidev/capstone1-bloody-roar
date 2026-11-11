import { describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const { completeAI } = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../ai/model-router")),
  completeAI,
}));

const client = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };
const repo = "https://github.com/acme/checkout";
const draft = (title: string) => ({
  title,
  description: "A checkout attempt with an expired card is declined.",
  given: "a signed-in client with a cart",
  when: "they pay with an expired card",
  then: "the payment is declined and the cart is kept",
  priority: "NORMAL",
  isEdgeCase: false,
});

// Calls a mutation resolver directly; the GraphQL engine instance differs between test and schema modules.
function callGenerate(db: unknown) {
  const field = schema.getMutationType()?.getFields().generateTestCases;
  if (!field?.resolve) throw new Error("no resolver for generateTestCases");
  return field.resolve({} as never, { issueId: "issue-1" }, { db, user: client } as never, {} as never);
}

describe("generateTestCases context (AI-10)", () => {
  it("sends the task's GitHub repository to the model and stores the drafts unapproved", async () => {
    completeAI.mockResolvedValueOnce({
      text: JSON.stringify({ testCases: [draft("Expired card"), draft("Cart kept"), draft("Retry allowed")] }),
    });
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      testCase: {
        deleteMany: vi.fn((_args: unknown) => Promise.resolve({ count: 0 })),
        createMany: vi.fn((args: { data: Array<Record<string, unknown>> }) => {
          created.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        }),
        findMany: vi.fn((_args: unknown) => Promise.resolve([])),
      },
    };
    const db = {
      issue: {
        findUnique: vi.fn((_args: unknown) =>
          Promise.resolve({
            id: "issue-1",
            clientId: "client-1",
            status: "OPEN",
            title: "Checkout",
            description: "Card payments for the checkout flow.",
            category: "FEATURE",
            requiredSkills: ["TypeScript"],
            githubRepo: repo,
          }),
        ),
      },
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };

    await callGenerate(db);

    const userMessage = completeAI.mock.calls[0]?.[0].messages[1].content as string;
    expect(userMessage).toContain(repo);
    expect(created).toHaveLength(3);
    expect(created.every((row) => row.source === "AI" && row.isApproved === false)).toBe(true);
  });
});
