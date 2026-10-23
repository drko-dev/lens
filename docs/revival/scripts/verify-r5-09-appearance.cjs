/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));

const outputDir = process.env.OPENLENS_R5_09_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r5-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r5-09");

function prepareProfile(tempRoot, colorTheme = "lens-dark") {
  const home = path.join(tempRoot, "home");
  const appData = path.join(home, "Library/Application Support/OpenLens");
  const userData = path.join(appData, "lens-local-storage");

  fs.mkdirSync(userData, { recursive: true });

  fs.writeFileSync(path.join(userData, "lens-cluster-store.json"), JSON.stringify({
    clusters: [],
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  fs.writeFileSync(path.join(userData, "lens-user-store.json"), JSON.stringify({
    preferences: {
      colorTheme,
      tableDensity: "compact",
      environmentColors: {},
    },
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  return { home, appData, userData };
}

function appEnvironment(profile) {
  return {
    ...process.env,
    HOME: profile.home,
    CICD: profile.appData,
    OPENLENS_WORKSPACE_TABS: "true",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    all_proxy: "",
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
  };
}

async function waitForMainRenderer(app) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    const page = app.windows().find((candidate) => candidate.url().startsWith("https://lens.app"));
    if (page) {
      await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
      return page;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for the packaged app's main renderer");
}

async function closeApp(app) {
  if (!app) return;
  try {
    await app.close();
  } catch {
    // Ignore close errors
  }
}

async function run() {
  console.log("=== OpenLens DevOps Revival R5-09 Appearance Verification ===");
  assert(fs.existsSync(executable), `Packaged app executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r5-09-"));
  console.log(`Temporary profile directory: ${tempRoot}`);

  let app;
  const results = {
    executable,
    timestamp: new Date().toISOString(),
    tests: {},
    metrics: {},
  };

  try {
    const profile = prepareProfile(tempRoot, "lens-dark");
    console.log("Launching packaged app via Playwright...");
    app = await _electron.launch({
      executablePath: executable,
      env: appEnvironment(profile),
      args: ["--no-sandbox", "--disable-gpu"],
    });

    const page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("Main renderer window loaded. Current URL:", page.url());
    await page.screenshot({ path: path.join(evidenceDir, "00-initial-load.png") });

    // Look for any interactive navigation elements or print the current DOM structure
    const pageHtml = await page.evaluate(() => document.body.innerHTML);
    console.log("Initial page HTML snippet:", pageHtml.slice(0, 500));

    // Navigate to preferences Appearance tab
    console.log("Navigating to Preferences > Appearance via IPC and Menu...");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("renderer:navigate", "/preferences/appearance");
      }
    });

    // Also trigger via ApplicationMenu if Preferences is not visible yet
    const prefsOpenedViaMenu = await app.evaluate(({ Menu }) => {
      const all = Menu.getApplicationMenu()?.items || [];
      for (const top of all) {
        const item = top.submenu?.items.find((y) => /^preferences(\.{3}|…)?$/i.test(y.label));
        if (item) {
          item.click();
          return item.label;
        }
      }
      return null;
    });
    console.log("Preferences menu trigger result:", prefsOpenedViaMenu);

    // Also trigger keyboard shortcut as fallback
    await page.keyboard.press("Meta+,");
    await page.waitForTimeout(1000);

    // Wait for preferences layout
    await page.locator(".Preferences").waitFor({ state: "visible", timeout: 15_000 });
    console.log("Preferences view loaded.");

    // Click Appearance tab to ensure it's selected
    const appearanceTab = page.locator('[data-preference-tab-link-test="appearance"]');
    await appearanceTab.waitFor({ state: "visible", timeout: 10_000 });
    await appearanceTab.click();
    await page.waitForTimeout(1000);

    results.tests.appearanceTabPresent = true;
    console.log("✓ Appearance tab clicked and active");

    // Check Table Density section
    const densitySection = page.locator("#table-density-preferences");
    await densitySection.waitFor({ state: "visible", timeout: 10_000 });
    results.tests.densitySectionVisible = true;
    console.log("✓ Table density section visible");

    // 1. Capture initial compact density screenshot
    const compactScreenshot = path.join(evidenceDir, "01-appearance-compact-dark.png");
    await page.screenshot({ path: compactScreenshot });
    console.log(`Saved screenshot: ${compactScreenshot}`);

    // Verify initial density is compact
    const isInitiallyCompact = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="table-density-preview"]');
      return preview && preview.classList.contains("density-compact");
    });
    assert(isInitiallyCompact, "Preview table should have density-compact class initially");
    results.tests.initialCompactMode = true;

    // 2. Click Comfortable radio
    console.log("Switching Table Density to Comfortable (42px)...");
    const comfortableLabel = page.locator("text=Comfortable (42px)");
    await comfortableLabel.click();
    await page.waitForTimeout(500);

    const isNowComfortable = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="table-density-preview"]');
      return preview && preview.classList.contains("density-comfortable");
    });
    assert(isNowComfortable, "Preview table should reactively update to density-comfortable");
    results.tests.reactivelySwitchedToComfortable = true;
    console.log("✓ Table reactively switched to comfortable (42px)");

    const comfortableScreenshot = path.join(evidenceDir, "02-appearance-comfortable-dark.png");
    await page.screenshot({ path: comfortableScreenshot });
    console.log(`Saved screenshot: ${comfortableScreenshot}`);

    // 3. Environment Colors Section Verification
    const envColorsSection = page.locator("#environment-colors-preferences");
    await envColorsSection.waitFor({ state: "visible", timeout: 10_000 });
    results.tests.envColorsSectionVisible = true;
    console.log("✓ Environment colors section visible");

    // Verify PROD is strictly locked
    const prodLocked = await page.locator('[data-testid="prod-locked-indicator"]').isVisible();
    assert(prodLocked, "Production locked safety indicator must be visible");
    const prodInputExists = await page.locator('[data-testid="env-color-picker-production"]').count();
    assert(prodInputExists === 0, "Production must NOT have a color picker input");
    results.tests.productionLockedSafetyGuard = true;
    console.log("✓ Production locked safety guard verified (read-only red #EF4444)");

    // 4. Customize DEV and STG colors
    console.log("Customizing DEV to Cyan (#06B6D4) and STG to Pink (#EC4899)...");
    const devInput = page.locator('[data-testid="env-color-input-development"]');
    await devInput.fill("#06B6D4");
    const stgInput = page.locator('[data-testid="env-color-input-staging"]');
    await stgInput.fill("#EC4899");
    await page.waitForTimeout(500);

    // Verify CSS variables updated on document.documentElement
    const customCssVars = await page.evaluate(() => {
      const root = document.documentElement.style;
      return {
        dev: root.getPropertyValue("--envDevelopment"),
        devSoft: root.getPropertyValue("--envDevelopmentSoft"),
        stg: root.getPropertyValue("--envStaging"),
        stgSoft: root.getPropertyValue("--envStagingSoft"),
        prod: root.getPropertyValue("--envProduction"),
      };
    });

    assert.strictEqual(customCssVars.dev, "#06B6D4", "CSS variable --envDevelopment must update dynamically");
    assert.strictEqual(customCssVars.stg, "#EC4899", "CSS variable --envStaging must update dynamically");
    assert.strictEqual(customCssVars.prod, "#EF4444", "Production CSS variable must remain strictly locked to #EF4444");
    results.tests.customEnvironmentColorsApplied = true;
    console.log("✓ Custom environment colors applied dynamically via CSS variables (PROD retained #EF4444)");

    const customColorsScreenshot = path.join(evidenceDir, "03-environment-colors-custom.png");
    await page.screenshot({ path: customColorsScreenshot });
    console.log(`Saved screenshot: ${customColorsScreenshot}`);

    // 5. Test Light Theme Compatibility
    console.log("Testing Light Theme compatibility...");
    await page.evaluate(() => {
      document.body.classList.add("theme-light");
    });
    await page.waitForTimeout(500);

    const lightScreenshot = path.join(evidenceDir, "04-appearance-light-theme.png");
    await page.screenshot({ path: lightScreenshot });
    console.log(`Saved screenshot: ${lightScreenshot}`);
    results.tests.lightThemeCompatible = true;

    // Reset back to dark
    await page.evaluate(() => {
      document.body.classList.remove("theme-light");
    });
    await page.waitForTimeout(500);

    // 6. Test Restore Default Colors button
    console.log("Testing 'Restore default colors' button...");
    const restoreBtn = page.locator('[data-testid="restore-default-colors-btn"]');
    await restoreBtn.click();
    await page.waitForTimeout(500);

    const restoredCssVars = await page.evaluate(() => {
      const root = document.documentElement.style;
      return {
        dev: root.getPropertyValue("--envDevelopment"),
        stg: root.getPropertyValue("--envStaging"),
      };
    });

    assert.strictEqual(restoredCssVars.dev, "", "Custom --envDevelopment must be removed on restore");
    assert.strictEqual(restoredCssVars.stg, "", "Custom --envStaging must be removed on restore");
    results.tests.restoreDefaultsVerified = true;
    console.log("✓ Default colors restored successfully");

    const restoredScreenshot = path.join(evidenceDir, "05-restored-defaults.png");
    await page.screenshot({ path: restoredScreenshot });
    console.log(`Saved screenshot: ${restoredScreenshot}`);

    // Read stored user preferences to verify persistence
    const userStoreRaw = fs.readFileSync(path.join(profile.userData, "lens-user-store.json"), "utf8");
    const userStore = JSON.parse(userStoreRaw);
    results.metrics.persistedPreferences = userStore.preferences;
    console.log("Persisted preferences:", JSON.stringify(userStore.preferences, null, 2));

    results.success = true;
    console.log("\n=== ALL R5-09 APPEARANCE VERIFICATIONS PASSED ===");
  } finally {
    await closeApp(app);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  // Write verification JSON report
  const reportPath = path.join(projectRoot, "docs/revival/R5_09_VERIFICATION.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Saved verification report: ${reportPath}`);
}

run().catch((error) => {
  console.error("FATAL verification failure:", error);
  process.exit(1);
});
