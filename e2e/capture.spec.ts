import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Persona test captures (not part of the regular e2e run). Live models, real taps, every screen saved.
// CAPTURE=sarah,james E2E_BASE_URL=http://localhost:3101 npx playwright test e2e/capture.spec.ts

type Run = {
  demo?: string; place?: string; age?: string; household?: string[]; dilemma?: string;
  forWhom: string; names?: string; words?: string[]; hardPick?: number; guess: [string, string]; felt: [string[], string[]]; log?: string;
  pick?: [RegExp | null, RegExp | null]; // which choice to tap in each life (default: the first)
};
const RUNS: Record<string, Run> = {
  sarah: { demo: "sarah", forWhom: "My kids", words: ["guilt", "growth", "kids"], guess: ["Calm", "Excited"], felt: [["Calm", "Tired", "Calm"], ["Excited", "Worried", "Sad"]], pick: [null, /^stay/i] },
  james: {
    place: "United States", age: "30s", household: ["Partner", "Kids"], forWhom: "My kids",
    dilemma: "I've been offered a regional manager job. It pays 20% more but I'd travel two or three days a week. I do school drop-off every morning and my wife works full-time. Should I take it?",
    guess: ["Calm", "Excited"], felt: [["Calm", "Tired", "Proud"], ["Excited", "Worried", "Lonely"]],
    log: "I asked four regional managers with young kids. One said travel is usually just one night a week. Three said it's two or three nights most weeks.",
  },
  tasha: {
    place: "United States", age: "30s", household: ["Kids"], forWhom: "My kids",
    dilemma: "Should I do a 9-month nursing assistant program? I'd have to cut my hours and money is already tight. I'm raising my daughter alone.",
    guess: ["Worried", "Worried"], felt: [["Tired", "Worried", "Calm"], ["Worried", "Tired", "Proud"]],
    log: "I texted three women who did the program. Two said they kept working weekends during it. One said she had to stop.",
  },
  priya: {
    place: "Somewhere else", age: "40s", household: ["Partner", "Kids", "Parents"], forWhom: "My parents",
    dilemma: "My father needs more care every year. Should I go part-time at work so I can look after him? It would mean about 40% less income.",
    guess: ["Worried", "Calm"], felt: [["Tired", "Worried", "Sad"], ["Calm", "Worried", "Proud"]],
    log: "I asked five friends who went part-time to care for a parent. Three said they don't regret it. One said maybe. One said money got too hard.",
  },
};

const picked = (process.env.CAPTURE ?? "").split(",").filter((x) => RUNS[x]);
test.skip(picked.length === 0, "set CAPTURE=sarah,james,…");

