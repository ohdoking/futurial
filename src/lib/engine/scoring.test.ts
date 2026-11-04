// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Decision } from "./schema.ts";
import { autoThreshold, chanceMost, clarity, flipChance, inWords, nextMove, pointsTo, priorFromGuess, rankExperiments, stopConditions, WORDS } from "./scoring.ts";

const seed = (): Decision => JSON.parse(readFileSync(new URL("./seed-alex.json", import.meta.url), "utf8"));
const near = (a: number, b: number, tol = 0.005) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const today = new Date("2026-11-05");

test("S04: guess 3 of 5, think twice at 2 or fewer → about 1 in 3", () => {
  assert.equal(autoThreshold(3), 2);
  const p = flipChance(3, 2, 5);
  near(p, 0.357);
  assert.equal(inWords(p), "About 1 in 3");
});

test("S04: a more confident guess makes the test less likely to change your mind", () => {
  assert.ok(flipChance(4, 2, 5) < flipChance(3, 2, 5));
});

test("guess at the edges still gives a proper prior", () => {
  assert.deepEqual(priorFromGuess(0, 5), [0.5, 5]);
  assert.deepEqual(priorFromGuess(5, 5), [5, 0.5]);
  const p = flipChance(0, 0, 5);
  assert.ok(p > 0 && p < 1);
});

test("S07: 1 of 5 said yes → evidence points from about 69% to about 25% (Probably not)", () => {
  const d = seed();
  const r = pointsTo(d.experiments.find((e) => e.id === "A1")!, d.evidence.find((e) => e.id === "ev1")!)!;
  near(r.priorProb, 0.688);
  near(r.postProb, 0.254);
  assert.equal(WORDS[r.pointsTo], "Probably not");
  near(chanceMost(3, 2), 0.6875); // closed form: 1 − P(Bin(4, .5) ≥ 3) = 11/16
});

test("a yes that counts against the statement flips where the evidence points", () => {
  const d = seed();
  const e = d.experiments.find((x) => x.id === "A1")!;
  const r = pointsTo({ ...e, measure: { ...e.measure!, yesSupportsCrux: false } }, d.evidence.find((x) => x.id === "ev1")!)!;
  near(r.postProb, 0.254); // still the chance that most say yes
  assert.equal(r.flipped, true);
  assert.equal(WORDS[r.pointsTo], "Probably"); // 1 of 5 home by 6:30 → "needs late evenings" is probably true
});

test("no number without a count measure and a guess", () => {
  const d = seed();
  assert.equal(pointsTo(d.experiments.find((e) => e.id === "A2")!, d.evidence[0]), null);
});

test("S03: guardrails and ranking", () => {
  const d = seed();
  d.experiments.forEach((e) => { e.status = "candidate"; });
  const r = Object.fromEntries(rankExperiments(d.experiments).map((e) => [e.id, e]));
  assert.equal(r.A1.status, "recommended");
  assert.equal(r.A5.status, "excluded");
  assert.equal(r.A5.statusReason, "You can't undo it, so it isn't a test.");
  assert.equal(r.A4.status, "skipped");
  assert.equal(r.A2.status, "alternative");
  assert.equal(r.A3.status, "alternative"); // hypothetical never outranks a real test
  assert.equal(r.B1.status, "recommended");
});

test("photo clarity: real evidence sharpens, simulated reactions never do", () => {
  const d = seed();
  const [A, B] = d.options;
  assert.equal(clarity(A, d), "some");
  assert.equal(clarity(B, d), "none");
  const simOnly = { ...d, evidence: d.evidence.filter((e) => e.kind === "simulated_reaction") };
  assert.equal(clarity(A, simOnly), "none");
});

test("S08: not ready yet, next move tests the blurry path", () => {
  const d = seed();
  const s = stopConditions(d, today);
  assert.equal(s.ready, false);
  assert.deepEqual(s.blurry.map((o) => o.id), ["B"]);
  assert.equal(nextMove(d, today)!.id, "B1");
});

test("a close deadline makes it time to decide", () => {
  const d = { ...seed(), deadline: "2026-11-10" };
  assert.equal(stopConditions(d, today).ready, true);
});

test("ties go to the test you can count", () => {
  const d = seed();
  const base = d.experiments.find((e) => e.id === "A2")!;
  const counted = { ...base, id: "C1", measure: { type: "count" as const, n: 5, question: "?", guess: null, threshold: null, thresholdTouched: false } };
  const plain = { ...base, id: "C2", measure: null };
  const r = rankExperiments([plain, counted]);
  assert.equal(r.find((e) => e.id === "C1")!.status, "recommended");
});

test("probability words read naturally", () => {
  assert.equal(inWords(0.5), "About 1 in 2");
  assert.equal(inWords(0.119), "About 1 in 8");
  assert.equal(inWords(0.03), "Very unlikely");
});
