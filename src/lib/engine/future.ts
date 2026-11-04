// Five years out, computed in code. The model never makes these numbers: it gets them as facts.
// Money is counted in "months of today's costs", so it works even when the user gave no dollar amounts.

export type Source = "you" | "guess" | "assumption";
export type Assume = {
  savingsMonths: number; // savings today, in months of costs
  cover: number;         // household income today as % of monthly costs (110 = 10% left over each month)
  share: number;         // the user's pay as % of household income
  raise: number;         // yearly raise, %
  infl: number;          // yearly price rise, %
};
export type WhatIf = "none" | "halfIncome" | "bill" | "prices";
export const WHAT_IFS: { id: Exclude<WhatIf, "none">; label: string; fact: string }[] = [
  { id: "halfIncome", label: "Household income halves for 3 months", fact: "in year 1, the household lives on half its income for 3 months" },
  { id: "bill", label: "A surprise bill, one month of costs", fact: "in year 1, a surprise bill costs one month of living costs" },
  { id: "prices", label: "Prices rise 6% a year", fact: "prices rise 6% a year instead of the usual" },
];
export const MONTHS = 60;

/** Savings at the end of each month 0..months, in months of today's costs. payChangePct applies to the user's own pay. */
export function savingsPath(a: Assume, payChangePct: number, whatIf: WhatIf = "none", months = MONTHS): number[] {
  const infl = whatIf === "prices" ? 6 : a.infl;
  const out = [a.savingsMonths];
  let s = a.savingsMonths;
  for (let t = 1; t <= months; t++) {
    const year = Math.floor((t - 1) / 12);
    const pay = (a.share / 100) * (1 + payChangePct / 100) + (1 - a.share / 100);
    let income = (a.cover / 100) * pay * (1 + a.raise / 100) ** year;
    if (whatIf === "halfIncome" && t >= 7 && t <= 9) income /= 2;
    const cost = (1 + infl / 100) ** (t / 12) + (whatIf === "bill" && t === 7 ? 1 : 0);
    s += income - cost;
    out.push(s);
  }
  return out;
}

/** First month savings drop below zero, or null if they never do. */
export const runsOut = (path: number[]) => { const i = path.findIndex((v, t) => t > 0 && v < 0); return i < 0 ? null : i; };

/** "about 9 months of costs" / "run out in month 41" — the words the scenes and the screen use. */
export function savingsWords(path: number[], monthlyCostUsd?: number | null): string {
  const out = runsOut(path);
  if (out != null) return `savings run out around month ${out} (year ${Math.ceil(out / 12)})`;
  const end = path[path.length - 1];
  const m = Math.round(end);
  const usd = monthlyCostUsd ? ` (about $${(Math.round((end * monthlyCostUsd) / 1000) * 1000).toLocaleString("en-US")})` : "";
  return m <= 0 ? "savings are almost gone" : `savings cover about ${m} ${m === 1 ? "month" : "months"} of costs${usd}`;
}

/** Starting guesses, each tagged with where it came from. */
export function defaultAssume(n: { savingsMonths?: number | null }, hasPartner: boolean): { a: Assume; src: Record<keyof Assume, Source> } {
  return {
    a: { savingsMonths: n.savingsMonths ?? 3, cover: 110, share: hasPartner ? 60 : 100, raise: 3, infl: 3 },
    src: { savingsMonths: n.savingsMonths != null ? "you" : "guess", cover: "guess", share: "guess", raise: "assumption", infl: "assumption" },
  };
}

/** How the household stands in a life, decided in code from the savings path: the scenes must follow it. */
export function moneyState(path: number[]): { level: "comfortable" | "tight" | "short"; fact: string } {
  const out = runsOut(path);
  const low = Math.min(...path.slice(1));
  const lowYear = Math.ceil((path.indexOf(low) || 1) / 12);
  if (out != null || path[path.length - 1] < 1) return { level: "short", fact: "money is short: the household has already cut or put off real things (a trip, a class, a repair) and a surprise cost means borrowing or a hard choice" };
  if (low < 3 || path[path.length - 1] < 6) return { level: "tight", fact: `money is tight: savings dipped to about ${Math.max(0, Math.round(low))} ${Math.round(low) === 1 ? "month" : "months"} of costs in year ${lowYear}, so a surprise cost means putting one concrete thing off` };
  return { level: "comfortable", fact: "money is comfortable: a surprise cost is paid from savings without changing plans" };
}
