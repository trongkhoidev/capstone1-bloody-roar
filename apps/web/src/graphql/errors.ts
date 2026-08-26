// apps/web/src/graphql/errors.ts
// GraphQL errors chuẩn hoá — message không bị Yoga mask, kèm `extensions.code`
// để FE phân loại lỗi (UNAUTHORIZED / BAD_USER_INPUT / ...)

import { GraphQLError } from "graphql";

export function gqlError(
  message: string,
  code: string,
  details?: unknown
): GraphQLError {
  return new GraphQLError(message, {
    extensions: {
      code,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

/** Parse Zod — throw BAD_USER_INPUT kèm chi tiết field lỗi nếu invalid */
export function parseOrThrow<T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } },
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw gqlError(
      "Dữ liệu đầu vào không hợp lệ",
      "BAD_USER_INPUT",
      result.error.flatten()
    );
  }
  return result.data;
}
