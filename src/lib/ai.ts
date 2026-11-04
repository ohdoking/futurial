import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { chatJSON, hasKey, type Effort } from "./meta";
import { SYSTEM } from "./prompts";

/** Ask the model, validate with zod, retry once with the validation error. */
export async function ask<T>(model: string, prompt: string, schema: z.ZodType<T>, opts: { temperature?: number; maxTokens?: number; effort?: Effort } = {}): Promise<T> {
  const messages = [{ role: "system" as const, content: SYSTEM }, { role: "user" as const, content: prompt }];
  let raw = await chatJSON(model, messages, opts);
  if (raw && typeof raw === "object" && "handoff" in raw) throw new CrisisError();
  let parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  raw = await chatJSON(model, [...messages, { role: "assistant", content: JSON.stringify(raw) }, { role: "user", content: `That JSON did not match the required shape: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Return the corrected JSON only.` }], opts);
  parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid model output: ${parsed.error.issues[0]?.message}`);
}

export class CrisisError extends Error {}

/** Run a live handler. Without a key (or in mock mode) answer with labeled demo data. With a key, a failure is reported as an
 *  error the user can retry: never someone else's sample decision in place of theirs. */
export async function liveOrDemo<T>(live: () => Promise<T>, demo: () => T) {
  if (!hasKey()) return NextResponse.json({ ...demo(), demo: true, reason: "No MODEL_API_KEY set" });
  try {
    return NextResponse.json({ ...(await live()), demo: false });
  } catch (e) {
    if (e instanceof CrisisError) return NextResponse.json({ handoff: "crisis" });
    console.error("[futurial] live call failed:", e);
    return NextResponse.json({ error: "busy", reason: (e as Error).message.slice(0, 200) }, { status: 503 });
  }
}
