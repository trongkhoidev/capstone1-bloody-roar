import { builder } from "../../builder";

const SkillRef = builder.objectRef<{ id: string; name: string; category: string }>("Skill").implement({
  fields: (t) => ({ id: t.exposeID("id"), name: t.exposeString("name"), category: t.exposeString("category") }),
});

// Public: powers the autocomplete on the bounty form. Names starting with the query rank first.
builder.queryField("skills", (t) =>
  t.field({
    type: [SkillRef],
    args: { query: t.arg.string({ required: false }), first: t.arg.int({ required: false }) },
    resolve: async (_root, args, ctx) => {
      const q = (args.query ?? "").trim().slice(0, 40);
      const take = Math.min(Math.max(args.first ?? 8, 1), 50);
      const rows = await ctx.db.skill.findMany({
        where: q ? { name: { contains: q, mode: "insensitive" } } : {},
        orderBy: { name: "asc" },
        take: q ? 50 : take,
      });
      if (!q) return rows;
      const lower = q.toLowerCase();
      return rows.sort((a, b) => Number(b.name.toLowerCase().startsWith(lower)) - Number(a.name.toLowerCase().startsWith(lower))).slice(0, take);
    },
  }),
);
