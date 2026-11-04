// Demo data (Alex) used when no API key is set or a live call fails. Always flagged as demo in the UI.
import seed from "./engine/seed-alex.json";
import type { Decision, Experiment } from "./engine/schema.ts";

const d = seed as unknown as Decision;

export const demoUnderstand = () => ({
  question: d.question,
  options: [
    { id: "A", label: "Quit and build", scene: "A small kitchen table at night with an open laptop, sticky notes on the wall, a mug, city lights through the window." },
    { id: "B", label: "Keep job, build on the side", scene: "An office desk at dusk with a second laptop open next to a work monitor, a backpack on the chair." },
  ],
  cruxes: d.cruxes.map((c) => ({ id: c.id, statement: c.statement, optionIds: c.optionIds, kind: c.kind, impact: c.impact })),
  numbers: { savingsMonths: 9, monthlyCostUsd: null },
  missing: null,
  questions: [
    { id: "q1", question: "Monthly costs, roughly?", why: "So money moments use your real numbers.", options: ["Under $3,000", "$3,000–$5,000", "Over $5,000"] },
    { id: "q2", question: "Does your partner have steady income?", why: "So the money pressure feels right.", options: ["Yes", "Some", "No partner"] },
  ],
});

export const demoExperiments = (): Experiment[] =>
  d.experiments.map((e) => ({ ...e, status: "candidate", statusReason: null, startedAt: null, scenario: null,
    measure: e.measure ? { ...e.measure, guess: null, threshold: null, thresholdTouched: false } : null }));

const DAYS: Record<string, { time: string; text: string; scene: string; choices: [string, string] | null; outcomes: [string, string] | null }[]> = {
  A: [
    { time: "Tuesday morning", text: "No alarm, no morning meeting. You open your laptop at the kitchen table. A few early customers, not much income yet.", scene: "A kitchen table in morning light with an open laptop and a coffee mug.", choices: null, outcomes: null },
    { time: "Thursday afternoon", text: "One of your first customers asks for a refund: their accounting app already sends reminders.", scene: "A phone on a desk showing an email, a notebook beside it.", choices: ["Refund and ask what's missing", "Offer a free month"], outcomes: ["They reply with two features they'd actually pay for.", "They stay, but stop opening the app."] },
    { time: "Saturday evening", text: "You check your bank app. About one month of savings left. Rent is due Friday.", scene: "A phone showing a banking app on a sofa at night, a lamp on.", choices: null, outcomes: null },
  ],
  B: [
    { time: "Tuesday morning", text: "Train to the office. You reply to work messages and sketch a feature for your side project in your notes.", scene: "A commuter train window with a phone showing a notes app.", choices: null, outcomes: null },
    { time: "Thursday afternoon", text: "In a planning meeting, your manager asks you to lead a new project. It would take your evenings for a month.", scene: "A meeting room table with a laptop and printed slides.", choices: ["Say yes to the project", "Ask to keep evenings free"], outcomes: ["Your side project pauses for a month.", "Your manager agrees, but gives the project to someone else."] },
    { time: "Saturday evening", text: "Your first paying user signs up for the side project while you're making dinner.", scene: "A phone on a kitchen counter showing a notification, a pan on the stove.", choices: null, outcomes: null },
  ],
};

const CONTRASTS = ["How your morning starts", "Who you answer to", "Where money comes from"];
export const demoDays = () => ({
  standing: {
    A: { headline: "You quit to build.", gained: "Your own product, your own hours", gaveUp: "A steady paycheck", hard: "Savings running thin, and nights checking the bank app.", guess: "The tool is still alive: a few hundred paying freelancers, you're the only full-time person, and you took a contract job once.", well: "A thousand paying freelancers and two people working with you.", badly: "You shut it down in year two and went back to a PM job.", basis: "Many solo tools grow slowly and need a bridge job." },
    B: { headline: "You kept the job.", gained: "Steady pay, a bigger role", gaveUp: "Evenings for the side project", hard: "Your own idea stays small while the day job takes your best hours.", guess: "You're a senior PM now, and the side project became a small free tool a few teams use.", well: "You lead a product group, and the side project became a paid tool.", badly: "A reorg stalled your role, and the side project went quiet.", basis: "Side projects often stay small while the day job grows." },
  },
  slots: [0, 1, 2].map((m) => ({ time: DAYS.A[m].time, contrast: CONTRASTS[m], moments: { A: DAYS.A[m], B: { ...DAYS.B[m], time: DAYS.A[m].time } } })),
});

export const demoReflect = () => ({
  line: "You'd carry thin savings over a slow side project, as long as freelancers really pay for this.",
  asLongAs: "freelancers really pay for this",
  check: {
    optionId: "A", cruxId: "pay", title: "Ask 5 freelancers if they'd pay $15 a month", minutes: 20,
    who: ["Freelancers you've worked with", "Friends who run a small studio"],
    where: ["Your LinkedIn contacts", "A local freelancer community chat"],
    message: "Hi! Quick question for a side project. I'm building a tool that follows up on late invoices for freelancers. If it saved you that hassle, would you pay $15 a month for it? A simple yes or no helps a lot.",
    measure: { type: "count" as const, n: 5, question: "Would you pay $15 a month for it?" },
  },
});

export const demoEvidence = () => ({
  kind: "external_fact" as const,
  count: { yes: 1, n: 5 },
  facts: [
    { label: "Would pay", value: 1, of: 5, quote: "only one would actually pay" },
    { label: "Have this problem", value: 4, of: 5, quote: "Four of them hate chasing invoices" },
    { label: "Use a free tool", value: 2, of: 5, quote: "Two said their accounting app already sends reminders" },
  ],
  unclear: null,
});

export const demoTranscript = d.evidence[0].transcript!;

export const demoSee = () => ({
  line: "Freelancers have this problem, but most won't pay $15 for it.",
  followUp: { title: "Ask 5 more freelancers about a $5 price", why: "Shows whether the price, not the problem, is the issue." },
});
