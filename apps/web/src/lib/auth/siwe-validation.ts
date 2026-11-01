import { z } from "zod";

export type SiweValidationContext = {
  domain: string;
  uri: string;
  chainId: string;
  now?: Date;
};

const SiweLoginSchema = z.object({
  payload: z.object({
    type: z.literal("evm"),
    domain: z.string().min(1),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    statement: z.string(),
    version: z.literal("1"),
    uri: z.string().url(),
    chain_id: z.string().regex(/^\d+$/),
    nonce: z.string().min(8).max(128),
    issued_at: z.string().datetime({ message: "Invalid Issued At timestamp" }),
    expiration_time: z.string().datetime({ message: "Invalid Expiration Time timestamp" }),
    invalid_before: z.string().datetime({ message: "Invalid Not Before timestamp" }),
    resources: z.array(z.string().url()).optional(),
  }).strict(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
}).strict();

export function validateSiwePayload(
  signed: unknown,
  context: SiweValidationContext,
): z.infer<typeof SiweLoginSchema> {
  const parsed = SiweLoginSchema.parse(signed);
  const { payload } = parsed;
  if (payload.domain !== context.domain) throw new Error("Invalid SIWE domain");
  if (payload.uri !== context.uri) throw new Error("Invalid SIWE URI");
  if (payload.chain_id !== context.chainId) throw new Error("Invalid SIWE chain");

  const now = context.now ?? new Date();
  const issuedAt = new Date(payload.issued_at);
  const expiresAt = new Date(payload.expiration_time);
  const invalidBefore = new Date(payload.invalid_before!);
  if (Number.isNaN(issuedAt.getTime())) throw new Error("Invalid Issued At timestamp");
  if (issuedAt > now) throw new Error("Issued At cannot be in the future");
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) throw new Error("Login request has expired");
  if (Number.isNaN(invalidBefore.getTime()) || invalidBefore > now) throw new Error("Login request is not yet valid");
  return parsed;
}
