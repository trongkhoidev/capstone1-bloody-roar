import { createSchema, createYoga } from "graphql-yoga";
import { afterEach, describe, expect, it, vi } from "vitest";
import { guardsPlugin, MAX_ALIASES, MAX_QUERY_DEPTH } from "../graphql/yoga-guards";

const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query { hello: String node: Node }
    type Node { child: Node value: Int }
  `,
  resolvers: { Query: { hello: () => "hi", node: () => ({ value: 1 }) }, Node: { child: () => ({ value: 1 }) } },
});

// Test-only: vitest loads a second graphql copy, so yoga would mask the rule's errors.
const yoga = createYoga({ schema, plugins: [guardsPlugin], maskedErrors: false, graphiql: false, logging: false });

async function run(query: string, contentType = "application/json") {
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify({ query }),
  });
  return { status: response.status, body: (await response.json()) as { errors?: { message: string }[] } };
}

// A chain of `fields` fields: node { child { ... value } }
function chainQuery(fields: number) {
  const names = ["node", ...Array.from({ length: fields - 2 }, () => "child")];
  return `{ ${names.map((name) => `${name} {`).join(" ")} value ${"}".repeat(names.length)} }`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GraphQL guards", () => {
  it("rejects a POST that is not JSON", async () => {
    const response = await yoga.fetch("http://localhost/graphql", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{ hello }",
    });
    expect(response.status).toBe(415);
  });

  it("allows a query exactly at the depth limit", async () => {
    const { body } = await run(chainQuery(MAX_QUERY_DEPTH));
    expect(body.errors).toBeUndefined();
  });

  it("rejects a query one level past the depth limit", async () => {
    const { body } = await run(chainQuery(MAX_QUERY_DEPTH + 1));
    expect(body.errors?.[0]?.message).toMatch(/depth/);
  });

  it("rejects more aliases than allowed", async () => {
    const aliases = Array.from({ length: MAX_ALIASES + 1 }, (_, i) => `a${i}: hello`).join(" ");
    const { body } = await run(`{ ${aliases} }`);
    expect(body.errors?.[0]?.message).toMatch(/aliases/);
  });

  it("serves introspection outside production", async () => {
    const { body } = await run("{ __schema { queryType { name } } }");
    expect(body.errors).toBeUndefined();
  });

  it("blocks introspection in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { body } = await run("{ __schema { queryType { name } } }");
    expect(body.errors?.length).toBeGreaterThan(0);
  });
});
