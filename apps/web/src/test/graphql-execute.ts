import { createYoga } from "graphql-yoga";
import type { schema as AppSchema } from "../graphql/schema";

export type GraphQLResult = {
  data?: Record<string, unknown> | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
};

let schema: typeof AppSchema | undefined;

// Import schema chậm (~12 giây lần đầu), nên gọi trong beforeAll với timeout dài
export async function loadSchema() {
  schema ??= (await import("../graphql/schema")).schema;
}

// Chạy qua Yoga như route thật. Tắt mask để giữ extensions.code: vitest nạp hai bản graphql,
// nên Yoga không nhận ra GraphQLError từ gqlError và che lỗi thành INTERNAL_SERVER_ERROR.
export async function execute(
  query: string,
  contextValue: { user: unknown; db: unknown },
  variables?: Record<string, unknown>,
): Promise<GraphQLResult> {
  if (!schema) throw new Error("gọi loadSchema() trong beforeAll trước");
  const yoga = createYoga({
    schema,
    context: () => contextValue,
    logging: false,
    maskedErrors: false,
  });
  const response = await yoga.fetch("http://localhost/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  return response.json() as Promise<GraphQLResult>;
}
