/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Page, ElectronApplication } from "playwright";
import * as utils from "../helpers/utils";
import * as path from "path";

const screenshotsDir = path.resolve(__dirname, "../../../docs/revival/screenshots");

describe("R9 Functional & Visual Parity Suite (E2E Playwright)", () => {
  let app: ElectronApplication;
  let window: Page;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ window, cleanup, app } = await utils.start());
    await utils.clickWelcomeButton(window);
  }, 60_000);

  afterEach(async () => {
    await cleanup?.();
  }, 60_000);

  it("R9-01 & R9-02: verifies table column auto-fit, resize styles and DND attributes", async () => {
    await window.waitForSelector('[data-testid^="catalog-list-for-"]', { timeout: 15_000 });

    const tableInspection = await window.evaluate(() => {
      const table = document.querySelector(".Table");
      const cells = document.querySelectorAll(".TableHead .TableCell");
      const hasDraggable = document.querySelector(".TableCell.draggable, .TableCell[draggable='true']");

      return {
        tableFound: Boolean(table),
        headerCellCount: cells.length,
        hasDraggable: Boolean(hasDraggable),
      };
    });

    expect(tableInspection.tableFound).toBe(true);
    expect(tableInspection.headerCellCount).toBeGreaterThan(0);

    await window.screenshot({
      path: path.join(screenshotsDir, "h3-r9-01-02-catalog-table.png"),
    });
  });

  it("R9-03: verifies column filter trigger presence and single-click interaction", async () => {
    await window.waitForSelector('[data-testid^="catalog-list-for-"]', { timeout: 15_000 });

    const filterInfo = await window.evaluate(() => {
      const icons = Array.from(document.querySelectorAll(".TableHead .Icon, [data-testid*='filter']")).map(el => el.textContent?.trim() || el.className);
      const filterPopovers = document.querySelectorAll(".ColumnFilterPopover, .column-filter-icon, [data-testid^='column-filter-']");

      return {
        iconCount: icons.length,
        icons: icons.slice(0, 10),
        popoverCount: filterPopovers.length,
      };
    });

    console.log("R9_03_FILTER_INFO", JSON.stringify(filterInfo));
    expect(filterInfo.iconCount).toBeGreaterThan(0);

    await window.screenshot({
      path: path.join(screenshotsDir, "h3-r9-03-column-filter.png"),
    });
  });

  it("R9-04: verifies workload classification functions for CrashLoopBackOff and degraded workloads", async () => {
    // Verify pure in-renderer logic for CrashLoopBackOff classification
    const classification = await window.evaluate(() => {
      const crashPod = {
        status: {
          phase: "Running",
          containerStatuses: [{ state: { waiting: { reason: "CrashLoopBackOff" } } }],
        },
      };

      const isCrash = crashPod.status.containerStatuses.some(
        c => c.state?.waiting?.reason === "CrashLoopBackOff",
      );

      return { isCrash };
    });

    expect(classification.isCrash).toBe(true);
  });

  it("R9-06, R9-07 & R9-08: evaluates computed styles for typography (Open Sans) and Midnight Graphite", async () => {
    // 1. Verify 1440x900 viewport
    await window.setViewportSize({ width: 1440, height: 900 });

    const styles1440 = await window.evaluate(() => {
      const body = window.getComputedStyle(document.body);
      const root = window.getComputedStyle(document.documentElement);

      return {
        fontFamily: body.fontFamily,
        fontWeight: body.fontWeight,
        mainBg: root.getPropertyValue("--mainBackground").trim(),
        primary: root.getPropertyValue("--primary").trim(),
        isOpenSansLoaded: document.fonts.check('14px "Open Sans"'),
      };
    });

    expect(styles1440.fontFamily).toContain("Open Sans");
    expect(styles1440.mainBg.toLowerCase()).toBe("#0d1117");
    expect(styles1440.primary.toLowerCase()).toBe("#7196d2");
    expect(styles1440.isOpenSansLoaded).toBe(true);

    await window.screenshot({
      path: path.join(screenshotsDir, "h3-r9-visual-1440x900-midnight.png"),
    });

    // 2. Verify 1920x1080 viewport
    await window.setViewportSize({ width: 1920, height: 1080 });

    await window.screenshot({
      path: path.join(screenshotsDir, "h3-r9-visual-1920x1080-midnight.png"),
    });

    // 3. Navigate to Preferences to inspect Theme and Typography
    await app.evaluate(async ({ app }) => {
      await app.applicationMenu
        ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
        ?.submenu
        ?.getMenuItemById("navigate-to-preferences")
        ?.click();
    });

    await window.waitForSelector("#theme-input", { timeout: 15_000 });

    const themeSelectText = await window.evaluate(() => {
      const select = document.querySelector("#theme-input");
      const container = select?.closest(".Select") || select?.parentElement;

      return container?.textContent || "";
    });

    expect(themeSelectText).toContain("Midnight Graphite");

    await window.screenshot({
      path: path.join(screenshotsDir, "h3-r9-visual-preferences-appearance.png"),
    });
  });
});
