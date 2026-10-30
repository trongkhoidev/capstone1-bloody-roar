import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type * as GraphQL from "graphql";
import { schema } from "../graphql/schema";

// Validate with the graphql copy Pothos built the schema with; vitest can load a second copy otherwise.
const { parse, validate } = createRequire(createRequire(join(process.cwd(), "package.json")).resolve("@pothos/core"))("graphql") as typeof GraphQL;

// Every GraphQL operation written in the frontend (components, app routes, lib) must parse and validate
// against the current schema. Operations built with ${} interpolation are checked by their literal parts only.
const roots = ["components", "app", "lib"].map((dir) => join(process.cwd(), "src", dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" || name === "node_modules" || name === "generated" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const OPERATION = /`\s*((?:query|mutation|subscription)\b[\s\S]*?)`/g;

function operationsIn(file: string) {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(OPERATION)].map((match) => match[1]!).filter((source) => !source.includes("${"));
}

describe("frontend GraphQL operations", () => {
  it("parse and validate against the schema", () => {
    const problems: string[] = [];
    let checked = 0;
    for (const file of roots.flatMap(sourceFiles)) {
      for (const source of operationsIn(file)) {
        checked += 1;
        try {
          const errors = validate(schema, parse(source));
          if (errors.length) problems.push(`${file.replace(process.cwd(), "")}: ${errors[0]!.message}`);
        } catch (error) {
          problems.push(`${file.replace(process.cwd(), "")}: ${(error as Error).message}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});
