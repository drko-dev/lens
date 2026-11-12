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
      const workloads = cluster.getByTestId("sidebar-item-link-for-workloads");
      const pods = cluster.getByTestId("sidebar-item-link-for-pods");
      if (!(await pods.isVisible()) && (await workloads.count())) {
        await workloads.click();
      }
      await pods.click();
      cluster = contextFor(page);
    }

    await cluster.locator(".Pods .TableRow").first().waitFor({ timeout: 10000 });

    const alreadySearching = await cluster.getByTestId("terminal-search-bar").count() > 0;

    if (!alreadySearching) {
      await cluster.locator(".TerminalWindow .xterm").click({ position: { x: 85, y: 35 } });
      await page.keyboard.press("Meta+f");
      await cluster.getByTestId("terminal-search-bar").waitFor({ timeout: 3000 });
    }

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
        const guide = document.querySelector('[data-testid="navigator-resource-tree"]');
        const clusterPin = document.querySelector('[data-testid="sidebar-cluster-dropdown"] [style*="background"]');
        const clusterRoot = document.querySelector('[data-testid="navigator-cluster-root-toggle"]');
        const rootPin = clusterRoot?.querySelector(".navigator-cluster-pin");
        const rootStatus = clusterRoot?.querySelector(".navigator-cluster-status");
        const search = document.querySelector('[data-testid="terminal-search-bar"]');
        const terminal = document.querySelector(".TerminalWindow");
        const context = document.querySelector('[data-testid^="terminal-context-header"]');

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
          guideColor: guide ? getComputedStyle(guide, "::before").backgroundColor : undefined,
          pinColor: clusterPin ? getComputedStyle(clusterPin).backgroundColor : undefined,
          rootExpanded: clusterRoot?.getAttribute("aria-expanded"),
          rootHeight: clusterRoot?.getBoundingClientRect().height,
          rootPinColor: rootPin ? getComputedStyle(rootPin).backgroundColor : undefined,
          rootStatusConnected: rootStatus?.dataset.connected,
          rootStatusColor: rootStatus ? getComputedStyle(rootStatus).backgroundColor : undefined,
          searchInline: search?.parentElement === terminal,
          searchHeight: search?.getBoundingClientRect().height,
          searchBottom: search?.getBoundingClientRect().bottom,
          contextTop: context?.getBoundingClientRect().top,
          searchClientWidth: search?.clientWidth,
          searchScrollWidth: search?.scrollWidth,
          searchPlaceholder: search?.querySelector("input.search-input")?.getAttribute("placeholder"),
          findOptionOrder: search?.querySelector(".search-toggle-btn") ? getComputedStyle(search.querySelector(".search-toggle-btn")).order : undefined,
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

      assert(`Navigator guide matches active cluster pin ${width}x${height}`,
        nested.guideColor === nested.pinColor && Boolean(nested.guideColor), nested);
      assert(`Lens cluster root geometry ${width}x${height}`,
        nested.rootExpanded === "true" && nested.rootHeight === 26 && nested.rootPinColor === nested.pinColor,
        { expanded: nested.rootExpanded, height: nested.rootHeight, pin: nested.rootPinColor });
      assert(`Navigator connection dot reflects known status ${width}x${height}`,
        (nested.rootStatusConnected === "true" && nested.rootStatusColor === "rgb(67, 160, 71)") ||
        (nested.rootStatusConnected === "false" && nested.rootStatusColor !== "rgb(67, 160, 71)"),
        { connected: nested.rootStatusConnected, color: nested.rootStatusColor });
      assert(`Lens terminal search toolbar ${width}x${height}`,
        nested.searchInline && nested.searchHeight === 36 &&
        nested.searchBottom <= nested.contextTop + 1 &&
        nested.searchScrollWidth <= nested.searchClientWidth + 1, nested);

      assert(`Lens terminal search wording and control order ${width}x${height}`,
        nested.searchPlaceholder === "Search in Terminal..." && nested.findOptionOrder === "-1",
        { placeholder: nested.searchPlaceholder, optionOrder: nested.findOptionOrder });

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

    // The Lens-style tree root must really collapse and expand. Use both
    // pointer and keyboard paths; do not merely assert its appearance.
    const rootToggle = cluster.getByTestId("navigator-cluster-root-toggle");

    await rootToggle.click();
    assert("Navigator cluster root collapses resource tree",
      await rootToggle.getAttribute("aria-expanded") === "false" &&
      await cluster.getByTestId("sidebar-item-workloads").count() === 0, true);

    await rootToggle.press("Enter");
    assert("Navigator cluster root restores resources with keyboard",
      await rootToggle.getAttribute("aria-expanded") === "true" &&
      await cluster.getByTestId("sidebar-item-workloads").count() > 0, true);
    await page.mouse.move(12, 22);

    // Lens names the cluster's root destination Overview, not Cluster.
    // Verify the icon, indentation, real route and Navigator search semantics.
    const overview = cluster.getByTestId("sidebar-item-link-for-cluster-overview");
    const overviewAppearance = await cluster.evaluate(() => {
      const link = document.querySelector('[data-testid="sidebar-item-link-for-cluster-overview"]');
      const nodes = document.querySelector('[data-testid="sidebar-item-link-for-nodes"]');

      return {
        label: link?.querySelector(":scope > span")?.textContent,
        icon: link?.querySelector("[data-icon-name]")?.getAttribute("data-icon-name"),
        padding: link ? getComputedStyle(link).paddingLeft : undefined,
        nodesPadding: nodes ? getComputedStyle(nodes).paddingLeft : undefined,
      };
    });

    assert("Lens Overview uses original cluster route with matching label, icon and indent",
      overviewAppearance.label === "Overview" &&
      overviewAppearance.icon === "dashboard" &&
      overviewAppearance.padding === "29px" &&
      overviewAppearance.nodesPadding === "29px", overviewAppearance);

    await overview.click();
    await cluster.waitForFunction(() => location.pathname === "/overview", null, { timeout: 5000 });
    await cluster.getByTestId("navigator-search-toggle").click();
    const searchInput = cluster.getByRole("searchbox", { name: "Filter navigator resources" });

    await searchInput.fill("overview");
    const matchingOverviewEntries = await cluster.evaluate(() => Array.from(
      document.querySelectorAll('[data-testid^="sidebar-item-link-for-"]'),
    ).filter(link => link.querySelector(":scope > span")?.textContent?.toLowerCase() === "overview").length);

    assert("Lens Overview navigation preserves actual route and searchable labels",
      matchingOverviewEntries >= 2, { route: "/overview", matches: matchingOverviewEntries });
    await searchInput.press("Escape");
    await cluster.getByTestId("sidebar-item-link-for-pods").click();
    await cluster.locator(".Pods .TableRow").first().waitFor({ timeout: 5000 });

    // Other Kubernetes resource lists must use Lens's same title-case
    // column header and compact toolbar; verify with real demo data.
    await cluster.getByTestId("sidebar-item-link-for-deployments").click();
    await cluster.locator(".Deployments .TableRow").first().waitFor({ timeout: 5000 });
    const deployments = await cluster.evaluate(() => {
      const h = document.querySelector(".Deployments.ItemListLayout > .header");
      const t = document.querySelector(".Deployments.Table");
      const cell = t?.querySelector(".TableHead .TableCell");

      return {
        route: location.pathname,
        toolbarHeight: h?.getBoundingClientRect().height,
        titleDisplay: h?.querySelector(".title") ? getComputedStyle(h.querySelector(".title")).display : undefined,
        headerHeight: t?.querySelector(".TableHead")?.getBoundingClientRect().height,
        transform: cell ? getComputedStyle(cell).textTransform : undefined,
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });

    assert("Deployments uses Lens resource-list geometry",
      deployments.route === "/deployments" &&
      deployments.toolbarHeight === 40 &&
      deployments.titleDisplay === "none" &&
      deployments.headerHeight === 34 &&
      deployments.transform === "none" &&
      deployments.documentWidth <= deployments.viewport,
      deployments);

    await cluster.getByTestId("sidebar-item-link-for-pods").click();
    await cluster.locator(".Pods .TableRow").first().waitFor({ timeout: 5000 });

    if (!alreadySearching && await cluster.getByTestId("terminal-search-bar").count()) {
      await cluster.getByTestId("terminal-search-close-btn").click();
    }

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
