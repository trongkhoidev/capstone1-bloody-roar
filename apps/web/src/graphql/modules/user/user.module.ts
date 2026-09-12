import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { parseOrThrow } from "../../errors";
import { z } from "zod";

// Zod validation schemas
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  bio: z.string().max(200).optional(),
});

export const UserRef = builder.prismaObject("User", {
  fields: (t) => ({
    id: t.exposeID("id"),
    walletAddress: t.exposeString("walletAddress"),
    role: t.string({ resolve: (user) => user.role }),
    name: t.exposeString("name", { nullable: true }),
    avatar: t.exposeString("avatar", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    skills: t.exposeStringList("skills"),
    location: t.exposeString("location", { nullable: true }),
    reputationScore: t.exposeFloat("reputationScore"),
    completedTaskCount: t.exposeInt("completedTaskCount"),
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
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      return ctx.db.user.findUnique({
        ...query,
        where: { id: args.id },
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
      bio: t.input.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);

      // Validate with Zod
      const validated = parseOrThrow(UpdateProfileSchema, {
        name: args.input.name ?? undefined,
        bio: args.input.bio ?? undefined,
      });

      return ctx.db.user.update({
        ...query,
        where: { id: user.id },
        data: {
          ...(validated.name !== undefined && { name: validated.name }),
          ...(validated.bio !== undefined && { bio: validated.bio }),
        },
      });
    },
  })
);
