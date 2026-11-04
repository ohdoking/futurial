import { ask, liveOrDemo } from "@/lib/ai";
import { demoSee } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { SeeOut, seePrompt } from "@/lib/prompts";

// Model calls can take 30s or more (longer with a retry); keep the function alive for them.
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  return liveOrDemo(() => ask(MODELS.fast, seePrompt(body), SeeOut, { temperature: 0.3, effort: "minimal" }), demoSee);
}
