import { createYoga } from "graphql-yoga";
import { describe, expect, it, vi } from "vitest";

const UNLINK = JSON.stringify({ query: "mutation { unlinkGithub { id isGithubVerified } }" });

async function unlink(user: { id: string } | null, update: ReturnType<typeof vi.fn>) {
  const { schema } = await import("../graphql/schema");
  // Test-only: vitest loads a second graphql copy, so yoga would mask our GraphQLError as an internal error.
  const yoga = createYoga({
    schema,
    maskedErrors: false,
    context: () => ({ user, db: { user: { update } } }) as never,
  });
  const response = await yoga.fetch("http://localhost/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: UNLINK,
  });
  return response.json() as Promise<{ errors?: { extensions?: { code?: string } }[] }>;
}

describe("unlinkGithub mutation", () => {
  it("clears the GitHub link of the signed-in user", async () => {
    const update = vi.fn(async () => ({ id: "user-1", isGithubVerified: false }));

    const body = await unlink({ id: "user-1" }, update);

    expect(body.errors).toBeUndefined();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "user-1" },
      data: { githubId: null, githubUsername: null, githubAccessTokenEncrypted: null, isGithubVerified: false },
    }));
  }, 60_000);

  it("requires a signed-in user", async () => {
    const update = vi.fn();

    const body = await unlink(null, update);

    expect(body.errors?.[0]?.extensions?.code).toBe("UNAUTHORIZED");
    expect(update).not.toHaveBeenCalled();
  }, 60_000);
});