for (const name of picked) {
  test(`capture ${name}`, async ({ page }) => {
    const r = RUNS[name];
    const dir = `e2e/captures/${name}`;
    mkdirSync(dir, { recursive: true });
    let n = 0;
    const shot = async (label: string) => {
      await page.waitForTimeout(700);
      const f = `${String(++n).padStart(2, "0")}-${label}`;
      await page.screenshot({ path: `${dir}/${f}.png`, fullPage: true });
      writeFileSync(`${dir}/${f}.txt`, await page.locator(".screen").innerText());
    };

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    // RECORD=1 replays the way a screen recording runs (?record: prefilled words and answers, demo pace).
    if (r.demo) await page.goto(`/?demo=${r.demo}${process.env.RECORD ? "&record" : ""}`);
    else {
      await page.reload();
      await expect(page.getByText("A little about you")).toBeVisible();
      for (const c of [r.place, r.age, ...(r.household ?? [])]) if (c) await page.getByRole("button", { name: c, exact: true }).click();
      await shot("profile");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByLabel("Your decision").fill(r.dilemma!);
    }
    await shot("start");
    await page.getByRole("button", { name: "Continue" }).click();
    for (const [i, w] of (r.words ?? []).entries()) await page.getByLabel(`Word ${i + 1}`).fill(w);
    await shot("words");
    await page.getByRole("button", { name: r.words?.length ? "Show me my futures" : "Skip" }).click();

    await expect(page.getByText("Before I imagine your two weeks")).toBeVisible({ timeout: 90_000 });
    const cards = page.locator(".card");
    const tap = async (b: ReturnType<typeof page.locator>) => { if ((await b.getAttribute("aria-pressed")) !== "true") await b.click(); };
    await tap(cards.first().getByRole("button", { name: r.forWhom }));
    if (r.names) await page.getByLabel("Their names (optional)").fill(r.names);
    for (let i = 1; i < await cards.count(); i++) await tap(cards.nth(i).locator(".chips button").first());
    await shot("ask");
    await page.getByRole("button", { name: "Go five years ahead" }).click();
    await shot("five");
    await page.getByRole("button", { name: "Live both weeks" }).click();

    for (const d of [0, 1]) {
      await expect(page.locator(".titlecard .life")).toContainText(/Life [AB]/, { timeout: 150_000 });
      const life = ((await page.locator(".titlecard .life").textContent()) ?? "").match(/Life ([AB])/)![1];
      await shot(`card-${life}`);
      await page.getByRole("button", { name: "Live it" }).click();
      for (let m = 0; m < 3; m++) {
        if (!(await page.locator(".film").count())) break; // a recording shows only the first life's fear scene
        if (m === 2) await expect(page.locator(".film .frame img")).toBeVisible({ timeout: 90_000 }).catch(() => {});
        else await page.locator(".film .frame img, .film .filmdev:not(.on)").first().waitFor({ timeout: 90_000 }).catch(() => {});
        await page.waitForTimeout(6000); // let the subtitles finish
        await shot(`live-${life}${m + 1}`);
        if (await page.locator(".film .choices").count()) {
          const want = r.pick?.[d] ? page.locator(".film .btn.choice", { hasText: r.pick[d]! }) : null;
          await (want && await want.count() ? want.first() : page.locator(".film .btn.choice").first()).click();
          await shot(`live-${life}${m + 1}-outcome`);
        }
        await page.getByRole("button", { name: "Continue" }).click();
        await page.waitForTimeout(500);
      }
      for (const f of r.felt[d].slice(0, 2)) await page.locator(".feel button", { hasText: f }).first().click();
      await page.locator(".titlecard .cta").click();
    }

    await expect(page.getByText("The two lives, plainly")).toBeVisible();
    await shot("ledger");
    await page.locator(".hard button").nth(r.hardPick ?? 1).click();
    await expect(page.locator(".clear p")).toContainText("as long as", { timeout: 90_000 });
    await shot("clear");
    await page.getByRole("button", { name: "Show me how" }).click();

    await expect(page.getByText("Who to ask")).toBeVisible();
    const picker = page.locator(".picker").first();
    const size = (await picker.locator("button").count()) - 1;
    await picker.locator("button").nth(Math.max(1, Math.round(size / 2))).click();
    await shot("today");
    if (r.demo) await page.getByRole("button", { name: "Demo: skip ahead with sample replies" }).click();
    if (r.demo && process.env.RECORD) { /* a recording goes straight to the reveal */ }
    else if (r.demo) {
      await shot("log");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(/Just to check|Ready to develop/).first()).toBeVisible({ timeout: 90_000 });
      await shot("confirm");
      if (await page.getByText(/Just to check/).count()) {
        if (!(await page.locator('.picker button[aria-pressed="true"]').count())) await page.locator(".picker button").nth(1).click();
        await page.getByRole("button", { name: "That's right" }).click();
      }
    } else {
      await page.getByRole("button", { name: "Save my guess" }).click();
      await expect(page.getByRole("button", { name: "Add what happened" })).toBeVisible();
      await shot("home");
      await page.getByRole("button", { name: "Add what happened" }).click();
      await page.getByLabel("What happened").fill(r.log!);
      await shot("log");
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(/Just to check|Ready to develop/).first()).toBeVisible({ timeout: 90_000 });
      await shot("confirm");
      if (await page.getByText(/Just to check/).count()) {
        if (!(await page.locator('.picker button[aria-pressed="true"]').count())) await page.locator(".picker button").nth(1).click();
        await page.getByRole("button", { name: "That's right" }).click();
      }
    }
    await page.getByRole("button", { name: "Reveal what happened" }).click();
    await expect(page.locator(".stamp")).toBeVisible();
    await expect(page.locator(".see p")).not.toHaveText("…", { timeout: 60_000 });
    await page.waitForTimeout(2500);
    await shot("reveal");
    await page.getByRole("button", { name: "Update my note" }).click();
    await shot("still");
    const move = page.getByRole("button", { name: /^Move to|^Keep/ }).first();
    await move.click();
    await page.getByRole("button", { name: "See what you could do next" }).click();
    await expect(page.getByText("What could you do next?")).toBeVisible();
    await shot("next");
  });
}
