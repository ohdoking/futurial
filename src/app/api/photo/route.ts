import { NextResponse } from "next/server";
import { generateImage, hasKey } from "@/lib/meta";
import { photoPrompt } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { scene, key } = (await req.json()) as { scene: string; key?: boolean };
  if (!hasKey()) return NextResponse.json({ image: null, demo: true });
  // Test runs only (FUTURIAL_SCENES=key, never in production): draw just the future photos and the evening moments.
  if (process.env.FUTURIAL_SCENES === "key" && process.env.NODE_ENV !== "production" && key === false) return NextResponse.json({ image: null, skipped: true });
  try {
    return NextResponse.json({ image: await generateImage(photoPrompt(String(scene).slice(0, 600))), demo: false });
  } catch (e) {
    console.error("[futurial] photo failed:", e);
    return NextResponse.json({ image: null, demo: true, reason: (e as Error).message.slice(0, 200) });
  }
}
