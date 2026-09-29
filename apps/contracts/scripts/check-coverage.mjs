import { readFile } from "node:fs/promises";

const coverage = JSON.parse(await readFile(new URL("../coverage.json", import.meta.url), "utf8"));

const counters = {
  statements: [],
  branches: [],
  functions: [],
  lines: [],
};

for (const file of Object.values(coverage)) {
  counters.statements.push(...Object.values(file.s));
  counters.functions.push(...Object.values(file.f));
  counters.branches.push(...Object.values(file.b).flat());

  const lineHits = new Map();
  for (const [statementId, location] of Object.entries(file.statementMap)) {
    lineHits.set(location.start.line, file.s[statementId]);
  }
  counters.lines.push(...lineHits.values());
}

const summary = Object.fromEntries(
  Object.entries(counters).map(([metric, hits]) => {
    const covered = hits.filter((hit) => hit > 0).length;
    const pct = hits.length === 0 ? 100 : Math.floor((covered / hits.length) * 10_000) / 100;
    return [metric, { pct }];
  }),
);

const minimums = {
  lines: 95,
  statements: 95,
  functions: 95,
  branches: 90,
};

const failures = Object.entries(minimums).filter(
  ([metric, minimum]) => summary[metric].pct < minimum,
);

if (failures.length > 0) {
  for (const [metric, minimum] of failures) {
    console.error(`${metric}: ${summary[metric].pct}% (required: ${minimum}%)`);
  }
  process.exitCode = 1;
} else {
  console.log(
    Object.keys(minimums)
      .map((metric) => `${metric}=${summary[metric].pct}%`)
      .join(" "),
  );
}
