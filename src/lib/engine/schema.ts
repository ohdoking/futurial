// Futurial data model (v0.3).
// Who fills each field is marked: [user], [llm] (Muse Spark output), [code] (deterministic rules in scoring.ts).
// The LLM never fills a probability or a confidence.

/** 0 Definitely not · 1 Probably not · 2 Not sure · 3 Probably · 4 Definitely */
export type Confidence = 0 | 1 | 2 | 3 | 4;

export type Impact = "high" | "medium" | "low";
export type Sensitivity = "high" | "medium" | "low" | "none";
export type Risk = "low" | "medium" | "high";

export interface Decision {
  id: string;
  question: string;            // [llm] short title, e.g. "Quit to build?"
  dilemma: string;             // [user] raw text or transcript
  createdAt: string;           // ISO date
  deadline: string | null;     // [user]
  options: Option[];           // [llm] 2–3
  cruxes: Crux[];              // [llm] statements; confidence is [user]
  experiments: Experiment[];   // [llm] candidates; status/ranking is [code]
  evidence: Evidence[];        // [user] input, facts extracted by [llm]
  beliefUpdates: BeliefUpdate[];
}

export interface Option {
  id: string;                  // "A", "B"
  label: string;               // [llm] "Quit and build"
}

export interface Crux {
  id: string;
  statement: string;           // [llm] one testable sentence, e.g. "Most freelancers would pay $15 a month"
  optionIds: string[];         // [llm] which futures it blurs
  kind: "fact" | "preference"; // [llm] facts get real tests; preferences can use simulations
  impact: Impact;              // [llm] how much the decision hinges on it
  confidence: Confidence | null; // [user] null until asked
}

export interface CountMeasure {
  type: "count";
  n: number;                   // [llm] sample size, e.g. 5
  question: string;            // [llm] "Would you pay for this next month?"
  guess: number | null;        // [user] expected yes count
  threshold: number | null;    // [user] or [code] autoThreshold(guess): "this many or fewer → think twice"
  thresholdTouched: boolean;   // [user] true once the user edits the threshold
  yesMeans?: string;           // [llm] what a yes says in favor of the option (questions are phrased so yes = support)
  yesSupportsCrux?: boolean;   // [llm] false when a yes makes the crux statement LESS true (e.g. crux "needs late evenings", question "home by 6:30?")
}

export interface Experiment {
  id: string;
  optionId: string;            // [llm]
  cruxIds: string[];           // [llm]
  level: 1 | 2 | 3;            // [llm] 1 real test · 2 try it on · 3 hypothetical
  title: string;               // [llm]
  steps: string[];             // [llm]
  durationDays: number;        // [llm]
  costUsd: number;             // [llm]
  reversible: boolean;         // [llm]
  risk: Risk;                  // [llm]
  riskFlags: string[];         // [llm] e.g. ["financial"], ["medical"], ["legal"]
  sensitivity: Sensitivity;    // [llm] would any result change the decision? "none" → skipped
  sensitivityReason: string;   // [llm] one sentence shown to the user
  measure: CountMeasure | null;
  scenario: Scenario | null;   // level 3 only
  status: "candidate" | "recommended" | "alternative" | "skipped" | "excluded" | "active" | "done"; // [code] except active/done [user]
  statusReason: string | null; // [code] shown for skipped/excluded
  startedAt: string | null;
}

export interface Scenario {
  label: "hypothetical";       // always shown as "Hypothetical · AI-generated"
  inputs: Record<string, number | string>; // [user] numbers the scenario is built from (savings, rent…)
  moments: Moment[];           // [llm] exactly 4
}

export interface Moment {
  time: string;                // "07:40"
  text: string;                // [llm] ≤ 30 words, second person, present tense
  choices: string[] | null;    // [llm] 2 options on exactly one moment
}

export type EvidenceKind = "external_fact" | "behavior" | "emotion" | "simulated_reaction";

export interface Evidence {
  id: string;
  experimentId: string;
  loggedAt: string;
  kind: EvidenceKind;          // [llm] classified, [user] can correct
  source: "voice" | "text" | "checkin" | "scenario";
  transcript: string | null;   // [user] via Voice Transcribe
  count: { yes: number; n: number } | null; // [llm] extracted, [user] confirms
  facts: Fact[];               // [llm] pinned on the photo, max 3
  reactions: Reaction[];       // simulated_reaction only
  isDemo: boolean;             // shows the "Demo data" tag
}

export interface Fact {
  label: string;               // "Would pay"
  value: number | null;        // 1, or null for "most", "a few" (the word goes in the label)
  of: number | null;           // 5
}

export interface Reaction {
  momentIndex: number;
  feeling: "Energized" | "Calm" | "Anxious" | "Trapped" | "Proud";
  choice: number | null;
}

export interface BeliefUpdate {
  cruxId: string;
  evidenceIds: string[];
  from: Confidence;            // [user] before
  pointsTo: Confidence | null; // [code] for count measures; null = no number, show reasoning only
  priorProb: number | null;    // [code]
  postProb: number | null;     // [code]
  reason: string;              // [llm] for non-count evidence, [code] template for count evidence
  decision: "pending" | "update" | "keep";
  to: Confidence | null;       // [user]
}
