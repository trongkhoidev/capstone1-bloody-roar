import { z } from "zod";

export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(50).nullable().optional(),
  email: z.string().trim().max(254).transform((value) => value === "" ? null : value.toLowerCase()).pipe(z.string().email().nullable()).nullable().optional(),
  bio: z.string().max(200).nullable().optional(),
  avatar: z.string().url().max(500).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Avatar URL must use HTTP or HTTPS").nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  location: z.string().trim().max(80).nullable().optional(),
  role: z.enum(["CLIENT", "DEVELOPER"]).optional(),
});

export type ProfileInput = z.input<typeof ProfileInputSchema>;
export type NormalizedProfileInput = z.output<typeof ProfileInputSchema>;

export function normalizeProfileInput(input: ProfileInput): NormalizedProfileInput {
  return ProfileInputSchema.parse(input);
}

export function isEmailConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") {
    return false;
  }
  const meta = "meta" in error && typeof error.meta === "object" && error.meta !== null
    ? error.meta
    : null;
  const target = meta && "target" in meta ? meta.target : undefined;
  return Array.isArray(target) && target.includes("email");
}
