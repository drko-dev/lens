/**
 * Lens 2026.10 visual parity smoke check for an isolated NovaKube Electron
 * development session. No production clusters, API keys or network clients.
 *
 * Run from the repository root with Electron CDP at 127.0.0.1:9223:
 *   node docs/evidence/novakube-lens-2026-visual-parity/audit.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const cdp = process.env.NOVAKUBE_CDP_URL || "http://127.0.0.1:9223";
const outDir = process.env.NOVAKUBE_AUDIT_OUTPUT || path.join(os.homedir(), "Documents/lens/qa-profiles/lens-2026-live-preview/evidence");
const sizes = [[1440, 900], [900, 700], [700, 700], [700, 500]];
const checks = [];
const assert = (name, condition, observed) => {
  checks.push({ name, result: condition ? "PASS" : "FAIL", observed });

  if (!condition) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};
const contextFor = page => page.frames().find(frame => frame.url().includes("openlens-demo-cluster-local.lens.app:"));

await fs.mkdir(outDir, { recursive: true });
const browser = await chromium.connectOverCDP(cdp);
try {
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith("https://lens.app:"));

  if (!page) throw new Error("Isolated NovaKube CDP window not found");

  const originalSize = await page.evaluate(() => [innerWidth, innerHeight]);

  try {
    const tab = page.getByTestId("workspace-tab-openlens-demo-cluster-local");

    if (await tab.count() && (await page.url()).includes("/catalog")) {
      await tab.click();
    }

    let cluster = contextFor(page);

    if (!cluster) throw new Error("OpenLens demo frame missing; launch local demo cluster from Welcome");

    if (!cluster.url().includes("/pods")) {
      await cluster.getByTestId("sidebar-item-link-for-pods").click();
      cluster = contextFor(page);
    }

    await cluster.locator(".Pods .TableRow").first().waitFor({ timeout: 10000 });

    // Return pointer to toolbar so row samples measure idle colors.
    await page.mouse.move(12, 22);

    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(130);
      cluster = contextFor(page);
      const root = await page.evaluate(() => {
        const b = getComputedStyle(document.body);
        const header = document.querySelector('[class*="top-bar-module__topBar"]');

        return {
          viewport: [innerWidth, innerHeight],
          documentWidth: document.documentElement.scrollWidth,
          theme: document.body.className,
          header: header?.getBoundingClientRect().height,
          font: b.fontFamily,
          main: b.getPropertyValue("--mainBackground").trim(),
          primary: b.getPropertyValue("--primary").trim(),
          track: b.getPropertyValue("--scrollbar-width").trim(),
        };
      });
      const nested = await cluster.evaluate(() => {
        const select = document.querySelector('[data-testid="namespace-select-filter"]');
        const header = document.querySelector(".Pods .TableHead");
        const rows = document.querySelectorAll(".Pods .TableRow");
        const first = rows.item(0);
        const dock = document.querySelector(".Dock .TerminalTab.active");

        return {
          viewport: [innerWidth, innerHeight],
          documentWidth: document.documentElement.scrollWidth,
          theme: document.body.className,
          pods: rows.length,
          headHeight: header?.getBoundingClientRect().height,
          namespaceWidth: select?.getBoundingClientRect().width,
          namespaceControlHeight: select?.querySelector(".Select__control")?.getBoundingClientRect().height,
          selectedNavBg: getComputedStyle(document.querySelector('[data-testid="sidebar-item-pods"]')).backgroundColor,
          idleRowBg: first ? getComputedStyle(first).backgroundColor : undefined,
          idleCellBg: first ? getComputedStyle(first.querySelector(".TableCell")).backgroundColor : undefined,
          dockTabHeight: dock?.getBoundingClientRect().height,
          dockIcon: dock?.querySelector(".Icon") ? getComputedStyle(dock.querySelector(".Icon")).color : undefined,
          hasError: document.body.innerText.includes("Error 1 of"),
        };
      });

      assert(`no horizontal overflow ${width}x${height}`,
        root.documentWidth <= width && nested.documentWidth <= nested.viewport[0],
        { root: root.documentWidth, frame: nested.documentWidth, frameWidth: nested.viewport[0] });
      assert(`theme / chrome ${width}x${height}`,
        root.theme === "theme-novakube" && nested.theme === "theme-novakube" && root.header === 40,
        { root: root.theme, frame: nested.theme, header: root.header });
      assert(`Lens primary / font ${width}x${height}`,
        root.main === "#181A1C" && root.primary === "#3D90CE" && root.font.includes("Open Sans") && root.track === "16px", root);
      assert(`Pod data / geometry ${width}x${height}`,
        nested.pods >= 2 && nested.headHeight === 34 && nested.namespaceWidth === 220 &&
        Math.round(nested.namespaceControlHeight) === 26 && nested.dockTabHeight === 36 && !nested.hasError, nested);
      assert(`Pod idle and Navigator palette ${width}x${height}`,
        nested.selectedNavBg === "rgb(38, 43, 46)" &&
        nested.idleRowBg === "rgb(31, 33, 35)" &&
        nested.idleCellBg === "rgb(31, 33, 35)", nested);

      if (width === 1440) {
        await page.screenshot({ path: path.join(outDir, "novakube-1440x900.png"), animations: "disabled" });
        await cluster.locator(".Table.Pods").screenshot({ path: path.join(outDir, "pods-demo-1440.png"), animations: "disabled" });
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    cluster = contextFor(page);
    await cluster.locator(".Pods .TableRow").first().hover();
    await cluster.waitForTimeout(180);
    const hover = await cluster.evaluate(() => {
      const row = document.querySelector(".Pods .TableRow");
      return { hover: row.matches(":hover"), row: getComputedStyle(row).backgroundColor, cell: getComputedStyle(row.querySelector(".TableCell")).backgroundColor };
    });
    assert("Lens Pod hover uses selected background on row and cells",
      hover.hover && hover.row === "rgb(55, 56, 62)" && hover.cell === "rgb(55, 56, 62)", hover);

    const result = {
      suite: "novakube-lens-2026.10-visual-parity",
      source: "isolated Electron dev session and local read-only demo cluster",
      checked: { reference: "installed Lens Dark 2026.10.261408", viewportSizes: sizes },
      checks,
      summary: { passed: checks.filter(check => check.result === "PASS").length, failed: checks.filter(check => check.result === "FAIL").length },
      limitations: ["Data and navigation differ from official Lens; pixel equality is not asserted", "Core-wide TypeScript errors outside scoped changed files remain"],
    };

    await fs.writeFile(path.join(outDir, "evidence.json"), JSON.stringify(result, null, 2) + "\n");
    process.stdout.write(JSON.stringify(result.summary) + "\n");
  } finally {
    await page.setViewportSize({ width: originalSize[0], height: originalSize[1] });
    await page.mouse.move(12, 22);
    await page.bringToFront();
  }
} finally {
  await browser.close();
}
