import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { UserRole } from "@bloody-roar/database";
import { z } from "zod";

// Zod validation schemas
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(50).nullable().optional(),
  bio: z.string().max(200).nullable().optional(),
  avatar: z.string().url().max(500).refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Avatar URL must use HTTP or HTTPS").nullable().optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  location: z.string().max(80).nullable().optional(),
  role: z.enum([UserRole.CLIENT, UserRole.DEVELOPER]).optional(),
});

const AttestationRef = builder.prismaObject("Attestation", {
  fields: (t) => ({
    attestationUid: t.exposeString("attestationUid"),
    schemaUid: t.exposeString("schemaUid"),
    type: t.string({ resolve: (attestation) => attestation.type }),
    chainId: t.exposeInt("chainId"),
    attester: t.exposeString("attester"),
    createdAt: t.string({ resolve: (attestation) => attestation.createdAt.toISOString() }),
    revokedAt: t.string({ nullable: true, resolve: (attestation) => attestation.revokedAt?.toISOString() ?? null }),
  }),
});

export const UserRef = builder.prismaObject("User", {
  fields: (t) => ({
    id: t.exposeID("id"),
    walletAddress: t.exposeString("walletAddress"),
    role: t.string({ resolve: (user) => user.role }),
    name: t.exposeString("name", { nullable: true }),
    avatar: t.exposeString("avatar", { nullable: true }),
    isGithubVerified: t.exposeBoolean("isGithubVerified"),
    githubUsername: t.exposeString("githubUsername", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    skills: t.exposeStringList("skills"),
    location: t.exposeString("location", { nullable: true }),
    reputationScore: t.exposeFloat("reputationScore"),
    completedTaskCount: t.exposeInt("completedTaskCount"),
    attestations: t.field({
      type: [AttestationRef],
      resolve: (user, _args, ctx) => ctx.db.attestation.findMany({
        where: { developerId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    }),
  }),
});

builder.queryField("me", (t) =>
  t.prismaField({
    type: "User",
    nullable: true,
    resolve: async (query, _root, _args, ctx) => {
      if (!ctx.user) return null;
      return ctx.db.user.findUnique({
        ...query,
        where: { id: ctx.user.id },
      });
    },
  })
);

builder.queryField("user", (t) =>
  t.prismaField({
    type: "User",
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: (query, _root, args, ctx) =>
      ctx.db.user.findUnique({
        ...query,
        where: { id: String(args.id), isBanned: false },
      }),
  })
);

builder.mutationField("updateProfile", (t) =>
  t.prismaFieldWithInput({
    type: "User",
    typeOptions: { name: "UpdateProfileInput" },
    input: {
        name: t.input.string({ required: false }),
        bio: t.input.string({ required: false }),
        avatar: t.input.string({ required: false }),
        skills: t.input.stringList({ required: false }),
        location: t.input.string({ required: false }),
        role: t.input.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);

      // Validate with Zod
      const raw = Object.fromEntries(
        Object.entries(args.input).filter(([, value]) => value !== undefined)
      );
      const validated = parseOrThrow(UpdateProfileSchema, raw);
      if (validated.role && user.role === UserRole.ADMIN) {
        throw gqlError("Administrator roles cannot be changed from the profile page", "FORBIDDEN");
      }

      return ctx.db.user.update({
        ...query,
        where: { id: user.id },
        data: {
          ...(validated.name !== undefined && { name: validated.name }),
          ...(validated.bio !== undefined && { bio: validated.bio }),
          ...(validated.avatar !== undefined && { avatar: validated.avatar }),
          ...(validated.skills !== undefined && { skills: validated.skills }),
          ...(validated.location !== undefined && { location: validated.location }),
          ...(validated.role !== undefined && { role: validated.role }),
        },
      });
    },
  })
);
