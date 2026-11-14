// Regression probe: every log toolbar control must be hit-testable (not covered
// by the search box, not pushed out of the viewport) on narrow and wide windows.
//
// Usage: open a cluster, open any Pod Logs dock tab, then run
//   node open-lens/integration/logs-toolbar-hit-e2e.mjs [cdpPort=9223]
// Exits 1 when a control is blocked or a toolbar child overflows its box.
import { chromium } from "playwright";

const port = process.argv[2] ?? "9223";
const widths = [[960, 1050], [1440, 900]];
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("devtools"));
const frame = page.frames().find((f) => /^https:\/\/[0-9a-f]{32}\.lens\.app/.test(f.url()));

if (!frame) {
  console.error("No cluster frame: open a cluster first.");
  process.exit(2);
}

const original = await page.evaluate(() => [outerWidth, outerHeight]);
let failed = false;

for (const [w, h] of widths) {
  await page.evaluate(([ww, hh]) => window.resizeTo(ww, hh), [w, h]);
  await page.waitForTimeout(1200);

  const result = await frame.evaluate(() => {
    const toolbar = document.querySelector("[data-testid=log-toolbar]");

    if (!toolbar) return { error: "log toolbar not found: open a Pod Logs tab" };

    const blocked = [...toolbar.querySelectorAll("[title]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);

        return !hit || !el.contains(hit);
      })
      .map((el) => el.title);
    const overflowing = [...toolbar.children]
      .filter((c) => c.scrollWidth > Math.ceil(c.getBoundingClientRect().width) + 1)
      .map((c) => String(c.className).split(" ")[0]);

    return { blocked, overflowing };
  });

  const ok = !result.error && result.blocked.length === 0 && result.overflowing.length === 0;

  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"} ${w}x${h}`, JSON.stringify(result));
}

await page.evaluate(([ww, hh]) => window.resizeTo(ww, hh), original);
await browser.close().catch(() => {});
process.exit(failed ? 1 : 0);
