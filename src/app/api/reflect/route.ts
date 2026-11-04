import { ask, liveOrDemo } from "@/lib/ai";
import { demoReflect } from "@/lib/demo";
import { MODELS } from "@/lib/meta";
import { ReflectOut, reflectPrompt } from "@/lib/prompts";

export async function POST(req: Request) {
  const body = await req.json();
  return liveOrDemo(() => ask(MODELS.deep, reflectPrompt(body), ReflectOut, { temperature: 0.5 }), demoReflect);
}
