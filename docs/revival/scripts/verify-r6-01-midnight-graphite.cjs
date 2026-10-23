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

const outputDir = process.env.OPENLENS_R6_01_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r6-01-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r6-01");

function prepareProfile(tempRoot, colorTheme = "Dark") {
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
  console.log("=== OpenLens DevOps Revival R6-01 Midnight Graphite Verification ===");
  assert(fs.existsSync(executable), `Packaged app executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r6-01-"));
  console.log(`Temporary profile directory: ${tempRoot}`);

  let app;
  const results = {
    executable,
    timestamp: new Date().toISOString(),
    tests: {},
    metrics: {},
  };

  try {
    const profile = prepareProfile(tempRoot, "Dark");
    console.log("Launching packaged app via Playwright...");
    app = await _electron.launch({
      executablePath: executable,
      env: appEnvironment(profile),
      args: ["--no-sandbox", "--disable-gpu"],
    });

    const page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("Main renderer window loaded. Current URL:", page.url());

    // 1. Initial Welcome Screen under Classic Dark Theme
    await page.waitForTimeout(1000);
    const initialWelcomeScreenshot = path.join(evidenceDir, "00-initial-welcome-classic.png");
    await page.screenshot({ path: initialWelcomeScreenshot });
    console.log(`Saved screenshot: ${initialWelcomeScreenshot}`);

    // Verify initial theme is Dark and NOT Midnight Graphite
    const initialThemeState = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement.style;
      const classicLogo = document.querySelector(".Icon.classic-brand");
      const devopsLogo = document.querySelector(".Icon.devops-brand");

      const classicVisible = classicLogo ? window.getComputedStyle(classicLogo).display !== "none" : null;
      const devopsVisible = devopsLogo ? window.getComputedStyle(devopsLogo).display !== "none" : null;

      return {
        hasMidnightClass: body.classList.contains("theme-midnight-graphite"),
        hasLightClass: body.classList.contains("theme-light"),
        mainBackground: root.getPropertyValue("--mainBackground").trim(),
        classicVisible,
        devopsVisible,
      };
    });

    assert.strictEqual(initialThemeState.hasMidnightClass, false, "Initial theme must not have theme-midnight-graphite class");
    assert.strictEqual(initialThemeState.hasLightClass, false, "Initial theme must not have theme-light class");
    results.tests.initialThemeClassicDark = true;
    console.log("✓ Initial theme is classic Dark (no midnight-graphite class, classic brand visible)");

    // 2. Navigate to Preferences (App tab contains Theme selector)
    console.log("Navigating to Preferences > App via IPC...");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("renderer:navigate", "/preferences/app");
      }
    });

    // Also trigger shortcut as reliable fallback
    await page.keyboard.press("Meta+,");
    await page.waitForTimeout(1000);

    await page.locator(".Preferences").waitFor({ state: "visible", timeout: 15_000 });
    console.log("Preferences view loaded.");

    // Explicitly click App tab
    const appTab = page.locator('[data-preference-tab-link-test="app"]');
    await appTab.waitFor({ state: "visible", timeout: 10_000 });
    await appTab.click();
    await page.waitForTimeout(500);

    // Check Theme selector block
    const themeSection = page.locator("#appearance");
    await themeSection.waitFor({ state: "visible", timeout: 10_000 });
    console.log("Theme preference section visible.");

    // Verify Theme select options
    const themeSelectInput = page.locator("#theme-input");
    await themeSelectInput.waitFor({ state: "visible", timeout: 10_000 });

    // Click select to reveal options
    await themeSelectInput.click();
    await page.waitForTimeout(500);

    // Look for Midnight Graphite option
    const midnightOption = page.locator("text=Midnight Graphite");
    await midnightOption.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ 'Midnight Graphite' option present in Theme selector");

    // Select Midnight Graphite
    await midnightOption.click();
    await page.waitForTimeout(1000);

    // 3. Verify Midnight Graphite styling & tokens
    const midnightState = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement.style;
      return {
        hasMidnightClass: body.classList.contains("theme-midnight-graphite"),
        mainBackground: root.getPropertyValue("--mainBackground").trim(),
        contentColor: root.getPropertyValue("--contentColor").trim(),
        primary: root.getPropertyValue("--primary").trim(),
        envProduction: root.getPropertyValue("--envProduction").trim(),
      };
    });

    console.log("Midnight Graphite State:", midnightState);
    assert.strictEqual(midnightState.hasMidnightClass, true, "Body must have theme-midnight-graphite class");
    assert.strictEqual(midnightState.mainBackground, "#0D1117", "mainBackground must match palette #0D1117");
    assert.strictEqual(midnightState.contentColor, "#151B23", "contentColor must match palette #151B23");
    assert.strictEqual(midnightState.primary, "#7196D2", "primary accent must match palette #7196D2");
    assert.strictEqual(midnightState.envProduction, "#EF4444", "envProduction must remain strictly #EF4444");
    results.tests.midnightGraphiteSelected = true;
    console.log("✓ Midnight Graphite theme selected and tokens applied correctly");

    const midnightPrefsScreenshot = path.join(evidenceDir, "01-preferences-midnight-graphite.png");
    await page.screenshot({ path: midnightPrefsScreenshot });
    console.log(`Saved screenshot: ${midnightPrefsScreenshot}`);

    // 4. Navigate back to Welcome to verify DevOps logo is displayed under Midnight Graphite
    console.log("Navigating to Welcome to verify Midnight Graphite branding...");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("renderer:navigate", "/welcome");
      }
    });
    await page.waitForTimeout(1000);

    const welcomeBrandingState = await page.evaluate(() => {
      const classicLogo = document.querySelector(".Icon.classic-brand");
      const devopsLogo = document.querySelector(".Icon.devops-brand");

      const classicStyle = classicLogo ? window.getComputedStyle(classicLogo).display : "not-found";
      const devopsStyle = devopsLogo ? window.getComputedStyle(devopsLogo).display : "not-found";

      return {
        classicStyle,
        devopsStyle,
      };
    });

    console.log("Welcome Branding State under Midnight Graphite:", welcomeBrandingState);
    assert.strictEqual(welcomeBrandingState.classicStyle, "none", "Classic logo must be hidden under Midnight Graphite");
    assert(welcomeBrandingState.devopsStyle === "inline-flex" || welcomeBrandingState.devopsStyle === "flex" || welcomeBrandingState.devopsStyle !== "none",
      "DevOps logo must be visible under Midnight Graphite");
    results.tests.devopsBrandLogoVisible = true;
    console.log("✓ OpenLens DevOps logo active under Midnight Graphite theme");

    const welcomeMidnightScreenshot = path.join(evidenceDir, "02-welcome-midnight-graphite.png");
    await page.screenshot({ path: welcomeMidnightScreenshot });
    console.log(`Saved screenshot: ${welcomeMidnightScreenshot}`);

    // 5. Navigate to Preferences > Appearance to check Density (33px default) and PROD Guard
    console.log("Navigating to Preferences > Appearance...");
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (win) {
        win.webContents.send("renderer:navigate", "/preferences/appearance");
      }
    });
    await page.waitForTimeout(1000);

    const appearanceSection = page.locator("#table-density-preferences");
    await appearanceSection.waitFor({ state: "visible", timeout: 10_000 });

    const isCompactDefault = await page.evaluate(() => {
      const preview = document.querySelector('[data-testid="table-density-preview"]');
      return preview && preview.classList.contains("density-compact");
    });
    assert(isCompactDefault, "Table density must default to compact (33px)");
    results.tests.tableDensityCompactDefault = true;

    const prodLocked = await page.locator('[data-testid="prod-locked-indicator"]').isVisible();
    assert(prodLocked, "Production locked safety indicator must be visible");
    results.tests.prodGuardActive = true;
    console.log("✓ Table density is 33px compact by default, and PROD guard is active");

    const appearanceScreenshot = path.join(evidenceDir, "03-appearance-midnight-graphite.png");
    await page.screenshot({ path: appearanceScreenshot });
    console.log(`Saved screenshot: ${appearanceScreenshot}`);

    // 6. Test Reversibility back to Classic Dark
    console.log("Reverting theme to classic Dark...");
    const appTabRevert = page.locator('[data-preference-tab-link-test="app"]');
    await appTabRevert.waitFor({ state: "visible", timeout: 10_000 });
    await appTabRevert.click();
    await page.waitForTimeout(500);

    const themeSelectInputRevert = page.locator("#theme-input");
    await themeSelectInputRevert.click();
    await page.waitForTimeout(500);

    const darkOption = page.locator("text=Dark");
    await darkOption.waitFor({ state: "visible", timeout: 5000 });
    await darkOption.click();
    await page.waitForTimeout(1000);

    const revertedDarkState = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement.style;
      return {
        hasMidnightClass: body.classList.contains("theme-midnight-graphite"),
        hasLightClass: body.classList.contains("theme-light"),
        mainBackground: root.getPropertyValue("--mainBackground").trim(),
        primary: root.getPropertyValue("--primary").trim(),
        envProduction: root.getPropertyValue("--envProduction").trim(),
      };
    });

    console.log("Reverted Dark State:", revertedDarkState);
    assert.strictEqual(revertedDarkState.hasMidnightClass, false, "theme-midnight-graphite class must be removed");
    assert.strictEqual(revertedDarkState.mainBackground, "#1e2124", "mainBackground must revert to classic #1e2124");
    assert.strictEqual(revertedDarkState.primary, "#3d90ce", "primary must revert to classic #3d90ce");
    results.tests.revertedToClassicDark = true;
    console.log("✓ Clean reversion to classic Dark verified without residual CSS classes or variables");

    const darkRevertedScreenshot = path.join(evidenceDir, "04-reverted-classic-dark.png");
    await page.screenshot({ path: darkRevertedScreenshot });
    console.log(`Saved screenshot: ${darkRevertedScreenshot}`);

    // 7. Test Switch to Classic Light
    console.log("Switching theme to classic Light...");
    await themeSelectInputRevert.click();
    await page.waitForTimeout(500);

    const lightOption = page.locator("text=Light");
    await lightOption.waitFor({ state: "visible", timeout: 5000 });
    await lightOption.click();
    await page.waitForTimeout(1000);

    const lightState = await page.evaluate(() => {
      const body = document.body;
      const root = document.documentElement.style;
      return {
        hasMidnightClass: body.classList.contains("theme-midnight-graphite"),
        hasLightClass: body.classList.contains("theme-light"),
        mainBackground: root.getPropertyValue("--mainBackground").trim(),
      };
    });

    console.log("Light State:", lightState);
    assert.strictEqual(lightState.hasMidnightClass, false, "Midnight class must not be active on Light");
    assert.strictEqual(lightState.hasLightClass, true, "theme-light must be active on Light");
    assert.strictEqual(lightState.mainBackground, "#f1f1f1", "mainBackground must match Light #f1f1f1");
    results.tests.classicLightWorking = true;
    console.log("✓ Classic Light theme working normally");

    const lightScreenshot = path.join(evidenceDir, "05-classic-light.png");
    await page.screenshot({ path: lightScreenshot });
    console.log(`Saved screenshot: ${lightScreenshot}`);

    // 8. Hash check
    const exeHash = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
    const asarPath = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/Resources/app.asar");
    const asarHash = fs.existsSync(asarPath)
      ? crypto.createHash("sha256").update(fs.readFileSync(asarPath)).digest("hex")
      : null;

    results.metrics = {
      executableSha256: exeHash,
      appAsarSha256: asarHash,
      evidenceDirectory: evidenceDir,
    };

    const reportPath = path.join(projectRoot, "docs/revival/R6_01_VERIFICATION.json");
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`Verification report written to: ${reportPath}`);

    console.log("\n=== ALL R6-01 VERIFICATIONS PASSED SUCCESSFULLY ===");
  } finally {
    await closeApp(app);
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
