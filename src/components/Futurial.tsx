"use client";
import { useEffect, useMemo, useState } from "react";
import type { Confidence, Decision, Evidence, Experiment, Fact } from "@/lib/engine/schema.ts";
import { chanceMost, clarity, flipChance, inWords, nextMove, pointsTo, priorFromGuess, stopConditions, WORDS } from "@/lib/engine/scoring.ts";
import { DEMOS } from "@/lib/demoProfiles";
import { defaultAssume, moneyState, MONTHS, runsOut, savingsPath, savingsWords, WHAT_IFS, type Assume, type Source, type WhatIf } from "@/lib/engine/future.ts";
import { FOR_OPTIONS, FOR_Q, horizonText, type Answer, type Profile } from "@/lib/prompts";
import { Dictate, Loading, Photo, Receipt, Scale } from "./ui";

// ---------- types ----------

type Screen = "profile" | "start" | "words" | "ask" | "five" | "live" | "today" | "plan" | "guess" | "home" | "log" | "confirm" | "reveal" | "still" | "next" | "crisis";
type Opt = { id: string; label: string; scene: string };
type Crux = { id: string; statement: string; optionIds: string[]; kind: "fact" | "preference"; impact: "high" | "medium" | "low" };
type Question = { id: string; question: string; why: string; options: string[] };
type Understand = { question: string; options: Opt[]; cruxes: Crux[]; numbers?: { savingsMonths?: number | null; monthlyCostUsd?: number | null; payChange?: { optionId: string; pct: number } | null; kidsAges?: number[] | null } | null; missing?: string | null; questions?: Question[] };
type DayM = { time: string; text: string; voice?: string | null; voiceBy?: string | null; words?: string[]; scene: string; choices: string[] | null; outcomes: string[] | null; contrast?: string };
type Slot = { time: string; contrast: string; moments: Record<string, Omit<DayM, "time" | "contrast">> };
type Reflect = { line: string; asLongAs?: string; check: { optionId: string; cruxId: string; title: string; minutes: number; who: string[]; where: string[]; message: string; measure: { type: "count"; n: number; question: string }; yesMeans?: string; yesSupportsCrux?: boolean } };
type EvOut = { kind: Evidence["kind"]; count: { yes: number; no?: number; unclear?: number; n: number } | null; facts: (Fact & { quote: string })[]; unclear: string | null };
type See = { line: string; followUp: { title: string; why: string } };

/** How money differs in one life from today: the user's pay and the household's costs, in percent. */
type LifeMoney = { pay: number; cost: number; src: Source };

type St = {
  screen: Screen; dilemma: string; demo: Record<string, string>; demoProfile: string | null; sampleLog: string | null;
  u: Understand | null; answers: Record<string, string>; conf: Record<string, Confidence | null>;
  photos: Record<string, string | null>; photoLoading: Record<string, boolean>;
  days: Record<string, DayM[]> | null; play: { i: number; feel: Record<string, string>; choice: Record<string, number>; guess: Record<string, string>; shown: Record<string, boolean> };
  reflect: Reflect | null;
  plan: Experiment[] | null; extra: Experiment[]; practice: string | null;
  activeId: string | null; guess: number | null; thresh: number | null; editThresh: boolean; startedAt: string | null;
  transcript: string; ev: EvOut | null; yes: number | null; evidence: Evidence[];
  revealed: boolean; see: See | null; upd: { kind: "update" | "keep"; to: Confidence } | null; picking: boolean;
  decided: string | null; pinQuote: string | null; copied: boolean; busy: string | null; error: string | null;
  outline: { time: string; contrast: string }[] | null;
  words: string[]; standing: Record<string, { guess: string; basis: string; well?: string; badly?: string; headline?: string; gained?: string; gaveUp?: string; hard?: string }>;
  /** Which life's hard part the user said they could live with. */
  hard: string | null;
  five: { a: Assume; src: Record<keyof Assume, Source>; whatIf: WhatIf; life?: Record<string, LifeMoney> } | null;
};

const INITIAL: St = {
  screen: "start", dilemma: "", demo: {}, demoProfile: null, sampleLog: null, u: null, answers: {}, conf: {}, photos: {}, photoLoading: {},
  days: null, play: { i: 0, feel: {}, choice: {}, guess: {}, shown: {} }, reflect: null, plan: null, extra: [], practice: null,
  activeId: null, guess: null, thresh: null, editThresh: false, startedAt: null,
  transcript: "", ev: null, yes: null, evidence: [], revealed: false, see: null, upd: null, picking: false,
  decided: null, pinQuote: null, copied: false, busy: null, error: null, outline: null, five: null, words: ["", "", ""], standing: {}, hard: null,
};

const EXAMPLE = "I'm thinking about quitting my PM job to build an AI tool that chases late invoices for freelancers. I have about 9 months of savings, but I'm scared of giving up a steady paycheck.";
const EXAMPLE_LOG = "I asked 5 people. Only one said yes. Most of them said they already use something free for this.";
const FEELS = ["Excited", "Calm", "Proud", "Relieved", "Worried", "Tired", "Bored", "Lonely", "Sad"];
/** What each of the three scenes is for, like scenes in a film. */
/** How long the intro holds in a recording (?record), so the narrator can give the background. */
const SPLASH_LONG_MS = 12000;
const BEATS = ["What you were afraid of", "A choice", "The people you're doing this for"];
const LOOP = ["Understand", "Experience", "Check", "Learn", "Decide"];
const LOOP_OF: Record<Screen, number> = { profile: 0, start: 0, words: 0, ask: 0, crisis: 0, five: 1, live: 1, today: 2, plan: 2, guess: 2, home: 2, log: 3, confirm: 3, reveal: 3, still: 3, next: 4 };
const KEY = "futurial:v3";
const HORIZON = horizonText(MONTHS);
const HORIZONS = ["1 month", "6 months", "2 years", "5 years"];
const SRC_TAG: Record<Source, string> = { you: "from you", guess: "guess", assumption: "assumption" };
const SLIDERS: { k: keyof Assume; label: string; min: number; max: number; step: number; unit: (v: number) => string; partnerOnly?: boolean }[] = [
  { k: "savingsMonths", label: "Savings today", min: 0, max: 24, step: 1, unit: (v) => `${v} ${v === 1 ? "month" : "months"} of costs` },
  { k: "cover", label: "Household income vs. costs", min: 80, max: 160, step: 5, unit: (v) => `${v}% of costs` },
  { k: "share", label: "Your pay, of household income", min: 10, max: 100, step: 5, unit: (v) => `${v}%`, partnerOnly: true },
  { k: "raise", label: "Yearly raise", min: 0, max: 8, step: 1, unit: (v) => `${v}% a year` },
  { k: "infl", label: "Prices rise", min: 0, max: 8, step: 1, unit: (v) => `${v}% a year` },
];
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
/** Where each life's money starts: the pay change the user stated for that option, everything else as today. */
const startMoney = (u: Understand, optId: string): LifeMoney =>
  u.numbers?.payChange?.optionId === optId ? { pay: u.numbers.payChange.pct, cost: 0, src: "you" } : { pay: 0, cost: 0, src: "assumption" };
/** Two savings lines over five years, computed in code. Solid A, dashed B. Savings never draw below zero: a life that runs out
 *  stays on the zero line from that month (a ring marks it, and its end label says when). A scale on the left and each line's value at the right edge. */
