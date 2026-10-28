import { prisma } from "@bloody-roar/database";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../../app/api/graphql/route";

function graphql(query: string) {
  const request = new Request("http://localhost:4000/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return POST(request, { request });
}

describe("GraphQL route against Postgres", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("answers an anonymous query through the real route", async () => {
    const response = await graphql("{ hello }");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { hello: expect.any(String) } });
  });

  it("reads a user row from the database", async () => {
    const walletAddress = `0x${"ab".repeat(20)}`;
    const user = await prisma.user.create({ data: { walletAddress } });
    try {
      const response = await graphql(`{ user(id: "${user.id}") { walletAddress } }`);
      expect(await response.json()).toEqual({ data: { user: { walletAddress } } });
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
