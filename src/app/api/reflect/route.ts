import { ask, liveOrDemo } from "@/lib/ai";
import { demoReflect } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { ReflectOut, reflectPrompt } from "@/lib/prompts";

// Model calls can take 30s or more (longer with a retry); keep the function alive for them.
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await req.json();
  return liveOrDemo(() => ask(MODELS.deep, reflectPrompt(body), ReflectOut, { temperature: 0.5 }), demoReflect);
}
