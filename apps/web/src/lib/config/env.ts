// apps/web/src/lib/config/env.ts
// Validated server env. lib/env.ts loads the root .env; server.ts imports it before this module is first read.

import { z } from "zod";

const PRODUCTION_REQUIRED = ["DATABASE_URL", "AI_HASH_KEY"] as const;

const schema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    AI_HASH_KEY: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") return;
    for (const key of PRODUCTION_REQUIRED) {
      if (!value[key]) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: "required in production" });
      }
    }
  });

export type AppEnv = z.infer<typeof schema>;

// Throws with every failing variable name, so a bad deploy stops at boot.
export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment: ${details.join("; ")}`);
  }
  return result.data;
}

export const env: AppEnv = parseEnv(process.env);
