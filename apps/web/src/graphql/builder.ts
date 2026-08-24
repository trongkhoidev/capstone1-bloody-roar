import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
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
  plugins: [PrismaPlugin, WithInputPlugin],
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
// builder.subscriptionType({
//   description: "Bloody-Roar GraphQL Subscription Root",
// });
