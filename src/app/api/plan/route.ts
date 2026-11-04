import { ask, liveOrDemo } from "@/lib/ai";
import { demoExperiments } from "@/lib/demo";
import type { Experiment } from "@/lib/engine/schema.ts";
import { rankExperiments } from "@/lib/engine/scoring.ts";
import { MODELS } from "@/lib/meta";
import { PlanOut, planPrompt } from "@/lib/prompts";

export async function POST(req: Request) {
  const { decision } = await req.json();
  const live = async () => {
    const out = await ask(MODELS.deep, planPrompt(JSON.stringify(decision)), PlanOut, { temperature: 0.5, maxTokens: 12000, effort: "medium" });
    const exps: Experiment[] = out.experiments.map((e) => ({
      ...e, measure: e.measure ? { ...e.measure, guess: null, threshold: null, thresholdTouched: false } : null,
      scenario: null, status: "candidate", statusReason: null, startedAt: null,
    }));
    return { experiments: rankExperiments(exps) };
  };
  return liveOrDemo(live, () => ({ experiments: rankExperiments(demoExperiments()) }));
}
