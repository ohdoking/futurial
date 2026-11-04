// Futurial deterministic rules (v0.3). Same input → same output, and every number can be explained on screen.
import type { Confidence, Decision, Evidence, Experiment, Option } from "./schema.ts";

export const WORDS = ["Definitely not", "Probably not", "Not sure", "Probably", "Definitely"] as const;

// ---------- beta-binomial ----------

function lgamma(z: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const lbeta = (a: number, b: number) => lgamma(a) + lgamma(b) - lgamma(a + b);
const lchoose = (n: number, k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);

/** The user's guess of k out of n as a weak prior. 0 and n are softened so the prior stays proper. */
export function priorFromGuess(guess: number, n: number): [number, number] {
  return [Math.max(guess, 0.5), Math.max(n - guess, 0.5)];
}

/** Default "think twice" line: one fewer than the guess. */
export function autoThreshold(guess: number): number {
  return Math.max(0, guess - 1);
}

/** Chance that the result lands at or below the threshold, under the user's own guess. */
export function flipChance(guess: number, threshold: number, n: number): number {
  const [a, b] = priorFromGuess(guess, n);
  let s = 0;
  for (let k = 0; k <= threshold; k++) s += Math.exp(lchoose(n, k) + lbeta(k + a, n - k + b) - lbeta(a, b));
  return s;
}

/** P(rate ≥ 0.5) for Beta(a, b): the chance that "most" would say yes. */
export function chanceMost(a: number, b: number): number {
  const steps = 4000, h = 0.5 / steps, lb = lbeta(a, b);
  let s = 0;
  for (let i = 0; i < steps; i++) {
    const x = 0.5 + (i + 0.5) * h;
    s += Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lb);
  }
  return s * h;
}

// ---------- words ----------

export function wordOf(p: number): Confidence {
  return p >= 0.8 ? 4 : p >= 0.6 ? 3 : p >= 0.4 ? 2 : p >= 0.2 ? 1 : 0;
}

/** Probability as plain words, for the main screen. Exact % lives behind "How is this worked out?". */
export function inWords(p: number): string {
  if (p < 0.07) return "Very unlikely";
  if (p < 0.4) return `About 1 in ${Math.round(1 / p)}`;
  if (p < 0.6) return "About 1 in 2";
  if (p < 0.85) return `About ${Math.round(p * 10)} in 10`;
  return "Very likely";
}

// ---------- guardrails and ranking ----------

const HIGH_RISK_FLAGS = new Set(["financial", "medical", "legal"]);
const SENS = { high: 3, medium: 2, low: 1, none: 0 } as const;
const RISK = { low: 0, medium: 1, high: 2 } as const;

/** Mark excluded and skipped candidates, then pick one recommended test per option. */
export function rankExperiments(experiments: Experiment[]): Experiment[] {
  const out = experiments.map((e) => ({ ...e }));
  for (const e of out) {
    if (e.status === "active" || e.status === "done") continue;
    if (!e.reversible) { e.status = "excluded"; e.statusReason = "You can't undo it, so it isn't a test."; continue; }
    if (e.risk === "high" || e.riskFlags.some((f) => HIGH_RISK_FLAGS.has(f) && e.risk !== "low")) {
      e.status = "excluded"; e.statusReason = "Too risky to try as a test."; continue;
    }
    if (e.sensitivity === "none") { e.status = "skipped"; e.statusReason = "Whatever it says, it wouldn't change your path."; continue; }
    e.status = "candidate"; e.statusReason = null;
  }
  const byOption = new Map<string, Experiment[]>();
  for (const e of out.filter((x) => x.status === "candidate")) {
    byOption.set(e.optionId, [...(byOption.get(e.optionId) ?? []), e]);
  }
  for (const list of byOption.values()) {
    // Sensitivity first; hypotheticals never lead; countable tests give clearer evidence; then lower risk, shorter.
    list.sort((x, y) =>
      SENS[y.sensitivity] - SENS[x.sensitivity] ||
      (x.level === 3 ? 1 : 0) - (y.level === 3 ? 1 : 0) ||
      (y.measure ? 1 : 0) - (x.measure ? 1 : 0) ||
      RISK[x.risk] - RISK[y.risk] ||
      x.durationDays - y.durationDays);
    list.forEach((e, i) => { e.status = i === 0 ? "recommended" : "alternative"; });
  }
  return out;
}

