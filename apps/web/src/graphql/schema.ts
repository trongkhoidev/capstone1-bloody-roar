// apps/web/src/graphql/schema.ts
// GraphQL schema — built with Pothos (code-first)
// Each module lives in src/graphql/modules/*/

import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
import ZodPlugin from "@pothos/plugin-zod";
import WithInputPlugin from "@pothos/plugin-with-input";
import type PrismaTypes from "./generated/pothos-types";
import { getDatamodel } from "./generated/pothos-types";
import { prisma } from "@bloody-roar/database";
import type { GraphQLContext } from "./context";

// Initialize the Pothos schema builder
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  PrismaTypes: PrismaTypes;
}>({
  plugins: [PrismaPlugin, ZodPlugin, WithInputPlugin],
  prisma: {
    client: prisma,
    // Use generated datamodel instead of internal _dmmf
    dmmf: getDatamodel(),
  },
});

// Root Query type
builder.queryType({
  description: "Bloody-Roar GraphQL Query Root",
});

// Root Mutation type
builder.mutationType({
  description: "Bloody-Roar GraphQL Mutation Root",
});

// Root Subscription type (for future use)
builder.subscriptionType({
  description: "Bloody-Roar GraphQL Subscription Root",
});

// -----------------------------------------------------------------------
// Hello World — Sprint 0 smoke test
// -----------------------------------------------------------------------
builder.queryField("hello", (t) =>
  t.string({
    description: "Health check — returns platform greeting",
    resolve: () => "👋 Welcome to Bloody-Roar GraphQL API!",
  })
);

// -----------------------------------------------------------------------
// Load modules (each module registers its own types/queries/mutations)
// -----------------------------------------------------------------------

// Sprint 1+: uncomment as modules are built
import "./modules/user/user.module";
// import "./modules/issue/issue.module";
// import "./modules/application/application.module";
// import "./modules/escrow/escrow.module";
// import "./modules/chat/chat.module";
// import "./modules/dispute/dispute.module";
// import "./modules/notification/notification.module";
// import "./modules/analytics/analytics.module";

// Build and export the schema
export const schema = builder.toSchema();
