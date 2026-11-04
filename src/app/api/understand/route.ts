import { ask, liveOrDemo } from "@/lib/ai";
import { demoUnderstand } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { type Profile, UnderstandOut, understandPrompt } from "@/lib/prompts";

// Model calls can take 30s or more (longer with a retry); keep the function alive for them.
export const maxDuration = 120;

export async function POST(req: Request) {
  const { dilemma, profile } = (await req.json()) as { dilemma: string; profile?: Profile | null };
  return liveOrDemo(() => ask(MODELS.fast, understandPrompt(String(dilemma).slice(0, 4000), profile), UnderstandOut, { temperature: 0.4 }), demoUnderstand);
}
