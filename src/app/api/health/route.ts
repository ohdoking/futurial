import { NextResponse } from "next/server";
import { chatJSON, hasKey, listModels, MODELS } from "@/lib/meta";

export async function GET() {
  if (!hasKey()) return NextResponse.json({ ok: false, reason: "MODEL_API_KEY is empty in .env.local" });
  const out: Record<string, unknown> = { configured: MODELS };
  try { out.models = await listModels(); } catch (e) { out.models = `failed: ${(e as Error).message}`; }
  for (const [k, model] of Object.entries({ fast: MODELS.fast, deep: MODELS.deep })) {
    try { out[k] = { model, reply: await chatJSON(model, [{ role: "user", content: 'Reply with {"ok":true} only.' }], { maxTokens: 50 }) }; }
    catch (e) { out[k] = { model, error: (e as Error).message }; }
  }
  return NextResponse.json(out);
}
