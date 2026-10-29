import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../lib/api-client";
import { graphqlRequest } from "../lib/graphql-client";

describe("frontend API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends GraphQL requests through the cookie-enabled Axios client", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValueOnce({ data: { data: { me: { id: "user-1" } } } } as never);
    const signal = new AbortController().signal;

    await expect(
      graphqlRequest<{ me: { id: string } }>("query { me { id } }", {}, signal),
    ).resolves.toEqual({ me: { id: "user-1" } });

    expect(apiClient.defaults.withCredentials).toBe(true);
    expect(post).toHaveBeenCalledWith(
      "/api/graphql",
      { query: "query { me { id } }", variables: {} },
      { signal },
    );
  });

  it("preserves GraphQL error codes for frontend callers", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValueOnce({
      data: {
        errors: [
          {
            message: "You cannot access this issue.",
            extensions: { code: "FORBIDDEN" },
          },
        ],
      },
    } as never);

    await expect(graphqlRequest("query { issue(id: \"issue-1\") { id } }"))
      .rejects.toMatchObject({
        name: "GraphQLRequestError",
        code: "FORBIDDEN",
        message: "You cannot access this issue.",
      });
  });
});
