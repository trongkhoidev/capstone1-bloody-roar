import SchemaBuilder from "@pothos/core";
import PrismaPlugin from "@pothos/plugin-prisma";
import WithInputPlugin from "@pothos/plugin-with-input";
import type PrismaTypes from "./generated/pothos-types";
import { getDatamodel } from "./generated/pothos-types";
import { prisma } from "@bloody-roar/database";
import { formatTokenAmount, parseTokenAmount } from "@bloody-roar/shared/money";
import type { GraphQLContext } from "./context";
import { gqlError } from "./errors";

// Initialize the Pothos schema builder
export const builder = new SchemaBuilder<{
  Context: GraphQLContext;
  PrismaTypes: PrismaTypes;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
  };
}>({
  plugins: [PrismaPlugin, WithInputPlugin],
  prisma: {
    client: prisma,
    // Use generated datamodel instead of internal _dmmf
    dmmf: getDatamodel(),
  },
});

// Implement DateTime scalar
builder.scalarType("DateTime", {
  serialize: (n) => (n as Date).toISOString(),
  parseValue: (n) => {
    if (typeof n === "string") return new Date(n);
    throw new Error("Invalid DateTime format");
  },
});

// Số tiền token: đầu vào là chuỗi thập phân, đầu ra có raw để tính và formatted để hiển thị
export type TokenAmountValue = {
  raw: bigint;
  decimals: number;
  symbol: string;
  formatted: string;
};

export function tokenAmount(
  raw: bigint,
  token: { decimals: number; symbol: string },
): TokenAmountValue {
  return {
    raw,
    decimals: token.decimals,
    symbol: token.symbol,
    formatted: formatTokenAmount(raw, token.decimals),
  };
}

// parseTokenAmount throw Error thường; đổi thành BAD_USER_INPUT để Yoga không che lỗi
export function parseTokenAmountInput(text: string, token: { decimals: number }): bigint {
  try {
    return parseTokenAmount(text, token.decimals);
  } catch {
    throw gqlError("Số tiền không hợp lệ", "BAD_USER_INPUT");
  }
}

export const TokenAmountRef = builder.objectRef<TokenAmountValue>("TokenAmount").implement({
  description: "Số tiền token: raw (đơn vị nhỏ nhất) và formatted (hiển thị)",
  fields: (t) => ({
    raw: t.string({ resolve: (amount) => amount.raw.toString() }),
    decimals: t.exposeInt("decimals"),
    symbol: t.exposeString("symbol"),
    formatted: t.exposeString("formatted"),
  }),
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
