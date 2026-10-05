"use client";

export interface GraphQLIssue {
  message: string;
  extensions?: { code?: string; details?: unknown };
}

export class GraphQLRequestError extends Error {
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(issue: GraphQLIssue) {
    super(issue.message);
    this.name = "GraphQLRequestError";
    this.code = issue.extensions?.code;
    this.details = issue.extensions?.details;
  }
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    cache: "no-store",
    ...(signal ? { signal } : {}),
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.errors?.[0]?.message ?? "Không thể kết nối máy chủ.");
  }
  if (payload?.errors?.length) {
    throw new GraphQLRequestError(payload.errors[0] as GraphQLIssue);
  }
  if (!payload?.data) throw new Error("Phản hồi GraphQL không hợp lệ.");
  return payload.data as T;
}
