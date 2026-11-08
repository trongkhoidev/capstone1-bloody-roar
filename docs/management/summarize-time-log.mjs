// Summarize docs/management/time-log.csv for TEAM_EVIDENCE.md section 6.
// Usage:
//   bun docs/management/summarize-time-log.mjs           print the summary
//   bun docs/management/summarize-time-log.mjs --write   also update the block in TEAM_EVIDENCE.md
//   bun docs/management/summarize-time-log.mjs --csv <p> read another file (testing only, no --write)
// CSV columns: date,member,hours,evidence,activity
//   date      YYYY-MM-DD, on or after 2026-08-18
//   member    khoi | kien | hieu | han | tram
//   hours     more than 0 and at most 12 per row
//   evidence  commit hash, PR number or doc path. No commas. May be empty.
//   activity  free text. Commas are allowed after the fourth field.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const hasCsvFlag = argv.includes("--csv");
const write = argv.includes("--write");
const csvPath = hasCsvFlag ? argv[argv.indexOf("--csv") + 1] : join(dir, "time-log.csv");
const docPath = join(dir, "TEAM_EVIDENCE.md");
const START = "<!-- time-summary:start -->";
const END = "<!-- time-summary:end -->";
const HEADER = "date,member,hours,evidence,activity";
const FIRST_DAY = "2026-08-18";
const MEMBERS = {
  khoi: "Nguyen Trong Khoi",
  kien: "Nguyen Huu Tam Kien",
  hieu: "Do Van Hieu",
  han: "Doan Thi Ngoc Han",
  tram: "Nguyen Thi Bao Tram",
};

if (write && hasCsvFlag) {
  console.error("--write works only with the default CSV path");
  process.exit(1);
}

const isDate = (s) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
const mondayOf = (s) => {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const round = (n) => Math.round(n * 100) / 100;

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/);
const errors = [];
if (lines[0].trim() !== HEADER) errors.push(`line 1: header must be "${HEADER}"`);

const rows = [];
lines.slice(1).forEach((raw, i) => {
  if (!raw.trim()) return;
  const n = i + 2;
  const [date, member, hoursRaw, evidence = "", ...rest] = raw.split(",");
  const hours = Number(hoursRaw);
  if (!isDate(date) || date < FIRST_DAY) errors.push(`line ${n}: date must be YYYY-MM-DD on or after ${FIRST_DAY}`);
  if (!Object.hasOwn(MEMBERS, member)) errors.push(`line ${n}: unknown member "${member}"`);
  if (!(hours > 0 && hours <= 12)) errors.push(`line ${n}: hours must be more than 0 and at most 12`);
  if (rest.join(",").trim() === "") errors.push(`line ${n}: activity is missing`);
  rows.push({ date, member, hours, hasEvidence: evidence.trim() !== "" });
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const block = [];
if (rows.length === 0) {
  block.push("No entries recorded yet.");
} else {
  const byMember = {};
  const byWeek = {};
  let totalHours = 0;
  let totalNoEvidence = 0;
  for (const r of rows) {
    const m = (byMember[r.member] ??= { entries: 0, hours: 0, noEvidence: 0 });
    m.entries += 1;
    m.hours += r.hours;
    if (!r.hasEvidence) {
      m.noEvidence += 1;
      totalNoEvidence += 1;
    }
    const w = mondayOf(r.date);
    byWeek[w] = (byWeek[w] ?? 0) + r.hours;
    totalHours += r.hours;
  }
  block.push("| Member | Entries | Hours | Entries without evidence |", "|---|---|---|---|");
  for (const id of Object.keys(MEMBERS)) {
    const m = byMember[id] ?? { entries: 0, hours: 0, noEvidence: 0 };
    block.push(`| ${MEMBERS[id]} | ${m.entries} | ${round(m.hours)} | ${m.noEvidence} |`);
  }
  block.push(`| **Total** | ${rows.length} | ${round(totalHours)} | ${totalNoEvidence} |`);
  block.push("", "| Week starting (Monday) | Hours |", "|---|---|");
  for (const w of Object.keys(byWeek).sort()) block.push(`| ${w} | ${round(byWeek[w])} |`);
}

const out = block.join("\n");
console.log(out);

if (write) {
  const doc = readFileSync(docPath, "utf8");
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a < 0 || b < a) {
    console.error("time-summary markers not found in TEAM_EVIDENCE.md");
    process.exit(1);
  }
  writeFileSync(docPath, doc.slice(0, a + START.length) + "\n" + out + "\n" + doc.slice(b));
  console.error(`updated ${docPath}`);
}
