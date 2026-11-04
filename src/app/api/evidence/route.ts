import { ask, liveOrDemo } from "@/lib/ai";
import { demoEvidence } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { EvidenceOut, evidencePrompt } from "@/lib/prompts";

export async function POST(req: Request) {
  const body = await req.json();
  return liveOrDemo(() => ask(MODELS.fast, evidencePrompt({ ...body, transcript: String(body.transcript).slice(0, 4000) }), EvidenceOut, { temperature: 0.1, effort: "minimal" }), demoEvidence);
}
