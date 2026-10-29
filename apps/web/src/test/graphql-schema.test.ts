import { describe, expect, it } from "vitest";

describe("GraphQL schema", () => {
  it("builds without duplicate fields", async () => {
    const { schema } = await import("../graphql/schema");

    expect(schema.getQueryType()?.getFields().user).toBeDefined();
  }, 60_000);
});
