// Fictional demo profiles. Load with ?demo=sarah (main) | alex | seoyeon | hyunwoo. Always labeled "Demo profile" in the UI.
import type { Profile } from "./prompts";

export type DemoProfile = { name: string; profile: Profile; dilemma: string; log: string; forName?: string;
  /** Filled in for a screen recording (?record), so a replay matches the rehearsal exactly: words, then "Who are you doing this for?" (other questions take their first answer). */
  record?: { words: string[]; forWhom: string } };

export const DEMOS: Record<string, DemoProfile> = {
  sarah: {
    name: "Sarah",
    profile: { place: "Austin, Texas", age: "30s", household: ["Partner", "Kids"], currency: "USD" },
    dilemma: "I'm a marketing manager and I've been offered a product manager role at a startup. It pays about 15% less. My husband is a freelancer and his income goes up and down. We have two kids, 5 and 8. I really want this job, but I'm scared we can't handle less money, and that I'll miss more of their evenings.",
    log: "I asked five product managers who are parents. Only one said they usually make it home for dinner. Two said it depends on launch weeks. Two said they usually eat late.",
    forName: "Mia, Leo",
    record: { words: ["guilt", "growth", "kids"], forWhom: "My kids" },
  },
  alex: {
    name: "Alex",
    profile: { place: "United States", age: "30s", household: ["Partner"], currency: "USD" },
    dilemma: "I'm a senior PM at a logistics company. I'm thinking about quitting to build an AI tool that chases late invoices for freelancers. I have about 9 months of savings, but I'm scared of giving up a steady paycheck.",
    log: "I asked 5 freelancers. Only one said they would pay $15 a month. Three said their accounting app already sends reminders.",
  },
  seoyeon: {
    name: "Seoyeon",
    profile: { place: "Seoul", age: "30s", household: ["Partner", "Kids"], currency: "USD" },
    dilemma: "I'm a marketing manager thinking about moving into a product manager role at a startup. It pays about 15% less, and my husband's freelance income is unstable. We have two kids, 5 and 8.",
    log: "I had coffee with 4 PMs at startups. 3 said the first months had a lot of late nights. One said her team is flexible about school pickup.",
  },
  hyunwoo: {
    name: "Hyunwoo",
    profile: { place: "Elsewhere in Korea", age: "40s", household: ["Partner", "Kids"], currency: "USD" },
    dilemma: "I'm a production team lead at an auto parts company, 20 years in. I'm thinking about taking early retirement and opening a small café in my neighborhood with the payout. I've never run a business.",
    log: "I asked 6 neighbors. 2 said they would come weekly. Most said they already have a café they like.",
  },
};
