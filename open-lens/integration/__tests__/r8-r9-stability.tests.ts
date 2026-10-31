/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Page, ElectronApplication } from "playwright";
import * as utils from "../helpers/utils";
import * as path from "path";

describe("R8/R9 Stability, Typography & Midnight Graphite E2E", () => {
  let window: Page;
  let cleanup: undefined | (() => Promise<void>);
  let app: ElectronApplication;
  const screenshotsDir = path.resolve(__dirname, "../../../docs/revival/screenshots");

  beforeEach(async () => {
    ({ window, cleanup, app } = await utils.start());
    await utils.clickWelcomeButton(window);
  }, 60_000);

  afterEach(async () => {
    await cleanup?.();
  }, 60_000);

  it("boots in Cursor Team by default on a clean install", async () => {
    const hasCursorClass = await window.evaluate(() =>
      document.body.classList.contains("theme-cursor-mono"),
    );

    expect(hasCursorClass).toBe(true);

    const mainBg = await window.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue("--mainBackground").trim(),
    );

    expect(mainBg.toLowerCase()).toBe("#121212");

    const primaryColor = await window.evaluate(() =>
      window.getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
    );

    expect(primaryColor.toLowerCase()).toBe("#0078d4");

    await window.screenshot({
      path: path.join(screenshotsDir, "h2-01-midnight-graphite-startup.png"),
    });
  });

  it("renders Open Sans as the primary computed font family on UI elements", async () => {
    const bodyFont = await window.evaluate(() =>
      window.getComputedStyle(document.body).fontFamily,
    );

    expect(bodyFont).toContain("Open Sans");

    // Check document font loading
    const isOpenSansAvailable = await window.evaluate(() =>
      document.fonts.check('14px "Open Sans"'),
    );

    expect(isOpenSansAvailable).toBe(true);
  });

  it("displays Midnight Graphite as the active selection in Preferences", async () => {
    // Navigate to preferences via application menu
    await app.evaluate(async ({ app }) => {
      await app.applicationMenu
        ?.getMenuItemById(process.platform === "darwin" ? "mac" : "file")
        ?.submenu
        ?.getMenuItemById("navigate-to-preferences")
        ?.click();
    });

    await window.waitForSelector('[data-preference-page-title-test]');

    // Navigate to Appearance tab if exists or check theme input
    const themeInput = await window.waitForSelector("#theme-input", { timeout: 10_000 });

    expect(themeInput).toBeTruthy();

    const selectedThemeText = await window.evaluate(() => {
      const select = document.querySelector("#theme-input");
      const container = select?.closest(".Select") || select?.parentElement;

      return container?.textContent || "";
    });

    expect(selectedThemeText).toContain("Midnight Graphite");

    await window.screenshot({
      path: path.join(screenshotsDir, "h2-02-preferences-midnight-graphite.png"),
    });
  });
});
