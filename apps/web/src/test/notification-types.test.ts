import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NotificationType } from "@bloody-roar/database";

// Vitest runs from apps/web, so the sibling worker sources sit one level up.
const roots = [resolve(process.cwd(), "src"), resolve(process.cwd(), "../worker/src")];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" || name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const source = roots.flatMap(sourceFiles).map((file) => readFileSync(file, "utf8")).join("\n");

// Every notification type must have a creation site, so no type can be defined but never sent.
describe("notification types", () => {
  it.each(Object.keys(NotificationType))("%s is created somewhere in the app or worker", (type) => {
    const created = source.includes(`"${type}"`) || source.includes(`NotificationType.${type}`);
    expect(created, `${type} has no creation site`).toBe(true);
  });
});
