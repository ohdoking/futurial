import { ask, liveOrDemo } from "@/lib/ai";
import { demoDays } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { DaysOut, daysPrompt } from "@/lib/prompts";

// Both futures' days in one call, so each time slot contrasts the two lives.
export async function POST(req: Request) {
  const body = await req.json();
  const live = async () => {
    const out = await ask(MODELS.deep, daysPrompt(body), DaysOut, { temperature: 0.8, maxTokens: 10000 });
    const ids: string[] = body.options.map((o: { id: string }) => o.id);
    if (!out.slots.every((sl) => ids.every((id) => sl.moments[id]))) throw new Error("A future is missing from a slot");
    return out;
  };
  return liveOrDemo(live, demoDays);
}
