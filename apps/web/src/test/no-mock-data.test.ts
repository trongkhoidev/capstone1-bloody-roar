import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["components", "app"].map((dir) => join(process.cwd(), "src", dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = join(dir, name);
    if (statSync(fullPath).isDirectory()) {
      return name === "test" || name === "node_modules" || name === "generated" ? [] : sourceFiles(fullPath);
    }
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [fullPath] : [];
  });
}

const FORBIDDEN_STRINGS = [
  "MOCK_ISSUES",
  "SAMPLE_COMMENTS",
  "RECENT_ACTIVITIES",
  "demoMode",
  "mock-issues",
  "184,320",
  "128,450",
];

describe("no mock data in frontend components and app pages", () => {
  it("does not contain any mock strings or demo flags", () => {
    const files = roots.flatMap(sourceFiles);
    expect(files.length).toBeGreaterThan(0);

    const violations: Array<{ file: string; forbidden: string }> = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_STRINGS) {
        if (content.includes(forbidden)) {
          violations.push({ file: file.replace(process.cwd(), ""), forbidden });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
