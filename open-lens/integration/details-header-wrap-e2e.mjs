// Regression probe: resource titles in docked/split Details panels must not
// collapse to one character per line when the action toolbar does not fit.
//
// Usage: open a cluster, then "View in Kubetail" on any Deployment (the default
// workspace shows Kubetail + Details side by side), then run
//   node open-lens/integration/details-header-wrap-e2e.mjs [cdpPort=9223]
// Exits 1 when any Details title wraps onto more than one line.
import { chromium } from "playwright";

const port = process.argv[2] ?? "9223";
const browser = await chromium.connectOverCDP(`http://localhost:${port}`);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("devtools"));
const frame = page.frames().find((f) => /^https:\/\/[0-9a-f]{32}\.lens\.app/.test(f.url()));

if (!frame) {
  console.error("No cluster frame: open a cluster first.");
  process.exit(2);
}

const titles = await frame.evaluate(() => [...document.querySelectorAll("[data-testid=resource-details-content] [class*=details-header-module__name]")]
  .map((n) => {
    const lineHeight = parseFloat(getComputedStyle(n).lineHeight) || 20;

    return { text: n.textContent.trim(), width: Math.round(n.getBoundingClientRect().width), lines: Math.round(n.getBoundingClientRect().height / lineHeight) };
  }));

const ok = titles.length > 0 && titles.every((t) => t.lines === 1);

console.log(ok ? "PASS" : "FAIL", JSON.stringify(titles.length ? titles : "no split Details panel open"));
await browser.close().catch(() => {});
process.exit(ok ? 0 : 1);