function SavingsChart({ lines }: { lines: { id: string; path: number[] }[] }) {
  const W = 320, H = 176, L = 30, R = 58, T = 24, B = 24;
  const hi = Math.max(3, ...lines.flatMap((l) => l.path));
  const step = hi > 40 ? 20 : hi > 20 ? 10 : hi > 8 ? 4 : 2;
  const top = Math.ceil(hi / step) * step;
  const x = (t: number) => L + (t / MONTHS) * (W - L - R);
  const y = (v: number) => T + (1 - Math.max(0, v) / top) * (H - T - B);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step).filter((v, i, a) => a.length <= 5 || i % 2 === 0 || v === top);
  // End labels: at each line's last value, pushed apart so they never overlap or leave the plot.
  const ends = lines.map((l, i) => ({ i, id: l.id, v: l.path[MONTHS], out: runsOut(l.path), y: y(l.path[MONTHS]) })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 13) ends[k].y = ends[k - 1].y + 13;
  const over = ends.length ? Math.max(0, ends[ends.length - 1].y - (H - B)) : 0;
  ends.forEach((e) => { e.y = Math.max(T + 4, e.y - over); });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Savings over five years: ${lines.map((l) => `${l.id} ends at ${Math.max(0, Math.round(l.path[MONTHS]))} months of costs`).join(", ")}`}>
      {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? "zero" : "grid"} /><text x={L - 6} y={y(v) + 3.5} textAnchor="end">{v}</text></g>)}
      <text x={L - 6} y={T - 12} textAnchor="end" className="unit">mo</text>
      {[1, 2, 3, 4, 5].map((yr) => <text key={yr} x={x(yr * 12)} y={H - 7} textAnchor="middle">Y{yr}</text>)}
      {lines.map((l, i) => {
        const out = runsOut(l.path);
        return (
          <g key={l.id} className={`ln l${i}`}>
            <polyline points={l.path.map((v, t) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
            {out != null && <circle cx={x(out)} cy={y(0)} r={4} className="out" />}
          </g>
        );
      })}
      {ends.map((e) => <text key={e.id} x={W - R + 6} y={e.y + 4} className={`end l${e.i}`}>{e.id} {e.out != null ? `out Y${Math.ceil(e.out / 12)}` : `${Math.round(e.v)} mo`}</text>)}
    </svg>
  );
}
const PKEY = "futurial:profile";
const LEVEL_TAG = { 1: "Real test", 2: "Safe practice", 3: "Hypothetical" } as const;

const PLACES = ["United States", "Europe", "Seoul", "Elsewhere in Korea", "Somewhere else"];
const AGES = ["20s", "30s", "40s", "50s+"];
const HOUSEHOLD = ["Alone", "Partner", "Kids", "Parents"];
// The app is English-only and every amount is in US dollars, wherever the user lives.
const currencyOf = (_place: string | null): Profile["currency"] => "USD";
const EMPTY_PROFILE: Profile = { place: null, age: null, household: [], currency: "USD" };

const today = () => new Date();
const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** Marker for a scene picture skipped on purpose (FUTURIAL_SCENES=key, test runs only). */
const SKIPPED = "skipped";
const GOOD_FEELS = new Set(["Excited", "Calm", "Proud", "Relieved"]);
/** The tapped answers, with "Who are you doing this for?" first (names in brackets if given). */
function toAnswers(u: Understand | null, answers: Record<string, string>): Answer[] {
  const out: Answer[] = [];
  if (answers.for) out.push({ question: FOR_Q, answer: answers.for !== "Mostly me" && answers.forName?.trim() ? `${answers.for} (${answers.forName.trim()})` : answers.for });
  for (const q of u?.questions ?? []) if (answers[q.id]) out.push({ question: q.question, answer: answers[q.id] });
  return out;
}
/** Guess vs. what was tapped, decided in code: hit (felt most), close (same good/hard side), or miss. */
function feelingResult(guess: string | undefined, felt: string[]): { kind: "hit" | "part" | "close" | "miss"; tone: "good" | "hard" } | null {
  if (!guess || felt.length === 0) return null;
  const counts = felt.reduce<Record<string, number>>((a, f) => ({ ...a, [f]: (a[f] ?? 0) + 1 }), {});
  const tone = felt.filter((f) => GOOD_FEELS.has(f)).length * 2 >= felt.length ? "good" : "hard";
  // A hit means the guess was felt more than any other feeling (a tie with one tap each is not a hit).
  const rivals = Object.entries(counts).filter(([f]) => f !== guess).map(([, c]) => c);
  if ((counts[guess] ?? 0) > Math.max(0, ...rivals)) return { kind: "hit", tone };
  if (counts[guess]) return { kind: "part", tone };
  return { kind: GOOD_FEELS.has(guess) === (tone === "good") ? "close" : "miss", tone };
}
const FEEL_MARK = { hit: "Knew it", part: "Partly", close: "Close", miss: "Surprised you" } as const;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** Demo profiles only: fictional replies that answer the check actually shown (1 yes, 2 "it depends", the rest no). */
const sampleReplies = (who: string, n: number, question: string) =>
  n < 3 ? null : `I asked ${n} ${lower(who)}: "${question}" Only one said yes. Two said it depends on the month. ${["No one", "One", "Two", "Three", "Four", "Five"][n - 3] ?? n - 3} said no.`;
/** "About 1 in 3" → "about a 1 in 3 chance", for use inside a sentence. */
const chancePhrase = (p: number) => { const w = inWords(p); return w.startsWith("About ") ? `about a ${w.slice(6)} chance` : w === "Very unlikely" ? "very little chance" : "a very high chance"; };
const profileLine = (p: Profile | null) => (p ? [p.place, p.age, p.household.join(" + ")].filter(Boolean).join(" · ") : "");

async function api<T>(path: string, body: unknown): Promise<T & { demo?: boolean; reason?: string; handoff?: string }> {
  const res = await fetch(`/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Something went wrong (${res.status}). Please try again.`);
  return res.json();
}

// ---------- component ----------

export default function Futurial() {
  const [s, setS] = useState<St>(INITIAL);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [splash, setSplash] = useState(false);
  // ?demo=sarah&record hides the "Demo profile" banner for a screen recording; plain demo links keep it.
  const [recording, setRecording] = useState(false);
  // The intro plays once per browser session (a fresh window for a demo shows it again).
  // A recording (?record) holds it for 12 seconds so the narrator can set the scene; everyone else sees about 3.
  useEffect(() => { try { if (!sessionStorage.getItem("futurial:splash")) { setSplash(true); sessionStorage.setItem("futurial:splash", "1"); setTimeout(() => setSplash(false), new URLSearchParams(window.location.search).has("record") ? SPLASH_LONG_MS + 800 : 3400); } } catch { /* storage blocked: skip the intro */ } }, []);
  const [confirmReset, setConfirmReset] = useState(false);
  // Pictures for each moment of the two days, keyed "A-0". Kept in memory only: large and easy to regenerate.
  const [scenes, setScenes] = useState<Record<string, string | null | undefined>>({});
  const set = (p: Partial<St> | ((s: St) => Partial<St>)) => setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) }));

  // Restore and persist. Photos are kept separately because they are large.
  useEffect(() => {
    // ?demo=alex loads a fictional demo profile and starts fresh.
    const demoKey = new URLSearchParams(window.location.search).get("demo");
    const rec = new URLSearchParams(window.location.search).has("record");
    setRecording(rec);
    const demo = demoKey ? DEMOS[demoKey] : undefined;
    if (demo) {
      setProfile(demo.profile); setDraft(demo.profile);
      setS({ ...INITIAL, dilemma: demo.dilemma, demoProfile: demo.name, sampleLog: demo.log, answers: demo.forName ? { forName: demo.forName } : {}, ...(rec && demo.record ? { words: demo.record.words } : {}) });
      window.history.replaceState(null, "", window.location.pathname);
      setLoaded(true);
      return;
    }
    let p: Profile | null = null;
    try { p = JSON.parse(localStorage.getItem(PKEY) || "null"); } catch { /* none */ }
    setProfile(p); if (p) setDraft(p);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const saved = JSON.parse(raw) as St; const photos = JSON.parse(localStorage.getItem(KEY + ":photos") || "{}"); setS({ ...INITIAL, ...saved, photos, photoLoading: {}, busy: null, error: null }); }
      else if (!p) setS({ ...INITIAL, screen: "profile" });
    } catch { /* start fresh */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded || s.demoProfile) return; // demo runs never overwrite a real user's saved state
    try { const { photos, ...rest } = s; localStorage.setItem(KEY, JSON.stringify(rest)); localStorage.setItem(KEY + ":photos", JSON.stringify(photos)); } catch { /* storage full or blocked */ }
  }, [s, loaded]);
  const saveProfile = (p: Profile | null) => { setProfile(p); if (!s.demoProfile) { try { localStorage.setItem(PKEY, JSON.stringify(p ?? EMPTY_PROFILE)); } catch { /* blocked */ } } };

  const go = (screen: Screen) => { set({ screen, error: null, pinQuote: null }); window.scrollTo({ top: 0 }); };
  const markDemo = (step: string, r: { demo?: boolean; reason?: string }) => set((p) => ({ demo: r.demo ? { ...p.demo, [step]: r.reason || "sample data" } : (() => { const d = { ...p.demo }; delete d[step]; return d; })() }));

  // ---------- derived ----------
  const allExps = [...(s.plan ?? []), ...s.extra];
  const answerList: Answer[] = toAnswers(s.u, s.answers);
  const wordList = s.words.map((w) => w.trim()).filter(Boolean);
  /** How many of a life's moments touched each of the user's words, counted in code from the model's tags. */
  const wordCount = (optId: string, w: string) => (s.days?.[optId] ?? []).filter((mo) => mo.words?.some((x) => x.trim().toLowerCase() === w.toLowerCase())).length;
  const decision: Decision | null = useMemo(() => s.u && ({
    id: "d", question: s.u.question, dilemma: s.dilemma, createdAt: "", deadline: null,
    options: s.u.options.map(({ id, label }) => ({ id, label })),
    cruxes: s.u.cruxes.map((c) => ({ ...c, confidence: s.conf[c.id] ?? null })),
    experiments: allExps, evidence: s.evidence, beliefUpdates: [],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [s.u, s.conf, s.plan, s.extra, s.evidence, s.dilemma]);
  const active = allExps.find((e) => e.id === s.activeId) ?? null;
  const activeOpt = s.u?.options.find((o) => o.id === active?.optionId) ?? null;
  const activeCrux = s.u?.cruxes.find((c) => c.id === active?.cruxIds[0]) ?? null;
  const dayOpts = (s.u?.options ?? []).slice(0, 2);
  // Each life plays like a short film: a title card → its 3 scenes → how that life felt. Then both side by side.
  type Step = { kind: "card" | "felt"; opt: Opt; m?: undefined; mo?: undefined } | { kind: "moment"; opt: Opt; m: number; mo: DayM };
  const steps: Step[] = s.days ? dayOpts.flatMap((o): Step[] => [
    { kind: "card" as const, opt: o },
    // A recording shows only the first life's fear scene (its choice is made as in the rehearsal), then the second life in full.
    ...[0, 1, 2].filter((m) => s.days![o.id]?.[m] && !(recording && o.id === dayOpts[0].id && m > 0)).map((m) => ({ kind: "moment" as const, opt: o, m, mo: s.days![o.id][m] })),
    { kind: "felt" as const, opt: o },
  ]) : [];
  /** How a life felt: up to two feelings, tapped once at the end of it. */
  const feltIn = (optId: string) => (s.play.feel[optId] ?? "").split(", ").filter(Boolean);
  const clarityOf = (optId: string) => (decision ? clarity({ id: optId, label: "" }, decision) : "none");
  const sampleOf = (optId: string) => s.evidence.filter((e) => allExps.find((x) => x.id === e.experimentId)?.optionId === optId).reduce((n, e) => n + (e.count?.n ?? 0), 0) || null;
  /** How well your guesses matched: feelings before each day, and counts before each test. Only shows what you guessed. */
  const scorecard = () => {
    const feels = dayOpts.map((o) => ({ o, g: s.play.guess[o.id], r: feelingResult(s.play.guess[o.id], feltIn(o.id)) })).filter((x) => x.r);
    const facts = allExps.flatMap((e) => {
      const got = s.evidence.filter((v) => v.experimentId === e.id && v.count).at(-1)?.count;
      return e.measure?.guess != null && got ? [{ e, guess: e.measure.guess, got }] : [];
    });
    if (!feels.length && !facts.length) return null;
    return (
      <div className="card score">
        <span className="k">Your predictions so far</span>
        {feels.map(({ o, g, r }) => <div key={o.id} className="srow"><span>Feeling in {o.id} · {o.label}: guessed {lower(g!)}, felt {feltIn(o.id).map(lower).join(", ")}</span><b className={r!.kind === "part" ? "close" : r!.kind}>{FEEL_MARK[r!.kind]}</b></div>)}
        {facts.map(({ e, guess, got }) => { const off = Math.abs(got.yes - guess); return <div key={e.id} className="srow"><span>{e.title}: guessed {guess} of {got.n}, got {got.yes}</span><b className={off === 0 ? "hit" : off === 1 ? "close" : "miss"}>{off === 0 ? "Spot on" : off === 1 ? "Close" : `Off by ${off}`}</b></div>; })}
        <span className="fine">Surprises are the useful part: they show where your picture of a future was off.</span>
      </div>
    );
  };
  const factsOf = (optId: string) => s.evidence.filter((e) => e.kind !== "simulated_reaction" && allExps.find((x) => x.id === e.experimentId)?.optionId === optId).flatMap((e) => e.facts);

  // ---------- actions ----------
  /** A recording of a demo profile answers the questions the same way as its rehearsal: the profile's person, then each first answer. */
  const recordedAnswers = (u: Understand): Record<string, string> => {
    const rec = recording && s.demoProfile ? Object.values(DEMOS).find((d) => d.name === s.demoProfile)?.record : undefined;
    return rec ? { for: rec.forWhom, ...Object.fromEntries((u.questions ?? []).map((q) => [q.id, q.options[0]])) } : {};
  };
  async function understand() {
    set({ busy: "Reading your situation…", error: null });
    try {
      const r = await api<Understand>("understand", { dilemma: s.dilemma, profile });
      if (r.handoff) { set({ busy: null }); return go("crisis"); }
      const u: Understand = { question: r.question, options: r.options, cruxes: r.cruxes, numbers: r.numbers ?? null, missing: r.missing ?? null, questions: r.questions ?? [] };
      const five = { ...defaultAssume(u.numbers ?? {}, !!profile?.household.includes("Partner")), whatIf: "none" as WhatIf, life: Object.fromEntries(u.options.map((o) => [o.id, startMoney(u, o.id)])) };
      set({ ...INITIAL, dilemma: s.dilemma, words: s.words, demoProfile: s.demoProfile, sampleLog: s.sampleLog, answers: { ...(s.answers.forName ? { forName: s.answers.forName } : {}), ...recordedAnswers(u) }, demo: r.demo ? { understand: r.reason || "" } : {}, u, five, conf: Object.fromEntries(u.cruxes.map((c) => [c.id, null])), busy: null });
      setScenes({});
      // In the background: a photo of each future (Muse Image) and extra practice tests (Muse Wonder).
      u.options.forEach(async (o) => {
        set((p) => ({ photoLoading: { ...p.photoLoading, [o.id]: true } }));
        try { const ph = await api<{ image: string | null }>("photo", { scene: o.scene }); set((p) => ({ photos: { ...p.photos, [o.id]: ph.image }, photoLoading: { ...p.photoLoading, [o.id]: false } })); }
        catch { set((p) => ({ photoLoading: { ...p.photoLoading, [o.id]: false } })); }
      });
      api<{ experiments: Experiment[] }>("plan", { decision: { question: u.question, options: u.options.map(({ id, label }) => ({ id, label })), cruxes: u.cruxes } })
        .then((pl) => { markDemo("plan", pl); set({ plan: pl.experiments }); }).catch(() => {});
      go("ask");
    } catch (e) { set({ busy: null, error: (e as Error).message }); }
  }

  async function livingDays(u: Understand, answers: Record<string, string>) {
    set({ busy: "Writing the same week in both lives…", error: null });
    const opts = u.options.slice(0, 2);
    const ans = toAnswers(u, answers);
    const inputs: Record<string, number> = {};
    if (u.numbers?.savingsMonths) inputs.savingsMonths = u.numbers.savingsMonths;
    if (u.numbers?.monthlyCostUsd) inputs.monthlyCosts = u.numbers.monthlyCostUsd;
    const input = { options: opts.map(({ id, label }) => ({ id, label })), monthsIn: MONTHS, profile, answers: ans, inputs, cruxes: u.cruxes, dilemma: s.dilemma, later: laterFacts(), words: wordList };
    try {
      // A fast outline first (a few seconds), so there's something to read while both lives are written.
      let outline: { time: string; contrast: string }[] | null = null;
      try { outline = (await api<{ slots: { time: string; contrast: string }[] }>("outline", input)).slots; set({ outline }); } catch { /* go straight to the full days */ }
      const r = await api<{ slots: Slot[]; standing?: St["standing"] }>("day", { ...input, outline });
      markDemo("day", r);
      const days: Record<string, DayM[]> = Object.fromEntries(opts.map((o) => [o.id, r.slots.map((sl) => ({ ...sl.moments[o.id], time: sl.time, contrast: sl.contrast }))]));
      const firstChoice = days[opts[0].id]?.findIndex((mo) => mo.choices) ?? -1;
      const choice = recording && firstChoice >= 0 ? { [`${opts[0].id}-${firstChoice}`]: 0 } : {};
      set({ busy: null, outline: null, days, standing: r.standing ?? {}, hard: null, play: { i: 0, feel: {}, choice, guess: {}, shown: {} }, reflect: null });
      go("live");
      // Muse Image draws every moment in parallel, first moments first.
      const keys = [0, 1, 2].flatMap((m) => opts.map((o) => ({ k: `${o.id}-${m}`, mo: days[o.id]?.[m] }))).filter((x) => x.mo);
      setScenes(Object.fromEntries(keys.map((x) => [x.k, undefined])));
      keys.forEach(({ k, mo }) => {
        // key: the evening moment (where the people you're doing this for show up). Test runs can skip the others.
        api<{ image: string | null; skipped?: boolean }>("photo", { scene: `Hypothetical moment at ${mo!.time}. ${mo!.scene || mo!.text} Point of view, hands or objects only.`, key: k.endsWith("-2") })
          .then((ph) => setScenes((prev) => ({ ...prev, [k]: ph.skipped ? SKIPPED : ph.image })))
          .catch(() => setScenes((prev) => ({ ...prev, [k]: null })));
      });
    } catch (e) { set({ busy: null, outline: null, error: (e as Error).message }); go("five"); }
  }

  /** Savings path of one life, five years out, from the current numbers. */
  /** Pay and costs in one life, as the user set them (or as they said in their decision). */
  const moneyOf = (optId: string): LifeMoney => s.five?.life?.[optId] ?? (s.u ? startMoney(s.u, optId) : { pay: 0, cost: 0, src: "assumption" });
  const pathOf = (optId: string) => {
    const m = moneyOf(optId);
    return s.five ? savingsPath(s.five.a, m.pay, s.five.whatIf, MONTHS, m.cost) : [];
  };
  /** "pay -15% · costs +20%" for one life, only the parts that differ from today. */
  const moneyNote = (optId: string) => { const m = moneyOf(optId); return [m.pay ? `pay ${signed(m.pay)}%` : "", m.cost ? `costs ${signed(m.cost)}%` : ""].filter(Boolean).join(" · "); };
  /** Kids' ages today and five years out, with names when given in the same order. */
  const kidsLine = () => {
    const ages = s.u?.numbers?.kidsAges;
    if (!ages?.length) return null;
    const names = (s.answers.forName ?? "").split(/,|\band\b/).map((x) => x.trim()).filter(Boolean);
    const later = ages.map((a) => a + MONTHS / 12);
    const said = names.length === ages.length ? later.map((a, i) => `${names[i]} is ${a}`).join(", ") : `the kids are ${later.join(" and ")}`;
    return { now: ages.join(" and "), later: later.join(" and "), said };
  };
  /** A tapped savings answer ("3-6 months", "Under 3 months") replaces the savings guess. Ranges use their middle. */
  function toFive() {
    const q = s.u?.questions?.find((x) => /saving/i.test(x.question) && /month/i.test(s.answers[x.id] ?? ""));
    const nums = q ? (s.answers[q.id].match(/\d+/g) ?? []).map(Number) : [];
    if (q && nums.length && s.five?.src.savingsMonths !== "you") {
      const a = s.answers[q.id];
      const v = nums.length > 1 ? Math.round((nums[0] + nums[1]) / 2) : /under|less/i.test(a) ? Math.max(1, nums[0] - 1) : /over|more/i.test(a) ? nums[0] + 2 : nums[0];
      set((p) => ({ five: { ...p.five!, a: { ...p.five!.a, savingsMonths: v }, src: { ...p.five!.src, savingsMonths: "you" } } }));
    }
    go("five");
  }
  /** Computed facts handed to the model as they stand when the user taps "Live both weeks". */
  function laterFacts(): string[] {
    if (!s.u || !s.five) return [];
    const out = dayOpts.map((o) => {
      const m = moneyOf(o.id);
      const p = pathOf(o.id);
      return `In ${o.id} · ${o.label}: ${savingsWords(p, s.u!.numbers?.monthlyCostUsd)}${m.pay ? ` (your pay ${signed(m.pay)}% from the start, then yearly raises)` : ""}${m.cost ? ` (living costs ${signed(m.cost)}% compared with today)` : ""}; ${moneyState(p).fact}`;
    });
    const k = kidsLine();
    if (k) out.push(`In both lives, ${k.said} (five years older than today)`);
    else if (profile?.household.includes("Kids")) out.push("In both lives, the kids are five years older than today");
    const w = WHAT_IFS.find((x) => x.id === s.five!.whatIf);
    if (w) out.push(`In both lives, ${w.fact}`);
    return out;
  }

  /** A calendar file for 9:00 tomorrow, opened by the user's own calendar app. No account, nothing sent. */
  function remindTomorrow(title: string) {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    const end = new Date(d.getTime() + 15 * 60000);
    const stamp = (x: Date) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (t: string) => t.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, " ");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Futurial//EN", "BEGIN:VEVENT",
      `UID:${Date.now()}@futurial`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(d)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc("Futurial: add what happened")}`, `DESCRIPTION:${esc(`${title}. Open ${location.origin} and tap "Add what happened".`)}`, `URL:${location.origin}`,
      "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${esc("Futurial: add what happened")}`, "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a"); a.href = url; a.download = "futurial-reminder.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** The user picked which life's hard part they could live with: say what that shows, and find one check for today. */
  async function pickHard(optId: string) {
    if (!s.u || !s.days) return;
    const other = dayOpts.find((o) => o.id !== optId)!;
    set({ hard: optId, reflect: null, error: null });
    const days = dayOpts.map((o) => ({ future: `${o.id} · ${o.label}`, felt: feltIn(o.id), moments: (s.days![o.id] ?? []).map((mo, m) => ({
      time: mo.time, text: mo.text, chose: mo.choices && s.play.choice[`${o.id}-${m}`] != null ? mo.choices[s.play.choice[`${o.id}-${m}`]] : null,
    })) }));
    try {
      const r = await api<Reflect>("reflect", { words: wordList, dilemma: s.dilemma, options: s.u.options.map(({ id, label }) => ({ id, label })), cruxes: s.u.cruxes, days, profile, answers: answerList,
        picked: { optionId: optId, hard: s.standing[optId]?.hard ?? "", otherHard: s.standing[other.id]?.hard ?? "" } });
      markDemo("reflect", r);
      const reactions = dayOpts.flatMap((o) => feltIn(o.id).map((f) => ({ momentIndex: 2, feeling: f as Evidence["reactions"][number]["feeling"], choice: null })));
      set((p) => p.hard !== optId ? {} : ({ reflect: { line: r.line, asLongAs: r.asLongAs, check: r.check },
        evidence: [...p.evidence.filter((e) => e.kind !== "simulated_reaction"), { id: `sim-${Date.now()}`, experimentId: "days", loggedAt: new Date().toISOString(), kind: "simulated_reaction", source: "scenario", transcript: null, count: null, facts: [], reactions, isDemo: !!p.demo.day }] }));
    } catch (e) { set({ error: (e as Error).message }); }
  }

  /** Turn today's check into a real test the rest of the app understands. */
  function checkToExperiment(r: Reflect): Experiment {
    const opt = s.u?.options.find((o) => o.id === r.check.optionId) ?? s.u!.options[0];
    return {
      id: `today-${Date.now()}`, optionId: opt.id, cruxIds: [r.check.cruxId], level: 1, title: r.check.title, steps: [],
      durationDays: 1, costUsd: 0, reversible: true, risk: "low", riskFlags: [], sensitivity: "high", sensitivityReason: r.line,
      measure: { ...r.check.measure, guess: null, threshold: null, thresholdTouched: false, yesMeans: r.check.yesMeans || undefined, yesSupportsCrux: r.check.yesSupportsCrux }, scenario: null, status: "recommended", statusReason: null, startedAt: null,
    };
  }

  function startTest(e: Experiment) {
    set({ activeId: e.id, guess: null, thresh: null, editThresh: false, startedAt: null, ev: null, yes: null, transcript: "", revealed: false, see: null, upd: null, picking: false });
    if (e.measure) return go("guess");
    set({ startedAt: new Date().toISOString() }); go("home");
  }

  async function saveLog() {
    if (!active) return;
    set({ busy: "Reading what you heard…", error: null });
    try {
      const r = await api<EvOut>("evidence", { title: active.title, measure: active.measure, transcript: s.transcript });
      markDemo("evidence", r);
      set({ busy: null, ev: r, yes: r.count?.yes ?? null });
      if (active.measure) go("confirm"); else commitEvidence(r, null);
    } catch (e) { set({ busy: null, error: (e as Error).message }); }
  }

  /** A recording skips writing the note and confirming the count: the same sample replies, read and revealed in one step. */
  async function replayReveal(transcript: string, measure: Experiment["measure"]) {
    if (!active) return;
    set({ busy: "Reading what you heard…", error: null, transcript });
    try {
      const r = await api<EvOut>("evidence", { title: active.title, measure, transcript });
      markDemo("evidence", r);
      set({ busy: null, ev: r, yes: r.count?.yes ?? null });
      commitEvidence(r, r.count?.yes ?? null, transcript);
    } catch (e) { set({ busy: null, error: (e as Error).message }); }
  }

  function commitEvidence(ev: EvOut, yes: number | null, transcript = s.transcript) {
    if (!active) return;
    // How many were actually asked comes from the note when it says so; the plan's n is only the target.
    const n = ev.count?.n ?? active.measure?.n ?? null;
    // Only correct the first fact when it is the same count the user just confirmed or changed.
    const facts = ev.facts.map((f, i) => (i === 0 && yes != null && n && ev.count && f.value === ev.count.yes ? { ...f, value: yes, of: n } : f));
    const record: Evidence = {
      id: `ev-${Date.now()}`, experimentId: active.id, loggedAt: new Date().toISOString(), kind: ev.kind, source: "text",
      transcript, count: yes != null && n ? { yes, n } : null, facts, reactions: [], isDemo: !!s.demo.evidence,
    };
    set((p) => ({ evidence: [...p.evidence.filter((x) => x.experimentId !== active.id || x.kind === "simulated_reaction"), record], ev: { ...ev, facts: facts as EvOut["facts"] }, yes, revealed: !active.measure }));
    go("reveal");
    api<See>("see", { optionLabel: activeOpt?.label, crux: activeCrux?.statement, facts }).then((r) => { markDemo("see", r); set({ see: { line: r.line, followUp: r.followUp } }); }).catch(() => {});
  }

  function askMore() {
    if (!active?.measure) return;
    const e: Experiment = { ...active, id: `m-${Date.now()}`, title: `Ask ${active.measure.n} more people: “${active.measure.question}”`, status: "recommended", statusReason: null, startedAt: null,
      measure: { ...active.measure, guess: null, threshold: null, thresholdTouched: false } };
    set((p) => ({ extra: [...p.extra, e] }));
    startTest(e);
  }

  function chooseFollowUp() {
    if (!active || !s.see) return;
    const e: Experiment = {
      ...active, id: `f-${Date.now()}`, title: s.see.followUp.title, steps: [], durationDays: 7, sensitivity: "medium",
      sensitivityReason: s.see.followUp.why, status: "recommended", statusReason: null, startedAt: null,
      measure: active.measure ? { ...active.measure, guess: null, threshold: null, thresholdTouched: false } : null,
    };
    set((p) => ({ extra: [...p.extra, e] }));
    startTest(e);
  }

  // ---------- screens ----------
  const photoRow = (beliefs = false) => s.u && (
    <>
      <div className="photos">
        {s.u.options.map((o, i) => (
          <Photo key={o.id} label={`${o.id} · ${o.label}`} image={s.photos[o.id]} loading={s.photoLoading[o.id]} clarity={clarityOf(o.id)} testing={!!s.startedAt && active?.optionId === o.id && active.level !== 3} facts={factsOf(o.id)} sample={sampleOf(o.id)} variant={i} />
        ))}
      </div>
      {beliefs && s.u.cruxes.some((c) => s.conf[c.id] != null) && (
        <div className="box"><span className="k">Where you placed it</span>
          {s.u.cruxes.filter((c) => s.conf[c.id] != null).map((c) => <span key={c.id} className="feelnote"><b>{WORDS[s.conf[c.id]!]}</b>: {lower(c.statement)}</span>)}
        </div>
      )}
    </>
  );

  let body: React.ReactNode = null;

  if (s.busy && s.outline && s.u) body = (
    <div className="outline" role="status" aria-live="polite">
      <span className="k">Hypothetical · AI-generated</span>
      <p className="h">Three days of one week, {HORIZON}, in two lives</p>
      <div className="row" style={{ gap: 6 }}>{s.u.options.slice(0, 2).map((o) => <span key={o.id} className="tag">{o.id} · {o.label}</span>)}</div>
      <ol className="slots">
        {s.outline.map((sl, i) => (
          <li key={sl.time + i} style={{ animationDelay: `${i * 0.35}s` }}><span className="when">{sl.time}</span><span>{sl.contrast}</span></li>
        ))}
      </ol>
      <p className="fine"><span className="spinner sm" aria-hidden="true" /> Writing both lives and drawing each moment…</p>
    </div>
  );

  else if (s.busy) body = <Loading title={s.busy} sub={s.busy.startsWith("Reading your") ? "Muse Spark is finding what your decision depends on." : undefined} />;

  else if (s.screen === "crisis") body = (
    <>
      <p className="h">It sounds like you&apos;re going through something serious.</p>
      <p>Futurial is not the right tool for this moment. Please reach out to someone you trust, or a local crisis line. In the US you can call or text 988. In Korea you can call 109.</p>
      <button className="cta" onClick={() => set({ ...INITIAL })}>Go back</button>
    </>
  );

  else if (s.screen === "profile") {
    const toggle = (h: string) => setDraft((d) => {
      if (h === "Alone") return { ...d, household: d.household.includes("Alone") ? [] : ["Alone"] };
      const rest = d.household.filter((x) => x !== "Alone");
      return { ...d, household: rest.includes(h) ? rest.filter((x) => x !== h) : [...rest, h] };
    });
    const done = (p: Profile | null) => { saveProfile(p); go("start"); };
    body = (
      <>
        <p className="h">A little about you</p>
        <p className="sub">So your future weeks look like your life. Tap what fits, skip what doesn&apos;t. It stays on this device.</p>
        <div className="box"><span className="k">Where you live</span>
          <div className="chips">{PLACES.map((x) => <button key={x} aria-pressed={draft.place === x} onClick={() => setDraft((d) => ({ ...d, place: d.place === x ? null : x, currency: currencyOf(d.place === x ? null : x) }))}>{x}</button>)}</div></div>
        <div className="box"><span className="k">Your age</span>
          <div className="chips">{AGES.map((x) => <button key={x} aria-pressed={draft.age === x} onClick={() => setDraft((d) => ({ ...d, age: d.age === x ? null : x }))}>{x}</button>)}</div></div>
        <div className="box"><span className="k">Who you live with</span>
          <div className="chips">{HOUSEHOLD.map((x) => <button key={x} aria-pressed={draft.household.includes(x)} onClick={() => toggle(x)}>{x}</button>)}</div></div>
        <div className="ctas">
          <button className="cta" onClick={() => done(draft)}>Continue</button>
          <button className="link" style={{ textAlign: "center" }} onClick={() => done(null)}>Skip for now</button>
        </div>
      </>
    );
  }

  else if (s.screen === "words") body = (
    <>
      <p className="h">When you think about this decision, what three words come first?</p>
      <p className="sub">Don&apos;t think too hard. Your five-years-from-now week starts from these.</p>
      <div className="words">{[0, 1, 2].map((i) => <input key={i} type="text" aria-label={`Word ${i + 1}`} placeholder={["e.g. guilt", "freedom", "kids"][i]} maxLength={24} value={s.words[i]} onChange={(e) => set((p) => ({ words: p.words.map((w, j) => (j === i ? e.target.value : w)) }))} />)}</div>
      {s.error && <p className="err">{s.error}</p>}
      <div className="ctas">
        <button className="cta" onClick={understand}>Show me my futures</button>
        {wordList.length === 0 && <button className="link" style={{ textAlign: "center" }} onClick={understand}>Skip</button>}
      </div>
    </>
  );

  else if (s.screen === "start" || !s.u) body = (
    <>
      <p className="h">What are you deciding?</p>
      <p className="sub">Say it the way you&apos;d tell a friend. Messy is fine.</p>
      <textarea aria-label="Your decision" placeholder="For example: I'm thinking about quitting my job to start…" value={s.dilemma} onChange={(e) => set({ dilemma: e.target.value })} />
      <div className="row"><Dictate onText={(t) => set({ dilemma: t })} />{!s.demoProfile && <button className="link" onClick={() => set({ dilemma: EXAMPLE })}>Use an example</button>}</div>
      <p className="fine">{profileLine(profile) ? <>About you: {profileLine(profile)} · </> : null}<button className="link" style={{ padding: 0, minHeight: 0, fontSize: "inherit" }} onClick={() => go("profile")}>{profileLine(profile) ? "edit" : "Add a little about you"}</button></p>
      {s.error && <p className="err">{s.error}</p>}
      <button className="cta" disabled={s.dilemma.trim().length < 20} onClick={() => go("words")}>Continue</button>
    </>
  );


  else if (s.screen === "ask") {
    const qs = s.u.questions ?? [];
    const answered = qs.filter((q) => s.answers[q.id]).length + (s.answers.for ? 1 : 0);
    body = (
      <>
        <p className="h">Before I imagine your two weeks</p>
        <p className="sub">{qs.length === 0 ? "One quick question." : `${qs.length + 1} quick questions.`} Tap an answer, or skip.</p>
        <div className="card">
          <span className="t">{FOR_Q}</span>
          <span className="fine">So the people who matter show up in your weeks.</span>
          <div className="chips">{FOR_OPTIONS.map((o) => <button key={o} aria-pressed={s.answers.for === o} onClick={() => set((p) => ({ answers: { ...p.answers, for: p.answers.for === o ? "" : o } }))}>{o}</button>)}</div>
          {s.answers.for && s.answers.for !== "Mostly me" && <input type="text" id="for-name" style={{ marginTop: 8 }} aria-label="Their names (optional)" placeholder="Their names (optional), e.g. Mia, Leo" value={s.answers.forName ?? ""} onChange={(e) => set((p) => ({ answers: { ...p.answers, forName: e.target.value } }))} />}
        </div>
        {qs.map((q) => (
          <div key={q.id} className="card">
            <span className="t">{q.question}</span>
            <span className="fine">{q.why}</span>
            <div className="chips">{q.options.map((o) => <button key={o} aria-pressed={s.answers[q.id] === o} onClick={() => set((p) => ({ answers: { ...p.answers, [q.id]: p.answers[q.id] === o ? "" : o } }))}>{o}</button>)}</div>
          </div>
        ))}
        {s.error && <p className="err">{s.error}</p>}
        <div className="ctas">
          <button className="cta" onClick={toFive}>Go five years ahead</button>
          {answered === 0 && <button className="link" style={{ textAlign: "center" }} onClick={toFive}>Skip questions</button>}
        </div>
      </>
    );
  }

  else if (s.screen === "five" && s.five) {
    const f = s.five; const k = kidsLine();
    const setLife = (id: string, key: "pay" | "cost", v: number) => set((p) => ({ five: { ...p.five!, life: { ...(p.five!.life ?? {}), [id]: { ...moneyOf(id), [key]: v, src: "you" } } } }));
    const sameMoney = dayOpts.every((o) => !moneyOf(o.id).pay && !moneyOf(o.id).cost);
    const setA = (key: keyof Assume, v: number) => set((p) => ({ five: { ...p.five!, a: { ...p.five!.a, [key]: v }, src: { ...p.five!.src, [key]: "you" } } }));
    const hasPartner = !!profile?.household.includes("Partner");
    body = (
      <>
        <span className="tag">Computed by Futurial · not a prediction</span>
        <p className="h">Five years from now</p>
        <p className="sub">Your two weeks happen here. These numbers set the scene, so fix any guess that&apos;s off.</p>
        <div className="chips horizon" aria-label="How far ahead">
          {HORIZONS.map((h) => <button key={h} aria-pressed={h === "5 years"} disabled={h !== "5 years"}>{h}{h !== "5 years" && <small> · soon</small>}</button>)}
        </div>
        {k && <div className="box"><span className="k">The kids</span><span>{k.now} today → <b>{k.later}</b> <span className="src you">from you</span></span></div>}
        <div className="card">
          <span className="k">Savings, month by month</span>
          <SavingsChart lines={dayOpts.map((o) => ({ id: o.id, path: pathOf(o.id) }))} />
          {dayOpts.map((o) => {
            const p = pathOf(o.id);
            return <span key={o.id} className="feelnote"><b>{o.id} · {o.label}</b>: {cap(savingsWords(p, s.u!.numbers?.monthlyCostUsd))}{runsOut(p) == null ? " in year 5" : ""}{moneyNote(o.id) ? ` · ${moneyNote(o.id)}` : ""}</span>;
          })}
          {sameMoney && <p className="sub">Both lives have the same money right now. If one life changes your pay or your living costs (a move, a new city), set it below.</p>}
          <div className="lives-money">
            {dayOpts.map((o, i) => {
              const m = moneyOf(o.id);
              return (
                <div key={o.id} className={`lm l${i}`}>
                  <span className="k">{o.id} · {o.label} <span className={`src ${m.src}`}>{m.src !== "you" && !m.pay && !m.cost ? "same as today" : SRC_TAG[m.src]}</span></span>
                  <label className="slider"><span>Your pay vs. today: <b>{signed(m.pay)}%</b></span><input type="range" min={-60} max={100} step={5} value={m.pay} onChange={(e) => setLife(o.id, "pay", Number(e.target.value))} /></label>
                  <label className="slider"><span>Living costs vs. today: <b>{signed(m.cost)}%</b></span><input type="range" min={-50} max={100} step={5} value={m.cost} onChange={(e) => setLife(o.id, "cost", Number(e.target.value))} /></label>
                </div>
              );
            })}
          </div>
          <span className="fine">Counted in months of today&apos;s costs. Code works it out from your numbers and the guesses below; the AI only puts it into words.</span>
        </div>
        <details className="box">
          <summary>The numbers behind this</summary>
          {SLIDERS.filter((x) => !x.partnerOnly || hasPartner).map((x) => (
            <label key={x.k} className="slider">
              <span>{x.label}: <b>{x.unit(f.a[x.k])}</b> <span className={`src ${f.src[x.k]}`}>{SRC_TAG[f.src[x.k]]}</span></span>
              <input type="range" min={x.min} max={x.max} step={x.step} value={f.a[x.k]} onChange={(e) => setA(x.k, Number(e.target.value))} />
            </label>
          ))}
        </details>
        <details className="box">
          <summary>What if… (optional)</summary>
          <span className="fine">Something hard to picture, happening in both lives. One at a time.</span>
          <div className="chips">{WHAT_IFS.map((w) => <button key={w.id} aria-pressed={f.whatIf === w.id} onClick={() => set((p) => ({ five: { ...p.five!, whatIf: p.five!.whatIf === w.id ? "none" : w.id } }))}>{w.label}</button>)}</div>
        </details>
        {s.error && <p className="err">{s.error}</p>}
        <button className="cta" onClick={() => livingDays(s.u!, s.answers)}>Live both weeks</button>
      </>
    );
  }

  else if (s.screen === "live" && s.days) {
    const next = () => { set((p) => ({ play: { ...p.play, i: p.play.i + 1 } })); window.scrollTo({ top: 0 }); };
    const step = steps[s.play.i];
    if (!step) {
      // Both lives side by side, plainly: money (computed), what each gave and cost, the user's words. Then the one question.
      const pick = s.hard ? dayOpts.find((o) => o.id === s.hard) : null;
      const r = s.reflect;
      const said = r && r.asLongAs && r.line.includes(r.asLongAs) ? r.line.split(r.asLongAs) : null;
      body = (
        <div className="paper">
          <span className="k">Side by side</span>
          <p className="h">The two lives, plainly</p>
          <table className="ledger">
            <thead><tr><th />{dayOpts.map((o, i) => <th key={o.id} className={`l${i}`}>{o.id} · {o.label}{feltIn(o.id).length > 0 && <span className="felt">felt {feltIn(o.id).map(lower).join(", ")}</span>}</th>)}</tr></thead>
            <tbody>
              {s.five && <tr><td className="row">Money <span className="src">computed</span></td>{dayOpts.map((o) => <td key={o.id}>{cap(savingsWords(pathOf(o.id)))}</td>)}</tr>}
              <tr><td className="row">Gave you</td>{dayOpts.map((o) => <td key={o.id}>{s.standing[o.id]?.gained || "—"}</td>)}</tr>
              <tr><td className="row">Cost you</td>{dayOpts.map((o) => <td key={o.id}>{s.standing[o.id]?.gaveUp || "—"}</td>)}</tr>
              {wordList.length > 0 && <tr><td className="row">Your words</td>{dayOpts.map((o) => <td key={o.id}>{wordList.map((w) => <span key={w} className={`wchip${wordCount(o.id, w) ? "" : " off"}`}>{w} {wordCount(o.id, w)}/3</span>)}</td>)}</tr>}
            </tbody>
          </table>
          <div className="ask">
            <p className="h2">Every life has a hard part. Which one could you live with?</p>
            <p className="fine">Not which life is better. Which cost you could carry for five years.</p>
            <div className="hard">
              {dayOpts.map((o) => <button key={o.id} aria-pressed={s.hard === o.id} onClick={() => s.hard !== o.id && pickHard(o.id)}><b>{o.id}&apos;s hard part</b>{s.standing[o.id]?.hard || s.standing[o.id]?.gaveUp || o.label}</button>)}
            </div>
            {pick && !r && !s.error && <p className="fine"><span className="spinner sm" aria-hidden="true" /> Reading what your answer says…</p>}
            {s.error && <p className="err">{s.error}</p>}
            {pick && r && (
              <div className="clear">
                <span className="k">What your answer says</span>
                <p>{said ? <>{said[0]}<u>{r.asLongAs}</u>{said.slice(1).join(r.asLongAs)}</> : r.line}</p>
                <span className="k">One thing to check today · about {r.check.minutes} min</span>
                <span className="t">{r.check.title}</span>
                <button className="cta inline" onClick={() => { const e = checkToExperiment(r); set((p) => ({ extra: [...p.extra.filter((x) => !x.id.startsWith("today-")), e], activeId: e.id, guess: null, thresh: null, editThresh: false, copied: false })); go("today"); }}>Show me how</button>
              </div>
            )}
          </div>
        </div>
      );
    }
    else if (step.kind === "card") {
      const o = step.opt; const st = s.standing[o.id];
      body = (
        <div className="titlecard">
          <span className="life">Life {o.id} · {o.label}</span>
          <p className="h">{st?.headline || o.label}<br />{cap(HORIZON.replace(" from now", ""))} later.</p>
          {st && (
            <div className="standing">
              <span className="k"><span className="src">guess</span> Most likely</span>
              <span className="t">{st.guess}</span>
              {st.well && <span><b>If it goes well:</b> {st.well}</span>}
              {st.badly && <span><b>If it goes badly:</b> {st.badly}</span>}
            </div>
          )}
          {o.id === dayOpts[0].id && (
            // Everything the user gave goes into both lives: show it once, before the first one plays.
            <div className="built">
              <span className="k">Built from what you told it</span>
              <div className="tags">{[...wordList.map((w) => `“${w}”`), ...answerList.map((x) => x.answer), profile?.place, ...dayOpts.map((x) => moneyOf(x.id).src === "you" && moneyNote(x.id) ? `${x.id}: ${moneyNote(x.id)}` : null)].filter(Boolean).map((x) => <span key={x!}>{x}</span>)}</div>
            </div>
          )}
          {s.five && <p className="cond"><span className="src">computed</span> {savingsWords(pathOf(o.id), s.u?.numbers?.monthlyCostUsd)}{moneyNote(o.id) ? ` · ${moneyNote(o.id)}` : ""}{kidsLine() ? ` · ${kidsLine()!.said}` : ""}</p>}
          <span className="fine">Hypothetical. A guess, not a prediction.</span>
          <span className="credit">Muse Wonder wrote both lives in one pass · Muse Image drew each scene · money computed in code</span>
          <button className="cta" onClick={next}>Live it</button>
        </div>
      );
    }
    else if (step.kind === "felt") {
      const o = step.opt; const felt = feltIn(o.id);
      const isLast = o.id === dayOpts[dayOpts.length - 1].id;
      const toggle = (f: string) => set((p) => {
        const cur = (p.play.feel[o.id] ?? "").split(", ").filter(Boolean);
        const nextF = cur.includes(f) ? cur.filter((x) => x !== f) : cur.length < 2 ? [...cur, f] : cur;
        return { play: { ...p.play, feel: { ...p.play.feel, [o.id]: nextF.join(", ") } } };
      });
      body = (
        <div className="titlecard">
          <span className="life">End of life {o.id}</span>
          <p className="h">How did that life feel?</p>
          <p className="fine">Tap up to two.</p>
          <div className="feel">{FEELS.map((f) => <button key={f} aria-pressed={felt.includes(f)} onClick={() => toggle(f)}>{f}</button>)}</div>
          <button className="cta" disabled={felt.length === 0} onClick={next}>{isLast ? "Put them side by side" : "Now live the other life"}</button>
        </div>
      );
    }
    else {
      const { opt, mo } = step; const m = step.m ?? 0;
      const k = `${opt.id}-${m}`;
      const chose = s.play.choice[k];
      const needChoice = !!mo!.choices && chose == null;
      const lines = mo!.text.match(/[^.!?]+[.!?]+["”]?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [mo!.text];
      const at = (j: number) => ({ animationDelay: `${(0.6 + j * 1.4) * (recording ? 0.5 : 1)}s` });
      body = (
        <div className="film">
          <div className="frame">
            <span className="reel" aria-label={`Life ${opt.id}, scene ${m + 1} of 3`}>{[0, 1, 2].map((j) => <i key={j} className={j <= m ? "on" : ""} />)}</span>
            <span className="when">{mo!.time}</span><span className="beat">{BEATS[m] ?? ""}</span>
            {scenes[k] && scenes[k] !== SKIPPED ? <img src={scenes[k]!} alt="" /> : (
              // No picture yet: a warm, slowly developing frame instead of a black box. If it never comes, the frame just stays warm.
              <div className={`filmdev${scenes[k] === undefined ? " on" : ""}`} aria-hidden="true">
                {scenes[k] === undefined && <span className="devlabel"><i />Developing the picture</span>}
                {scenes[k] === SKIPPED && <span className="devlabel">Picture skipped in test</span>}
              </div>
            )}
          </div>
          <div className="subs">
            {chose == null ? <>
              {lines.map((l, j) => <p key={j} style={at(j)}>{l}</p>)}
              {mo!.voice && <p className="voice" style={at(lines.length)}>“{mo!.voice.replace(/^["“]|["”]$/g, "")}”{mo!.voiceBy && <small>— {mo!.voiceBy}</small>}</p>}
            </> : <>
              <p className="chosen">{mo!.choices![chose]}.</p>
              {mo!.outcomes?.[chose] && <p className="outcome">→ {mo!.outcomes[chose]}</p>}
            </>}
          </div>
          {needChoice
            ? <div className="stack choices" style={at(lines.length + 1)}>{mo!.choices!.map((c, i) => <button key={c} className="btn choice" onClick={() => set((p) => ({ play: { ...p.play, choice: { ...p.play.choice, [k]: i } } }))}>{c}</button>)}</div>
            : <button className="tapnext" style={chose == null ? at(lines.length + 1) : undefined} onClick={next}>Continue</button>}
        </div>
      );
    }
  }

  else if ((s.screen === "today" || s.screen === "guess") && active?.measure) {
    const n = active.measure.n, g = s.guess, t = s.thresh ?? (g != null ? Math.max(0, g - 1) : null);
    const p = g != null && t != null ? flipChance(g, t, n) : null;
    const isToday = active.id.startsWith("today-") && s.reflect;
    const c = s.reflect?.check;
    const saveGuess = () => {
      const start = (e: Experiment): Experiment => e.id === active.id ? { ...e, status: "active", measure: { ...e.measure!, guess: g!, threshold: t!, thresholdTouched: true } } : e;
      set((st) => ({ startedAt: new Date().toISOString(), thresh: t, extra: st.extra.map(start), plan: st.plan?.map(start) ?? null }));
    };
    const copy = async () => { try { await navigator.clipboard.writeText(c!.message); set({ copied: true }); } catch { set({ copied: false }); } };
    body = (
      <>
        <span className="k">{isToday ? `Today · about ${c!.minutes} min · free · low risk` : `${LEVEL_TAG[active.level]} · ${active.durationDays} days`}</span>
        <p className="h">{active.title}</p>
        {isToday && (
          <>
            <div className="split">
              <div className="box"><span className="k">Who to ask</span>{c!.who.slice(0, 2).map((x) => <span key={x}>{x}</span>)}</div>
              <div className="box"><span className="k">Where to find them</span>{c!.where.slice(0, 2).map((x) => <span key={x}>{x}</span>)}</div>
            </div>
            <div className="card">
              <span className="k">A message you can send</span>
              <p className="msg">{c!.message}</p>
              <button className="btn" onClick={copy}>{s.copied ? "Copied" : "Copy message"}</button>
            </div>
          </>
        )}
        {!isToday && active.steps.length > 0 && <details><summary>How to run it</summary><ol className="steps">{active.steps.map((x) => <li key={x}>{x}</li>)}</ol></details>}
        <div className="box">
          <span>Before you send it: if you ask {n} people “{active.measure.question}”, how many will say yes?</span>
          {active.measure.yesMeans && <span className="fine">A yes is good news for “{activeOpt?.label}”: {lower(active.measure.yesMeans)}.</span>}
          <div className="picker">{Array.from({ length: n + 1 }, (_, i) => <button key={i} aria-pressed={g === i} onClick={() => set({ guess: i })}>{i}</button>)}</div>
          {g != null && t != null && !s.editThresh && <span className="fine">{t} or fewer would make you rethink “{activeOpt?.label}”. <button className="link" style={{ padding: 0, minHeight: 0, fontSize: "inherit" }} onClick={() => set({ editThresh: true })}>Change</button></span>}
          {s.editThresh && <><span className="fine">What result would make you rethink?</span><div className="picker">{Array.from({ length: n }, (_, i) => <button key={i} aria-pressed={t === i} onClick={() => set({ thresh: i })}>{i}</button>)}</div></>}
        </div>
        {p != null && g != null && t != null && (
          <details className="odds" aria-live="polite">
            <summary>Why a few answers can be luck</summary>
            <p>Even if your guess of {g} is right, there&apos;s {chancePhrase(p)} that only {t === 0 ? "0" : `0–${t}`} of {n} say yes, just by chance.</p>
            <p className="fine">Worked out from your guess with a beta-binomial model (about {Math.round(p * 100)}%), not by the AI.</p>
          </details>
        )}
        {g != null && t != null && <Receipt date={fmt(today())} guess={g} n={n} thresh={t} optionLabel={activeOpt?.label ?? ""} />}
        <button className="cta" disabled={g == null} onClick={() => { saveGuess(); go("home"); }}>{isToday ? "Save my guess" : "Start this test"}</button>
        {isToday && <p className="fine" style={{ textAlign: "center" }}>Send the message whenever you&apos;re ready. Add the replies later.</p>}
        {isToday && s.demoProfile && <button className="link" style={{ display: "block", margin: "8px auto 0" }} disabled={g == null} onClick={() => {
          const reply = (c && sampleReplies(c.who[0], active.measure!.n, active.measure!.question)) ?? s.sampleLog ?? EXAMPLE_LOG;
          saveGuess();
          if (recording) replayReveal(reply, { ...active.measure!, guess: g!, threshold: t!, thresholdTouched: true }); else { set({ transcript: reply }); go("log"); }
        }}>Demo: skip ahead with sample replies</button>}
      </>
    );
  }

  else if (s.screen === "plan") {
    if (!s.plan) body = <Loading title="Designing more tests…" sub="Muse Wonder is looking for other cheap ways to learn what matters." />;
    else {
      const mine = s.plan.filter((e) => e.optionId === s.practice && e.level !== 3);
      const shown = mine.filter((e) => e.status === "recommended" || e.status === "alternative");
      const skipped = s.plan.filter((e) => e.status === "skipped");
      const excluded = s.plan.filter((e) => e.status === "excluded");
      body = (
        <>
          <p className="h">More ways to test</p>
          <div className="chips">{s.u.options.map((o) => <button key={o.id} aria-pressed={s.practice === o.id} onClick={() => set({ practice: o.id })}>{o.id} · {o.label}</button>)}</div>
          {shown.length === 0 && <p className="sub">No safe test found for this future yet.</p>}
          {shown.map((e) => (
            <div key={e.id} className="card">
              <span className="row"><span className="tag">{LEVEL_TAG[e.level]}</span><span className="meta">{e.durationDays} {e.durationDays === 1 ? "day" : "days"} · ${e.costUsd}</span></span>
              <span style={{ fontWeight: 600 }}>{e.title}</span>
              <span className="fine">{e.sensitivityReason}</span>
              <button className="btn" onClick={() => startTest(e)}>Start this test</button>
            </div>
          ))}
          <div className="stack fine">
            {skipped.map((e) => <span key={e.id}><b style={{ color: "var(--ink)" }}>Skipped:</b> {lower(e.title)}. {e.statusReason}</span>)}
            {excluded.map((e) => <span key={e.id}><b style={{ color: "var(--ink)" }}>Never suggested:</b> {lower(e.title)}. {e.statusReason}</span>)}
          </div>
        </>
      );
    }
  }

  else if (s.screen === "home" || ((s.screen === "today" || s.screen === "guess" || s.screen === "log" || s.screen === "confirm" || s.screen === "reveal" || s.screen === "still") && !active)) {
    const started = s.startedAt;
    body = (
      <>
        <p className="h">{s.u.question}</p>
        {photoRow(true)}
        {active && started && (
          <div className="card hi">
            <span className="k">Checking now</span>
            <span className="t">{active.title}</span>
            {active.measure?.guess != null && <Receipt date={fmt(new Date(started))} guess={active.measure.guess} n={active.measure.n} thresh={active.measure.threshold ?? 0} optionLabel={activeOpt?.label ?? ""} />}
            <span className="fine">When people reply, add what they said. Even a few replies count.</span>
            <button className="cta inline" onClick={() => go("log")}>Add what happened</button>
            <button className="btn" onClick={() => remindTomorrow(active.title)}>Remind me tomorrow</button>
            <span className="fine">Adds a 9:00 reminder to your own calendar. Futurial doesn&apos;t send anything.</span>
          </div>
        )}
        {!started && s.reflect && <button className="cta inline" onClick={() => go("live")}>See today&apos;s check</button>}
        {!s.days && <button className="cta inline" onClick={() => go("five")}>Live both weeks</button>}
        <div className="row">
          {s.days && <button className="link" onClick={() => { set({ play: { i: 0, feel: {}, choice: {}, guess: {}, shown: {} } }); go("live"); }}>Live both weeks again</button>}
          <button className="link" onClick={() => { set((p) => ({ practice: p.practice ?? active?.optionId ?? s.u!.options[0].id })); go("plan"); }}>More ways to test</button>
        </div>
      </>
    );
  }

  else if (s.screen === "log" && active) body = (
    <>
      <span className="k">{active.title}</span>
      <p className="h">What happened?</p>
      {active.measure && <p className="sub">You asked: “{active.measure.question}”</p>}
      <textarea aria-label="What happened" placeholder="Tell it in your own words. Who said what?" value={s.transcript} onChange={(e) => set({ transcript: e.target.value })} />
      <div className="row"><Dictate onText={(t) => set({ transcript: t })} /><button className="link" onClick={() => set({ transcript: s.sampleLog ?? EXAMPLE_LOG })}>Use a sample note</button></div>
      {s.error && <p className="err">{s.error}</p>}
      <button className="cta" disabled={s.transcript.trim().length < 10} onClick={saveLog}>Save</button>
    </>
  );

  else if (s.screen === "confirm" && active?.measure && s.ev) {
    const n = s.ev.count?.n ?? active.measure.n;
    body = (
      <>
        <p className="h">Just to check: how many of {n} said yes?</p>
        {s.ev.count && (s.ev.count.no != null || s.ev.count.unclear != null) && <p className="sub">From your note: {s.ev.count.yes} yes · {s.ev.count.no ?? 0} no · {s.ev.count.unclear ?? 0} not sure</p>}
        {s.ev.count == null && <p className="sub">Futurial couldn&apos;t tell from your note{s.ev.unclear ? ` (${lower(s.ev.unclear.replace(/\?$/, ""))}?)` : ""}. Tap the number.</p>}
        <div className="picker">{Array.from({ length: n + 1 }, (_, i) => <button key={i} aria-pressed={s.yes === i} onClick={() => set({ yes: i })}>{i}</button>)}</div>
        {s.ev.count != null && <p className="fine">Futurial read this from your note. Change it if it&apos;s wrong.</p>}
        <p className="fine">Only a clear yes counts. &quot;Maybe&quot; or &quot;it depends&quot; counts as not yes, and stays in your note.</p>
        <button className="cta" disabled={s.yes == null} onClick={() => commitEvidence(s.ev!, s.yes)}>That&apos;s right</button>
      </>
    );
  }

  else if (s.screen === "reveal" && active && activeOpt) {
    const m = active.measure, r = s.revealed;
    const idx = s.u.options.findIndex((o) => o.id === activeOpt.id);
    const quoteOf = (f: Fact) => (s.ev?.facts.find((x) => x.label === f.label) as { quote?: string } | undefined)?.quote;
    body = (
      <>
        <div className="row"><span className="k">{active.title}</span>{s.demo.evidence && <span className="tag demo">Demo data</span>}</div>
        {m && m.guess != null && (
          <div className="vs">
            <div className="mine"><span className="n">{m.guess} of {m.n}</span><span className="l">Your guess</span></div>
            <button className={`real${r ? " on" : ""}`} disabled={r} onClick={() => set({ revealed: true })} aria-label="Reveal what happened">
              <span className="n">{r ? `${s.yes} of ${s.ev?.count?.n ?? m.n}` : "?"}</span><span className="l">{r ? (s.ev?.count && (s.ev.count.no != null || s.ev.count.unclear != null) ? `said yes · ${s.ev.count.no ?? 0} no · ${s.ev.count.unclear ?? 0} not sure` : "Said yes") : "Tap to see what happened"}</span>
            </button>
          </div>
        )}
        <Photo label={`${activeOpt.id} · ${activeOpt.label}`} image={s.photos[activeOpt.id]} clarity={r ? clarityOf(activeOpt.id) : "none"} facts={r ? factsOf(activeOpt.id) : []} sample={sampleOf(activeOpt.id)} variant={idx} big blankText="Ready to develop"
          onPin={(f) => set({ pinQuote: quoteOf(f) ?? null })} />
        {r && (
          <div className="later stack" style={{ gap: 14 }}>
            <p className="fine" style={{ textAlign: "center" }}>A clearer photo means you know more. It doesn&apos;t mean this future is better.</p>
            {m && m.threshold != null && s.yes != null && <p style={{ fontWeight: 600 }}>{s.yes <= m.threshold ? `This is at or below your rethink line (${m.threshold} or fewer). Before you asked, you said you'd rethink “${activeOpt.label}” if this happened. Rethinking can still end in yes.` : `This stayed above your rethink line (${m.threshold} or fewer).`}</p>}
            {s.pinQuote && <p className="quote">From your note: “{s.pinQuote}”</p>}
            <div className="see"><span className="k">What you can see now</span><p>{s.see?.line ?? "…"}</p></div>
            {m && m.guess != null && <Receipt date={fmt(new Date(s.startedAt ?? Date.now()))} guess={m.guess} n={m.n} thresh={m.threshold ?? 0} optionLabel={activeOpt.label} result={{ yes: s.yes ?? 0, date: fmt(today()) }} />}
            <p className="box" style={{ color: "var(--ink)" }}>You found this out before risking anything.</p>
            <button className="cta inline" onClick={() => go("still")}>Update my note</button>
          </div>
        )}
      </>
    );
  }

  else if (s.screen === "still" && active && activeCrux) {
    const ev = s.evidence.find((e) => e.experimentId === active.id && e.kind !== "simulated_reaction");
    const pt = ev ? pointsTo(active, ev) : null;
    const cur = (s.upd?.kind === "update" ? s.upd.to : s.conf[activeCrux.id]) ?? null;
    const evPos = pt?.pointsTo ?? null;
    const prior = active.measure?.guess != null ? chanceMost(...priorFromGuess(active.measure.guess, active.measure.n)) : null;
    const setTo = (to: Confidence, kind: "update" | "keep") => set((p) => ({ upd: { kind, to }, conf: { ...p.conf, [activeCrux.id]: to } }));
    body = (
      <>
        <span className="k">After this, how sure are you that…</span>
        <p className="h">“{activeCrux.statement}”</p>
        <Scale value={cur} evidence={evPos} onChange={s.picking || cur == null || evPos == null ? (v) => setTo(v as Confidence, "update") : undefined} />
        <details><summary>{evPos != null ? "Why does the evidence point there?" : "What did you find?"}</summary>
          {pt && prior != null ? <p>Your guess of {active.measure!.guess} of {active.measure!.n} meant about a {Math.round(prior * 100)}% chance that most would say yes. After {ev!.count!.yes} of {ev!.count!.n} said yes, it&apos;s about {Math.round(pt.postProb * 100)}%. {pt.flipped && <> A yes counts against “{activeCrux.statement}”, so few yeses point toward it being true.</>} With only {ev!.count!.n} people, it&apos;s a small sample, not proof. (Futurial counted your guess as much as {active.measure!.n} answers.)</p> : <p>{s.see?.line ?? "This test didn't give a number, so Futurial won't suggest one. Decide how it feels to you."}</p>}
        </details>
        {evPos == null && !s.upd && <p className="sub">This test didn&apos;t give a count, so Futurial won&apos;t suggest a spot. Tap where it feels right now.</p>}
        {s.picking || (evPos == null && !s.upd) ? (
          // The user is placing it themselves: the circles above are live.
          <button className="cta" disabled={!s.upd} onClick={() => { set({ picking: false }); go("next"); }}>See what you could do next</button>
        ) : s.upd ? (
          <><p className="done" style={{ color: "var(--accent)", fontWeight: 600 }}>{s.upd.kind === "keep" ? "Kept" : "Updated to"}: {WORDS[s.upd.to]}</p><button className="cta" onClick={() => go("next")}>See what you could do next</button></>
        ) : (
          <div className="stack">
            {evPos != null && evPos !== cur && <button className="btn" onClick={() => setTo(evPos as Confidence, "update")}>Move to “{WORDS[evPos]}”</button>}
            <button className="btn" onClick={() => set({ picking: true })}>Choose a different spot</button>
            {cur != null && <button className="btn" onClick={() => setTo(cur as Confidence, "keep")}>Keep “{WORDS[cur]}”</button>}
          </div>
        )}
      </>
    );
  }

  else if (s.screen === "next" && decision) {
    const nm = nextMove(decision, today());
    const stop = stopConditions(decision, today());
    const blurryNames = stop.blurry.map((o) => `${o.id} · ${s.u!.options.find((x) => x.id === o.id)?.label}`);
    const choices: { key: string; title: string; why: string; act: () => void }[] = [];
    if (nm && nm.id !== active?.id) choices.push({ key: "nm", title: nm.title, why: nm.sensitivityReason, act: () => startTest(nm) });
    if (s.see) choices.push({ key: "fu", title: s.see.followUp.title, why: s.see.followUp.why, act: chooseFollowUp });
    if (active?.measure && active.measure.n < 10) choices.push({ key: "more", title: `Ask ${active.measure.n} more people the same question`, why: `${active.measure.n} answers is a small sample. More answers make this future's photo clearer.`, act: askMore });
    body = (
      <>
        <p className="h">What could you do next?</p>
        <p className="sub">Pick one. Each is small and easy to undo.</p>
        <div className="stack">
          {choices.map((c) => (
            <div key={c.key} className="card">
              <span style={{ fontWeight: 600, fontSize: 16.5 }}>{c.title}</span><span className="fine">{c.why}</span>
              <button className="btn" onClick={c.act}>Start this test</button>
            </div>
          ))}
          <div className="card">
            <span style={{ fontWeight: 600, fontSize: 16.5 }}>Decide now</span>
            {s.decided == null
              ? <><span className="fine">Write down what you decided and why. You can change it later.</span><button className="btn" onClick={() => set({ decided: "" })}>Write my decision</button></>
              : <textarea aria-label="My decision" style={{ minHeight: 100 }} placeholder="I decided to… because…" value={s.decided} onChange={(e) => set({ decided: e.target.value })} />}
          </div>
        </div>
        <p>{blurryNames.length ? <>No evidence yet for <b>{blurryNames.join(", ")}</b>.</> : "Every future has some evidence now."}</p>
        <details><summary>What&apos;s still open?</summary><ul className="steps">{stop.checks.map((c) => <li key={c.id}>{c.text}</li>)}</ul></details>
        {scorecard()}
        {photoRow(true)}
        <p className="fine" style={{ textAlign: "center" }}>Futurial won&apos;t tell you which path to take.</p>
      </>
    );
  }

  else body = <Loading title="One moment…" />;

  const film = s.screen === "live" && !!s.days && s.play.i < steps.length && !s.busy;
  const loopIdx = LOOP_OF[s.screen];
  const demoSteps = Object.keys(s.demo);
  return (
    <main className={`app night${film ? " cinema" : ""}${recording ? " fast" : ""}`}>
      {splash && <div className="splash" role="button" aria-label="Skip intro" style={recording ? { animationDelay: `${SPLASH_LONG_MS / 1000}s` } : undefined} onClick={() => setSplash(false)} onAnimationEnd={(e) => e.target === e.currentTarget && setSplash(false)}><img src="/logo-dark.svg" alt="" /><span className="name">Futu<span className="r">rial</span></span><span className="tagline">Try before you life.</span><span className="line">Live five years ahead in two futures. Then choose with clear eyes.</span></div>}
      <header className="top">
        <button className="brand" onClick={() => s.u && s.screen !== "live" && go("home")} aria-label="Futurial home">
          <img className="logo-l" src="/logo.svg" alt="" /><img className="logo-d" src="/logo-dark.svg" alt="" />
          <span>Futu<span className="r">rial</span></span>
        </button>
        <span className="dots" aria-label={`Step: ${LOOP[loopIdx]}`}>{LOOP.map((_, i) => <i key={i} className={i < loopIdx ? "on" : i === loopIdx ? "now" : ""} />)}<span>{LOOP[loopIdx]}</span></span>
      </header>
      <section className="screen" key={s.screen + (s.busy ? "-busy" : "") + (s.screen === "live" ? s.play.i : "")}>
        {s.demoProfile && !s.busy && !recording && <p className="banner">Demo profile: {s.demoProfile} (fictional)</p>}
        {demoSteps.length > 0 && !s.busy && <p className="banner">Demo mode: using sample data for {demoSteps.join(", ")}. Add your API key to .env.local to go live.</p>}
        {body}
        {s.u && !s.busy && s.screen !== "live" && (
          <div className="foot">
            {s.screen !== "home" ? <button className="link" onClick={() => go("home")}>Home</button> : <span />}
            <button className="link" style={{ color: "var(--muted)" }} onClick={() => { if (confirmReset) { localStorage.removeItem(KEY); localStorage.removeItem(KEY + ":photos"); setS({ ...INITIAL, screen: profile ? "start" : "profile" }); setScenes({}); setConfirmReset(false); } else setConfirmReset(true); }}>{confirmReset ? "Tap again to erase everything" : "Start over"}</button>
          </div>
        )}
      </section>
    </main>
  );
}
