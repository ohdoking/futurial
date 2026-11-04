import { ask, liveOrDemo } from "@/lib/ai";
import { demoDays } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { OutlineOut, outlinePrompt } from "@/lib/prompts";

// Model calls can take 30s or more (longer with a retry); keep the function alive for them.
export const maxDuration = 120;

// A fast plan of the two days (times + what differs), shown while the full days are written.
export async function POST(req: Request) {
  const body = await req.json();
  return liveOrDemo(
    () => ask(MODELS.fast, outlinePrompt(body), OutlineOut, { temperature: 0.6, effort: "minimal", maxTokens: 3000 }),
    () => ({ slots: demoDays().slots.map(({ time, contrast }) => ({ time, contrast })) }),
  );
}
