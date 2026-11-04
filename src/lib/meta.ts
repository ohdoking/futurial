// Server-only client for the Meta Model API (OpenAI-compatible).
// Docs: https://docs.litellm.ai/docs/providers/meta · image: meta-model-cookbook/05_muse_image
import "server-only";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = process.env.META_API_BASE || "https://api.meta.ai/v1";
const KEY = process.env.MODEL_API_KEY || process.env.META_API_KEY || "";

export const MODELS = {
  fast: process.env.META_FAST_MODEL || "muse-spark-1.3",   // understand, evidence, captions
  deep: process.env.META_DEEP_MODEL || "muse-wonder-1.0",      // practice-plan design, future day
  image: process.env.META_IMAGE_MODEL || "muse-image-1.0",
};

// FUTURIAL_MOCK=1 forces demo data, for testing layout and flow without spending credits.
export const hasKey = () => KEY.length > 0 && process.env.FUTURIAL_MOCK !== "1";

export class MetaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// ---------- credit savers (development and tests only) ----------
// FUTURIAL_CACHE: identical requests are answered from .cache/meta instead of the API. On by default outside production.
// Every real call is appended to .cache/usage.jsonl so `npm run usage` can show where credits go.
const CACHE_ON = (process.env.FUTURIAL_CACHE ?? (process.env.NODE_ENV === "production" ? "0" : "1")) === "1";
const CACHE_DIR = join(process.cwd(), ".cache", "meta");

async function post(path: string, body: unknown, timeoutMs: number) {
  const key = createHash("sha256").update(path + JSON.stringify(body)).digest("hex").slice(0, 32);
  const file = join(CACHE_DIR, `${key}.json`);
  if (CACHE_ON) {
    try { return JSON.parse(await readFile(file, "utf8")); } catch { /* not cached yet */ }
  }
  const t = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new MetaError(res.status, `${path} ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  if (CACHE_ON) {
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
    await writeFile(file, JSON.stringify(data)).catch(() => {});
  }
  const u = data?.usage ?? {};
  const model = (body as { model?: string })?.model;
  await appendFile(join(process.cwd(), ".cache", "usage.jsonl"), JSON.stringify({
    t: new Date().toISOString(), path, model, ms: Date.now() - t,
    in: u.prompt_tokens ?? u.input_tokens ?? 0, out: u.completion_tokens ?? u.output_tokens ?? 0,
    reasoning: u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? 0,
    image: path === "/responses" ? 1 : 0,
  }) + "\n").catch(() => {});
  return data;
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export type Effort = "minimal" | "low" | "medium" | "high";

/**
 * Chat completion that returns parsed JSON. Muse models are reasoning models: reasoning tokens count against
 * max_completion_tokens, so a cut-off answer ("length") is retried once with double the budget.
 */
export async function chatJSON(model: string, messages: Msg[], opts: { maxTokens?: number; temperature?: number; effort?: Effort } = {}): Promise<unknown> {
  let budget = opts.maxTokens ?? 6000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = { model, messages, max_completion_tokens: budget, temperature: opts.temperature ?? 0.6, reasoning_effort: opts.effort ?? "low" };
    let data;
    try {
      data = await post("/chat/completions", { ...base, response_format: { type: "json_object" } }, 90000);
    } catch (e) {
      if (!(e instanceof MetaError) || e.status !== 400) throw e;
      data = await post("/chat/completions", base, 90000);
    }
    const choice = data?.choices?.[0];
    const text: string = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length" && !text.trim().endsWith("}")) { budget *= 2; continue; }
    return parseJSON(text);
  }
  throw new Error("Model ran out of tokens before answering");
}

export function parseJSON(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const start = trimmed.indexOf("{"), end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Model did not return JSON");
}

/** Muse Image through the Responses API. Returns a data URL. */
export async function generateImage(prompt: string): Promise<string> {
  const data = await post("/responses", { model: MODELS.image, input: prompt }, 90000);
  const item = (data?.output ?? []).find((o: { type: string }) => o.type === "image_generation_call");
  if (!item?.result) throw new Error("No image in response");
  const mime = item.output_format ? `image/${item.output_format}` : "image/webp";
  return `data:${mime};base64,${item.result}`;
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new MetaError(res.status, `/models ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data?.data ?? []).map((m: { id: string }) => m.id);
}
