"use client";

import axios from "axios";
import { apiClient } from "@/lib/api-client";

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
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await apiClient.post<{
      data?: T;
      errors?: GraphQLIssue[];
      error?: string;
    }>("/api/graphql", { query, variables }, signal ? { signal } : {});
    const payload = response.data;
    if (payload.errors?.length) {
      const issue = payload.errors[0];
      if (issue) throw new GraphQLRequestError(issue);
    }
    if (!payload.data) throw new Error("Phản hồi GraphQL không hợp lệ.");
    return payload.data;
  } catch (error) {
    if (error instanceof GraphQLRequestError) throw error;
    if (axios.isAxiosError<{ errors?: GraphQLIssue[]; error?: string }>(error)) {
      const issue = error.response?.data?.errors?.[0];
      if (issue) throw new GraphQLRequestError(issue);
      throw new Error(error.response?.data?.error ?? "Không thể kết nối máy chủ.");
    }
    throw error;
  }
}
