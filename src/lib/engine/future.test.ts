// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAssume, MONTHS, moneyState, runsOut, savingsPath, savingsWords } from "./future.ts";

const { a } = defaultAssume({}, true);

test("F01: a 15% pay cut on 60% of household income saves less than staying", () => {
  const A = savingsPath(a, 0), B = savingsPath(a, -15);
  assert.equal(A.length, 61);
  assert.ok(A[60] > B[60]);
  assert.equal(Math.round(A[60]), 8);
  assert.equal(Math.round(B[60]), 2);
});

test("F02: 6% prices make the cut life run out in year 4; staying holds", () => {
  assert.equal(runsOut(savingsPath(a, -15, "prices")), 42);
  assert.equal(runsOut(savingsPath(a, 0, "prices")), null);
  assert.match(savingsWords(savingsPath(a, -15, "prices")), /month 42 \(year 4\)/);
});

test("F03: the user's own savings are tagged 'you', the rest are guesses", () => {
  const d = defaultAssume({ savingsMonths: 9 }, false);
  assert.equal(d.a.savingsMonths, 9);
  assert.equal(d.src.savingsMonths, "you");
  assert.equal(d.a.share, 100);
  assert.equal(d.src.cover, "guess");
});

test("F04: dollars appear only when the user gave monthly costs", () => {
  assert.doesNotMatch(savingsWords(savingsPath(a, 0)), /\$/);
  assert.match(savingsWords(savingsPath(a, 0), 7000), /\$/);
});

test("F05: money state is decided in code per life", () => {
  assert.equal(moneyState(savingsPath(a, 0)).level, "comfortable");
  assert.equal(moneyState(savingsPath(a, -15)).level, "tight");
  assert.equal(moneyState(savingsPath(a, -15, "prices")).level, "short");
});

test("F06: a life with higher costs saves less, a cheaper one more; no change keeps the old path", () => {
  const same = savingsPath(a, 0);
  assert.deepEqual(savingsPath(a, 0, "none", MONTHS, 0), same);
  assert.ok(savingsPath(a, 0, "none", MONTHS, 20)[MONTHS] < same[MONTHS]);
  assert.ok(savingsPath(a, 0, "none", MONTHS, -20)[MONTHS] > same[MONTHS]);
});
