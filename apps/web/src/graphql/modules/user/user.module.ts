import { createHash } from "node:crypto";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { UserRole } from "@bloody-roar/database";
import { isEmailConflict, ProfileInputSchema } from "./profile-input";

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
    email: t.string({
      nullable: true,
      resolve: (profile, _args, ctx) =>
        ctx.user?.id === profile.id || ctx.user?.role === UserRole.ADMIN
          ? profile.email
          : null,
    }),
    avatar: t.exposeString("avatar", { nullable: true }),
    isGithubVerified: t.exposeBoolean("isGithubVerified"),
    githubUsername: t.exposeString("githubUsername", { nullable: true }),
    githubUrl: t.exposeString("githubUrl", { nullable: true }),
    linkedinUrl: t.exposeString("linkedinUrl", { nullable: true }),
    portfolioUrl: t.exposeString("portfolioUrl", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    skills: t.exposeStringList("skills"),
    location: t.exposeString("location", { nullable: true }),
    reputationScore: t.exposeFloat("reputationScore"),
    completedTaskCount: t.exposeInt("completedTaskCount"),
    disputesLost: t.exposeInt("disputesLost", { description: "Disputes this user raised and lost outright" }),
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

// Public people search: matches name, GitHub handle, location or a skill. Email and wallet are never searched.
builder.queryField("searchUsers", (t) =>
  t.prismaField({
    type: ["User"],
    args: { query: t.arg.string({ required: true }), first: t.arg.int({ required: false }) },
    resolve: async (query, _root, args, ctx) => {
      const q = args.query.trim().slice(0, 60);
      if (q.length < 2) return [];
      const skillHits = await ctx.db.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users WHERE "isBanned" = false AND EXISTS (
          SELECT 1 FROM unnest(skills) AS skill WHERE strpos(lower(skill), ${q.toLowerCase()}) > 0
        ) LIMIT 50
      `;
      return ctx.db.user.findMany({
        ...query,
        where: { isBanned: false, OR: [
          { name: { contains: q, mode: "insensitive" } },
          { githubUsername: { contains: q, mode: "insensitive" } },
          { location: { contains: q, mode: "insensitive" } },
          { id: { in: skillHits.map((row) => row.id) } },
        ] },
        orderBy: [{ reputationScore: "desc" }, { completedTaskCount: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(args.first ?? 4, 1), 10),
      });
    },
  })
);

builder.mutationField("unlinkGithub", (t) =>
  t.prismaField({
    type: "User",
    resolve: (query, _root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.user.update({
        ...query,
        where: { id: user.id },
        data: { githubId: null, githubUsername: null, githubAccessTokenEncrypted: null, isGithubVerified: false },
      });
    },
  })
);

builder.mutationField("updateProfile", (t) =>
  t.prismaFieldWithInput({
    type: "User",
    typeOptions: { name: "UpdateProfileInput" },
    input: {
        name: t.input.string({ required: false }),
        email: t.input.string({ required: false }),
        bio: t.input.string({ required: false }),
        avatar: t.input.string({ required: false }),
        skills: t.input.stringList({ required: false }),
        location: t.input.string({ required: false }),
        githubUrl: t.input.string({ required: false }),
        linkedinUrl: t.input.string({ required: false }),
        portfolioUrl: t.input.string({ required: false }),
        role: t.input.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);

      // Validate with Zod
      const raw = Object.fromEntries(
        Object.entries(args.input).filter(([, value]) => value !== undefined)
      );
      const validated = parseOrThrow(ProfileInputSchema, raw);
      if (validated.role && user.role === UserRole.ADMIN) {
        throw gqlError("Administrator roles cannot be changed from the profile page", "FORBIDDEN");
      }

      try {
        return await ctx.db.user.update({
          ...query,
          where: { id: user.id },
          data: {
            ...(validated.name !== undefined && { name: validated.name }),
            ...(validated.email !== undefined && { email: validated.email }),
            ...(validated.bio !== undefined && { bio: validated.bio }),
            ...(validated.avatar !== undefined && { avatar: validated.avatar }),
            ...(validated.skills !== undefined && { skills: validated.skills }),
            ...(validated.location !== undefined && { location: validated.location }),
            ...(validated.githubUrl !== undefined && { githubUrl: validated.githubUrl }),
            ...(validated.linkedinUrl !== undefined && { linkedinUrl: validated.linkedinUrl }),
            ...(validated.portfolioUrl !== undefined && { portfolioUrl: validated.portfolioUrl }),
            ...(validated.role !== undefined && { role: validated.role }),
          },
        });
      } catch (error) {
        if (isEmailConflict(error)) {
          throw gqlError("This email is already in use", "CONFLICT");
        }
        throw error;
      }
    },
  })
);

// Sessions (P1-35). The refresh hash is the SHA-256 of the JWT that the request carried; it is never exposed.
const sessionHash = (token: string) => createHash("sha256").update(token).digest("hex");

type SessionView = { id: string; userAgent: string | null; ip: string | null; createdAt: Date; expiresAt: Date; current: boolean };
const SessionRef = builder.objectRef<SessionView>("Session").implement({
  fields: (t) => ({
    id: t.id({ resolve: (session) => session.id }),
    userAgent: t.string({ nullable: true, resolve: (session) => session.userAgent }),
    ip: t.string({ nullable: true, resolve: (session) => session.ip }),
    createdAt: t.string({ resolve: (session) => session.createdAt.toISOString() }),
    expiresAt: t.string({ resolve: (session) => session.expiresAt.toISOString() }),
    current: t.boolean({ resolve: (session) => session.current }),
  }),
});

builder.queryField("mySessions", (t) =>
  t.field({
    type: [SessionRef],
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const currentHash = ctx.sessionToken ? sessionHash(ctx.sessionToken) : null;
      const rows = await ctx.db.session.findMany({
        where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        userAgent: row.userAgent,
        ip: row.ip,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        current: row.refreshHash === currentHash,
      }));
    },
  }),
);

builder.mutationFields((t) => ({
  revokeSession: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      // Only the caller's own sessions can be revoked; anything else looks like a missing session.
      const result = await ctx.db.session.updateMany({
        where: { id: String(args.id), userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) throw gqlError("Session not found", "NOT_FOUND");
      return true;
    },
  }),
  revokeOtherSessions: t.int({
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const currentHash = ctx.sessionToken ? sessionHash(ctx.sessionToken) : null;
      const result = await ctx.db.session.updateMany({
        where: { userId: user.id, revokedAt: null, ...(currentHash ? { refreshHash: { not: currentHash } } : {}) },
        data: { revokedAt: new Date() },
      });
      return result.count;
    },
  }),
}));