// ---------- belief updates ----------

/** For a count measure: where the evidence points, from the user's own guess. Null if not computable.
 *  priorProb/postProb are the chance that most say yes; pointsTo is about the crux statement, so it flips when a yes counts against it. */
export function pointsTo(e: Experiment, ev: Evidence): { priorProb: number; postProb: number; pointsTo: Confidence; flipped: boolean } | null {
  if (!e.measure || e.measure.guess == null || !ev.count) return null;
  const [a, b] = priorFromGuess(e.measure.guess, e.measure.n);
  const priorProb = chanceMost(a, b);
  const postProb = chanceMost(a + ev.count.yes, b + ev.count.n - ev.count.yes);
  const flipped = e.measure.yesSupportsCrux === false;
  return { priorProb, postProb, pointsTo: wordOf(flipped ? 1 - postProb : postProb), flipped };
}

// ---------- photo clarity (evidence strength) ----------

export type Clarity = "none" | "some" | "solid";

/** Only external facts and behavior sharpen a photo. Emotions and simulated reactions never do. */
export function clarity(option: Option, decision: Decision): Clarity {
  const expIds = new Set(decision.experiments.filter((e) => e.optionId === option.id).map((e) => e.id));
  const ev = decision.evidence.filter((x) => expIds.has(x.experimentId) && (x.kind === "external_fact" || x.kind === "behavior"));
  if (ev.length === 0) return "none";
  const sample = ev.reduce((s, x) => s + (x.count?.n ?? 0), 0);
  return ev.length >= 2 || sample >= 20 ? "solid" : "some";
}

// Partly developed for a small sample, so the photo never claims more than the evidence supports.
export const PHOTO = {
  none: { blurPx: 6, veil: 0.32, caption: "No evidence yet" },
  some: { blurPx: 2, veil: 0.08, caption: "Some evidence · small sample" },
  solid: { blurPx: 0, veil: 0, caption: "Solid evidence" },
} as const;

// ---------- stop conditions ----------

export interface StopCheck { id: string; met: boolean; text: string }

export function stopConditions(decision: Decision, today: Date): { ready: boolean; checks: StopCheck[]; blurry: Option[] } {
  // A future is blurry while it has no real evidence, whatever kind of unknowns it has.
  const blurry = decision.options.filter((o) => clarity(o, decision) === "none");
  const ranked = rankExperiments(decision.experiments);
  const next = ranked.find((e) => e.status === "recommended" && blurry.some((o) => o.id === e.optionId))
    ?? ranked.find((e) => e.status === "recommended");
  const worthIt = !!next && SENS[next.sensitivity] >= 2 && next.reversible && next.durationDays <= 14;
  const deadlineNear = decision.deadline != null && (new Date(decision.deadline).getTime() - today.getTime()) / 86400000 <= 7;
  const checks: StopCheck[] = [
    { id: "enough", met: blurry.length === 0, text: blurry.length === 0 ? "Every future has some evidence." : `Path ${blurry.map((o) => o.id).join(", ")} is still blurry.` },
    { id: "worth", met: !worthIt, text: worthIt ? "One cheap test could still change your path." : "More testing costs more than it's likely to tell you." },
    { id: "reversible", met: worthIt, text: worthIt ? "The next test is easy to undo." : "No easy-to-undo test left." },
    { id: "deadline", met: deadlineNear, text: decision.deadline ? (deadlineNear ? "Your deadline is within a week." : "Your deadline isn't close.") : "No deadline set." },
  ];
  const ready = blurry.length === 0 || !worthIt || deadlineNear;
  return { ready, checks, blurry };
}

export function nextMove(decision: Decision, today: Date): Experiment | null {
  const { blurry } = stopConditions(decision, today);
  const ranked = rankExperiments(decision.experiments);
  return ranked.find((e) => e.status === "recommended" && blurry.some((o) => o.id === e.optionId))
    ?? ranked.find((e) => e.status === "recommended") ?? null;
}
