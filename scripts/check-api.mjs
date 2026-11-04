// Checks your Meta Model API key and model IDs. Run: npm run check:api
const BASE = process.env.META_API_BASE || "https://api.meta.ai/v1";
const KEY = process.env.MODEL_API_KEY || process.env.META_API_KEY;
const models = { fast: process.env.META_FAST_MODEL || "muse-spark-1.3", deep: process.env.META_DEEP_MODEL || "muse-wonder-1.0", image: process.env.META_IMAGE_MODEL || "muse-image-1.0" };
if (!KEY) { console.error("✗ MODEL_API_KEY is empty. Put your key in .env.local."); process.exit(1); }
const h = { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` };

const list = await fetch(`${BASE}/models`, { headers: h });
if (list.ok) {
  const ids = (await list.json()).data?.map((m) => m.id) ?? [];
  console.log(`✓ Key works. ${ids.length} models available:\n  ${ids.join("\n  ")}`);
  for (const [k, id] of Object.entries(models)) console.log(`${ids.includes(id) ? "✓" : "?"} ${k}: ${id}${ids.includes(id) ? "" : "  ← not in the list above; set META_" + k.toUpperCase() + "_MODEL in .env.local"}`);
} else console.log(`? /models returned ${list.status}: ${(await list.text()).slice(0, 200)}`);

for (const k of ["fast", "deep"]) {
  const t = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, { method: "POST", headers: h, body: JSON.stringify({ model: models[k], messages: [{ role: "user", content: 'Reply with {"ok":true} only.' }], max_completion_tokens: 50, response_format: { type: "json_object" } }) });
  const body = await r.text();
  console.log(`${r.ok ? "✓" : "✗"} chat ${k} (${models[k]}) ${r.status} in ${Date.now() - t}ms: ${body.slice(0, 160).replace(/\s+/g, " ")}`);
}

if (process.argv.includes("--image")) {
  const t = Date.now();
  const r = await fetch(`${BASE}/responses`, { method: "POST", headers: h, body: JSON.stringify({ model: models.image, input: "Instant film photograph of a kitchen table at night with an open laptop." }) });
  const j = r.ok ? await r.json() : null;
  const item = j?.output?.find((o) => o.type === "image_generation_call");
  console.log(`${item?.result ? "✓" : "✗"} image (${models.image}) ${r.status} in ${Date.now() - t}ms${item?.result ? `, ${Math.round(item.result.length / 1024)} KB` : `: ${(j ? JSON.stringify(j) : await r.text()).slice(0, 200)}`}`);
} else console.log("· image check skipped (run with -- --image to try one image)");
