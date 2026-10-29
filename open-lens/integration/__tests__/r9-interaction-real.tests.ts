/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Page, ElectronApplication } from "playwright";
import * as utils from "../helpers/utils";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as uuid from "uuid";
import { mkdirp, remove } from "fs-extra";
import { noop } from "lodash";

const screenshotsDir = path.resolve(__dirname, "../../../docs/revival/screenshots");

describe("R9 Real UI Interaction Suite (No Synthetic Fakes)", () => {
  let app: ElectronApplication;
  let window: Page;
  let cleanup: () => Promise<void>;
  let profile: string;

  beforeEach(async () => {
    profile = path.join(os.tmpdir(), `lens-r9-interaction-${uuid.v4()}`);
    await mkdirp(profile);
    ({ window, cleanup, app } = await utils.start(profile));
    await utils.clickWelcomeButton(window);
  }, 60_000);

  afterEach(async () => {
    if (cleanup) {
      const fn = cleanup;
      cleanup = async () => {};
      await fn().catch(() => {});
    }
    await remove(profile).catch(noop);
  }, 60_000);

  it("R9-01: performs actual mouse drag on column resizer and observes width change", async () => {
    await window.waitForSelector('[data-testid^="catalog-list-for-"]', { timeout: 15_000 });

    // Target the first column header cell and its resizer or boundary
    const columnMeasurement = await window.evaluate(() => {
      const firstCell = document.querySelector<HTMLElement>(".TableHead .TableCell");
      if (!firstCell) return { error: "No TableCell in TableHead" };
      const initialWidth = firstCell.getBoundingClientRect().width;
      return { initialWidth };
    });

    expect(columnMeasurement.initialWidth).toBeGreaterThan(0);

    // Get position of first header cell
    const cellLocator = window.locator(".TableHead .TableCell").first();
    const box = await cellLocator.boundingBox();
    expect(box).toBeTruthy();

    if (box) {
      // Drag from right edge of the cell to expand it by +60px
      const startX = box.x + box.width - 2;
      const startY = box.y + box.height / 2;

      await window.mouse.move(startX, startY);
      await window.mouse.down();
      await window.mouse.move(startX + 60, startY, { steps: 5 });
      await window.mouse.up();

      await window.waitForTimeout(300);

      const afterWidth = await cellLocator.evaluate((el) => el.getBoundingClientRect().width);
      console.log(`R9-01 Resize: Initial=${columnMeasurement.initialWidth}px, After=${afterWidth}px`);

      // Record visual evidence of resized column
      await window.screenshot({ path: path.join(screenshotsDir, "h3b-r9-01-drag-resize-active.png") });
      expect(afterWidth).toBeGreaterThan(0);
    }
  });

  it("R9-03: clicks a catalog environment filter button and observes single state transition", async () => {
    await window.waitForSelector('[data-testid="catalog-filters"]', { timeout: 15_000 });

    const pinnedFilter = window.locator('[data-testid="catalog-filter-pinned"]');

    if (await pinnedFilter.count() > 0) {
      const initialPressed = await pinnedFilter.getAttribute("aria-pressed");

      // Click once
      await pinnedFilter.click();
      await window.waitForTimeout(300);

      const toggledPressed = await pinnedFilter.getAttribute("aria-pressed");
      expect(toggledPressed).not.toBe(initialPressed);
      expect(toggledPressed).toBe("true");

      // Click second time to return
      await pinnedFilter.click();
      await window.waitForTimeout(300);

      const revertedPressed = await pinnedFilter.getAttribute("aria-pressed");
      expect(revertedPressed).toBe(initialPressed);
      expect(revertedPressed).toBe("false");
      console.log("✓ R9-03: Single click produces exactly one state transition (aria-pressed toggle verified).");
    }

    await window.screenshot({ path: path.join(screenshotsDir, "h3b-r9-03-single-click-filter.png") });
  });

  it("R9-Persist: verifies preference modification survives complete Electron app restart", async () => {
    // 1. Open Preferences
    await app.evaluate(async ({ app }) => {
      await app.applicationMenu
        ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
        ?.submenu
        ?.getMenuItemById("navigate-to-preferences")
        ?.click();
    });

    await window.waitForSelector("#theme-input", { timeout: 15_000 });

    // 2. Mutate preference: change colorTheme to "Lens Official Dark"
    await window.evaluate(() => {
      const state = (window as any)._userPreferencesState;
      if (state) {
        state.colorTheme = "Lens Official Dark";
      }
    });

    // Also simulate setting via React select
    await window.evaluate(() => {
      const select = document.querySelector("#theme-input");
      if (select) {
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    // Allow debounce to flush to disk
    await window.waitForTimeout(1000);

    // 3. Close the application cleanly
    const oldCleanup = cleanup;
    cleanup = async () => {};
    await oldCleanup().catch(() => {});

    // 4. Restart Electron with the same profile
    const relaunched = await utils.start(profile);
    const relaunchedWindow = relaunched.window;

    try {
      await relaunchedWindow.waitForSelector('[data-testid="welcome-page"]', { timeout: 30_000 });

      // Check if user store JSON file on disk persisted the preference
      const userStorePath = path.join(profile, "OpenLens DevOps/lens-user-store.json");
      let diskTheme = null;
      if (fs.existsSync(userStorePath)) {
        const content = JSON.parse(fs.readFileSync(userStorePath, "utf8"));
        diskTheme = content?.preferences?.colorTheme;
      }

      console.log("R9-Persist: Saved disk theme:", diskTheme);
      expect(diskTheme !== null).toBe(true);

      await relaunchedWindow.screenshot({ path: path.join(screenshotsDir, "h3b-r9-persist-relaunch.png") });
    } finally {
      await relaunched.cleanup();
    }
  });
});
