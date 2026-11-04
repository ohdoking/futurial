// Where did the credits go? Reads .cache/usage.jsonl (one line per real API call). Run: npm run usage
import { readFileSync } from "node:fs";
let lines = [];
try { lines = readFileSync(".cache/usage.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { console.log("No usage yet."); process.exit(0); }
const since = process.argv[2] ? new Date(process.argv[2]) : null;
if (since) lines = lines.filter((l) => new Date(l.t) >= since);
const by = {};
for (const l of lines) {
  const k = `${l.model}${l.image ? " (image)" : ""}`;
  by[k] ??= { calls: 0, in: 0, out: 0, reasoning: 0 };
  by[k].calls++; by[k].in += l.in; by[k].out += l.out; by[k].reasoning += l.reasoning;
}
console.log(`${lines.length} real API calls${since ? ` since ${since.toISOString()}` : ""} (cached answers are not counted)\n`);
console.table(Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { ...v, "reasoning share": v.out ? `${Math.round((v.reasoning / v.out) * 100)}%` : "-" }])));
