// Regression probe: the fixed Root Navigator panel must follow the favorites rail
// when it collapses, instead of covering the start of the page content.
//
// Usage: open the Welcome page (Home), then run
//   node open-lens/integration/navigator-hotbar-collapse-e2e.mjs [cdpPort=9223]
// The probe restores the rail to the state it found. Exits 1 on failure.
import { chromium } from "playwright";

const port = process.argv[2] ?? "9223";
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("devtools"));

const measure = () => page.evaluate(() => {
  const panel = document.querySelector("[data-testid=root-navigator-panel]");
  const title = document.querySelector("[data-testid=welcome-text-container] h2");

  if (!panel || !title) return { error: "open the Welcome page first" };

  const t = title.getBoundingClientRect();
  const hit = document.elementFromPoint(t.left + 2, t.top + t.height / 2);
  const rail = document.querySelector(".HotbarMenu");

  return {
    panelLeft: Math.round(panel.getBoundingClientRect().left),
    railRight: rail ? Math.round(rail.getBoundingClientRect().right) : null,
    titleCovered: !hit || !(title.contains(hit) || hit.contains(title)),
  };
});

const startedCollapsed = (await page.locator("[data-testid=hotbar-expand]").count()) > 0;

if (startedCollapsed) {
  await page.locator("[data-testid=hotbar-expand]").click();
  await page.waitForTimeout(800);
}

const expanded = await measure();

await page.locator("[data-testid=hotbar-collapse]").click();
await page.waitForTimeout(800);
const collapsed = await measure();

if (!startedCollapsed) {
  await page.locator("[data-testid=hotbar-expand]").click();
  await page.waitForTimeout(500);
}

const checks = {
  expandedAligned: !expanded.error && expanded.panelLeft === expanded.railRight && !expanded.titleCovered,
  collapsedAligned: !collapsed.error && collapsed.panelLeft === collapsed.railRight && !collapsed.titleCovered,
};
const ok = Object.values(checks).every(Boolean);

console.log(ok ? "PASS" : "FAIL", JSON.stringify({ expanded, collapsed, checks }));
await browser.close().catch(() => {});
process.exit(ok ? 0 : 1);
