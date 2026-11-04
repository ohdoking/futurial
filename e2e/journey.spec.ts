import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Futurial v4 journeys against the live models. Screenshots and screen text of every step go to e2e/screens/.

const shot = async (page: Page, name: string) => {
  mkdirSync("e2e/screens", { recursive: true });
  await page.waitForTimeout(700); // let entrance animations and image fades finish
  await page.screenshot({ path: `e2e/screens/${name}.png`, fullPage: true });
  writeFileSync(`e2e/screens/${name}.txt`, await page.locator(".screen").innerText());
};
const DILEMMA = "I'm a marketing manager thinking about moving into a product manager role at a startup. It pays about 15% less, and my husband's freelance income is unstable. We have two kids, 5 and 8.";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("onboarding → two lives → what you noticed → today's check → reveal → next", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // 1. A little about you (first visit only)
  await expect(page.getByText("A little about you")).toBeVisible();
  await page.getByRole("button", { name: "Seoul" }).click();
  await page.getByRole("button", { name: "30s" }).click();
  await page.getByRole("button", { name: "Partner" }).click();
  await page.getByRole("button", { name: "Kids" }).click();
  await shot(page, "01-profile");
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Dilemma, with the profile remembered
  await expect(page.getByText("What are you deciding?")).toBeVisible();
  await expect(page.getByText(/About you: Seoul · 30s · Partner \+ Kids/)).toBeVisible();
  await page.getByLabel("Your decision").fill(DILEMMA);
  await shot(page, "02-start");
  let taps = 1;
  await page.getByRole("button", { name: "Continue" }).click();

  // 2b. Three words first: the week is built from them
  await expect(page.getByText("what three words come first?")).toBeVisible();
  for (const [i, w] of ["guilt", "growth", "kids"].entries()) await page.getByLabel(`Word ${i + 1}`).fill(w);
  await shot(page, "02b-words");
  taps++;
  await page.getByRole("button", { name: "Show me my futures" }).click();

  // 3. Follow-up questions: "Who are you doing this for?" first, then up to 3 more. Tap answers only.
  await expect(page.getByText("Before I imagine your two weeks")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Demo mode/)).toHaveCount(0);
  const cards = page.locator(".card");
  const n = await cards.count();
  expect(n).toBeLessThanOrEqual(4);
  await expect(cards.first()).toContainText("Who are you doing this for?");
  await cards.first().getByRole("button", { name: "My kids" }).click(); taps++;
  await page.getByLabel("Their names (optional)").fill("Mia, Leo");
  for (let i = 1; i < n; i++) { await cards.nth(i).locator(".chips button").first().click(); taps++; }
  const asked = await page.locator(".screen").innerText();
  expect(asked).not.toMatch(/religion|health|politic/i);
  await shot(page, "03-ask");
  await page.getByRole("button", { name: "Go five years ahead" }).click(); taps++;

  // Five years from now: only 5 years is selectable; savings are computed in code, and a what-if recomputes them.
  await expect(page.getByText("Five years from now", { exact: true })).toBeVisible();
  for (const h of ["1 month", "6 months", "2 years"]) await expect(page.getByRole("button", { name: new RegExp(`^${h}`) })).toBeDisabled();
  await expect(page.getByRole("button", { name: "5 years" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".chart polyline")).toHaveCount(2);
  const before = await page.locator(".card").filter({ hasText: "Savings, month by month" }).innerText();
  await page.getByText("What if… (optional)").click();
  await page.getByRole("button", { name: "Prices rise 6% a year" }).click();
  await expect(page.locator(".card").filter({ hasText: "Savings, month by month" })).not.toHaveText(before);
  await page.getByRole("button", { name: "Prices rise 6% a year" }).click(); // back to the usual numbers
  await shot(page, "03b-five");
  await page.getByRole("button", { name: "Live both weeks" }).click(); taps++;
  expect(taps).toBeLessThanOrEqual(8); // success bar: ≤ 8 taps from dilemma to first scene (7 + the three-words step)

  // 4. Each life plays like a film: title card → 3 scenes → how that life felt
  const times: Record<string, string[]> = {};
  for (const [d, felt] of [[0, ["Calm", "Tired"]], [1, ["Proud", "Worried"]]] as const) {
    await expect(page.locator(".titlecard .life")).toContainText(/Life [AB]/, { timeout: 150_000 });
    const life = ((await page.locator(".titlecard .life").textContent()) ?? "").match(/Life ([AB])/)![1];
    await expect(page.locator(".standing .t")).not.toBeEmpty(); // where this life most likely stands: a guess, labeled
    await expect(page.getByText(/If it goes well:/)).toBeVisible();
    await expect(page.getByText(/If it goes badly:/)).toBeVisible();
    await shot(page, `04-card-${life}`);
    await page.getByRole("button", { name: "Live it" }).click();
    times[life] = [];
    for (let m = 0; m < 3; m++) {
      await expect(page.locator(".film .beat")).toBeVisible();
      const text = await page.locator(".film .subs").innerText();
      expect(text).not.toMatch(/\byou feel\b|\byou smile\b|\byou worry\b/i);
      expect(text).not.toMatch(/\$\d/); // the dilemma has no dollar amounts, so the scenes have none
      times[life].push((await page.locator(".film .when").textContent()) ?? "");
      if (m === 2) await expect(page.locator(".film .frame img")).toBeVisible({ timeout: 90_000 }); // Muse Image: the weekend scene is always drawn
      await shot(page, `04-live-${life}${m + 1}`);
      if (await page.locator(".film .choices").count()) {
        await page.locator(".film .btn.choice").first().click();
        await expect(page.locator(".film .outcome")).toBeVisible();
      }
      await page.getByRole("button", { name: "Continue" }).click();
    }
    await expect(page.getByText("How did that life feel?")).toBeVisible();
    for (const f of felt) await page.locator(".feel button", { hasText: f }).click();
    await page.getByRole("button", { name: d === 0 ? "Now live the other life" : "Put them side by side" }).click();
  }
  expect(Object.keys(times).sort()).toEqual(["A", "B"]);
  expect(times.A).toEqual(times.B); // the same days in both lives
  expect(new Set(times.A).size).toBe(3); // three different days

  // 5. Side by side, plainly → which hard part could you live with → what that says + today's check
  await expect(page.getByText("The two lives, plainly")).toBeVisible();
  await expect(page.locator(".ledger .wchip")).toHaveCount(6); // the three words, counted in each life
  await expect(page.locator(".ledger thead .felt")).toHaveCount(2);
  await shot(page, "05-ledger");
  await page.locator(".hard button").nth(1).click();
  await expect(page.locator(".clear p")).toContainText("as long as", { timeout: 90_000 });
  const said = await page.locator(".clear").innerText();
  expect(said).not.toMatch(/\d+\s?%/);
  expect(said).not.toMatch(/\byou should\b/i);
  await shot(page, "05-clear");
  await page.getByRole("button", { name: "Show me how" }).click();

  // 6. Today: who, where, a message to copy, one guess
  await expect(page.getByText("Who to ask")).toBeVisible();
  await expect(page.getByText("Where to find them")).toBeVisible();
  await expect(page.locator(".msg")).not.toBeEmpty();
  await expect(page.getByText(/low risk/i).first()).toBeVisible();
  const minutes = Number((await page.locator(".k").first().innerText()).match(/about (\d+) min/i)?.[1] ?? 99);
  expect(minutes).toBeLessThanOrEqual(30);
  await page.getByRole("button", { name: /Copy message|Copied/ }).click();
  const sent = page.getByRole("button", { name: "Save my guess" });
  await expect(sent).toBeDisabled();
  const picker = page.locator(".picker").first();
  const size = (await picker.locator("button").count()) - 1;
  const guess = Math.max(1, Math.round(size / 2));
  await picker.locator("button").nth(guess).click();
  await expect(page.getByText(/or fewer would make you rethink/)).toBeVisible(); // line set for you, changeable
  await expect(page.locator(".receipt")).toContainText(`I expect ${guess} of ${size}`);
  await shot(page, "06-today");
  await sent.click();

  // 7. Home + persistence
  await expect(page.getByRole("button", { name: "Add what happened" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Add what happened" })).toBeVisible();
  await shot(page, "07-home");

  // 8. Log → confirm → reveal
  await page.getByRole("button", { name: "Add what happened" }).click();
  await page.getByLabel("What happened").fill(`I asked ${size} people. Only one person said yes. Most of them said it depends on the team.`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Just to check|Ready to develop/).first()).toBeVisible({ timeout: 90_000 });
  if (await page.getByText(/Just to check/).count()) {
    const picked = page.locator('.picker button[aria-pressed="true"]');
    if (await picked.count()) await expect(picked).toHaveText("1");
    else await page.locator(".picker button").nth(1).click();
    await page.getByRole("button", { name: "That's right" }).click();
  }
  await page.getByRole("button", { name: "Reveal what happened" }).click();
  await expect(page.locator(".vs .real")).toContainText("1 of");
  await expect(page.locator(".stamp")).toBeVisible();
  await expect(page.locator(".see p")).not.toHaveText("…", { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await shot(page, "08-reveal");

  // 9. Still true? → next moves
  await page.getByRole("button", { name: "Update my note" }).click();
  const move = page.getByRole("button", { name: /^Move to/ });
  if (await move.count()) await move.click();
  else await page.locator(".five").getByRole("radio").nth(1).click();
  await expect(page.getByText(/Updated to|Kept/)).toBeVisible();
  await page.getByRole("button", { name: "See what you could do next" }).click();
  await expect(page.getByText("What could you do next?")).toBeVisible();
  await expect(page.getByText("Futurial won't tell you which path to take.")).toBeVisible();
  await shot(page, "09-next");

  expect(errors.filter((e) => !/favicon|Download the React DevTools/.test(e))).toEqual([]);
});

test("demo profile loads prefilled and never touches saved data", async ({ page }) => {
  await page.evaluate(() => localStorage.clear()); // the regular page opened in beforeEach saves its own state
  await page.goto("/?demo=sarah");
  await expect(page.getByText("Demo profile: Sarah (fictional)")).toBeVisible();
  await expect(page.getByLabel("Your decision")).toHaveValue(/product manager role at a startup/);
  await expect(page.getByText(/About you: Austin, Texas · 30s · Partner \+ Kids/)).toBeVisible();
  expect(page.url()).not.toContain("demo=");
  expect(await page.evaluate(() => [localStorage.getItem("futurial:v2"), localStorage.getItem("futurial:profile")])).toEqual([null, null]);
  await shot(page, "demo-sarah");
});

test("crisis message is handed off, not analysed", async ({ page }) => {
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByLabel("Your decision").fill("I lost my job and I don't see any reason to keep living anymore.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("It sounds like you're going through something serious.")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/988/)).toBeVisible();
});
