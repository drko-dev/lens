/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * OpenLens DevOps Revival — R7-08 E2E Verification
 * Advanced Pod Diagnostics: Attach Debug Container, Log Ergonomics, ResourceQuota Headroom
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "../../..");
const harnessDir = path.join(__dirname, "r7-08-harness");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-08");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// 1. Compile real React harness bundle with esbuild & sass
console.log("Compiling real React test harness with esbuild & sass...");
try {
  execSync("node build.cjs", { cwd: harnessDir, stdio: "inherit" });
} catch (err) {
  console.error("Failed to build harness bundle:", err);
  process.exit(1);
}

const bundlePath = path.join(harnessDir, "dist/bundle.js");
const stylesPath = path.join(harnessDir, "dist/styles.css");
const htmlPath = path.join(harnessDir, "dist/index.html");

if (!fs.existsSync(bundlePath) || !fs.existsSync(stylesPath) || !fs.existsSync(htmlPath)) {
  console.error("Harness build artifacts missing:", { bundlePath, stylesPath, htmlPath });
  process.exit(1);
}

const bundleContent = fs.readFileSync(bundlePath);
const stylesContent = fs.readFileSync(stylesPath);
const htmlContent = fs.readFileSync(htmlPath);

const { chromium } = require(path.join(projectRoot, "node_modules/playwright"));
const chromeExecutable = "/Users/gustavomarcon/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

// Start HTTP server for Playwright browser
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(htmlContent);
  } else if (req.url === "/bundle.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(bundleContent);
  } else if (req.url === "/styles.css") {
    res.writeHead(200, { "Content-Type": "text/css" });
    res.end(stylesContent);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, "127.0.0.1", async () => {
  const port = server.address().port;
  console.log(`Test harness HTTP server running at http://127.0.0.1:${port}`);

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: fs.existsSync(chromeExecutable) ? chromeExecutable : undefined,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

    console.log("\n=== TEST SUITE 1: ATTACH DEBUG CONTAINER (DEV CLUSTER) ===");
    await page.waitForSelector('[data-testid="section-debug"]');

    const targetClusterText = await page.textContent('[data-testid="target-cluster"]');
    assert(targetClusterText.includes("DEVELOPMENT"), "Target cluster must indicate DEVELOPMENT in dev mode");
    console.log("✓ Target cluster identified correctly:", targetClusterText.trim());

    const warningBanner = await page.$('[data-testid="immutable-warning-banner"]');
    assert(warningBanner !== null, "Immutability warning banner must be visible");
    console.log("✓ Persistent Pod Modification warning banner confirmed");

    // PROD Guard must NOT be visible in dev
    const prodGuardInDev = await page.$('[data-testid="prod-guard-banner"]');
    assert(prodGuardInDev === null, "PROD Guard banner must not be visible in DEV mode");
    console.log("✓ PROD Guard banner confirmed hidden in DEV mode");

    // Select presets (curl and netshoot)
    await page.click('[data-testid="preset-curl"]');
    console.log("✓ Selected 'curl' debug preset");
    await page.click('[data-testid="preset-netshoot"]');
    console.log("✓ Selected 'netshoot' debug preset");

    // Click Attach
    await page.click('[data-testid="attach-submit-btn"]');
    await page.waitForSelector('[data-testid="success-banner"]');
    const successMsg = await page.textContent('[data-testid="success-banner"]');
    assert(successMsg.includes("attached successfully"), "Success banner must confirm container attachment");
    console.log("✓ Container attach confirmed with success banner");

    const devScreenshotPath = path.join(evidenceDir, "01-debug-container-dev.png");
    await page.screenshot({ path: devScreenshotPath });
    console.log(`Saved screenshot: ${devScreenshotPath}`);

    console.log("\n=== TEST SUITE 2: ATTACH DEBUG CONTAINER (PROD GUARD ENFORCEMENT) ===");
    // Switch to PROD
    await page.click('[data-testid="switch-prod-pod"]');
    await page.waitForSelector('[data-testid="prod-guard-banner"]');

    const prodClusterText = await page.textContent('[data-testid="target-cluster"]');
    assert(prodClusterText.includes("PRODUCTION"), "Target cluster must indicate PRODUCTION");
    console.log("✓ Target cluster switched to PRODUCTION:", prodClusterText.trim());

    const isSubmitDisabledInitially = await page.$eval('[data-testid="attach-submit-btn"]', btn => btn.disabled);
    assert(isSubmitDisabledInitially === true, "Attach button must be disabled in PROD until confirmed");
    console.log("✓ PROD Guard successfully blocks execution: Submit button disabled");

    // Check PROD confirmation checkbox
    await page.click('[data-testid="prod-confirm-checkbox"]');
    const isSubmitDisabledBeforeTyping = await page.$eval('[data-testid="attach-submit-btn"]', btn => btn.disabled);
    assert(isSubmitDisabledBeforeTyping === true, "Attach button must still be disabled before exact Pod name typing");
    console.log("✓ PROD Guard blocks submit when checkbox checked but Pod name not typed");

    // Type wrong pod name
    await page.fill('[data-testid="prod-confirmation-input"]', "wrong-pod-name");
    const isSubmitDisabledWrongTyping = await page.$eval('[data-testid="attach-submit-btn"]', btn => btn.disabled);
    assert(isSubmitDisabledWrongTyping === true, "Attach button must still be disabled when wrong Pod name typed");
    console.log("✓ PROD Guard blocks submit when incorrect Pod name typed");

    // Type exact pod name
    await page.fill('[data-testid="prod-confirmation-input"]', "payments-core-5df98-q9p");
    const isSubmitEnabledAfterConfirm = await page.$eval('[data-testid="attach-submit-btn"]', btn => !btn.disabled);
    assert(isSubmitEnabledAfterConfirm === true, "Attach button must be enabled after checkbox + exact Pod name typing");
    console.log("✓ Dual confirmation (checkbox + exact Pod name typing) unlocks submit in PROD");

    await page.click('[data-testid="attach-submit-btn"]');
    await page.waitForSelector('[data-testid="success-banner"]');
    console.log("✓ Attached container in PROD following explicit verification");

    const prodScreenshotPath = path.join(evidenceDir, "02-debug-container-prod.png");
    await page.screenshot({ path: prodScreenshotPath });
    console.log(`Saved screenshot: ${prodScreenshotPath}`);

    console.log("\n=== TEST SUITE 3: LOG ERGONOMICS (SINCE, TAIL & LIVE/PAUSE) ===");
    await page.click('[data-testid="tab-btn-logs"]');
    await page.waitForSelector('[data-testid="section-logs"]');

    const liveBadge = await page.textContent('[data-testid="log-status-live"]');
    assert(liveBadge === "LIVE", "Initial stream status must be LIVE");
    console.log("✓ Initial stream status is LIVE");

    // Pause stream
    await page.click('[data-testid="log-pause-toggle-btn"]');
    const pausedBadge = await page.textContent('[data-testid="log-status-paused"]');
    assert(pausedBadge === "PAUSED", "Status badge must update to PAUSED");
    console.log("✓ Stream paused successfully: PAUSED badge active");

    // Change Since filter
    await page.selectOption('[data-testid="log-since-select"]', "1h");
    const selectedSince = await page.$eval('[data-testid="log-since-select"]', sel => sel.value);
    assert(selectedSince === "1h", "Since filter selection must be 1h");
    console.log("✓ Since filter updated to 1h (sinceSeconds=3600)");

    // Change Tail filter
    await page.selectOption('[data-testid="log-tail-select"]', "100");
    const selectedTail = await page.$eval('[data-testid="log-tail-select"]', sel => sel.value);
    assert(selectedTail === "100", "Tail filter selection must be 100");
    console.log("✓ Tail filter updated to 100 lines (tailLines=100)");

    const logsScreenshotPath = path.join(evidenceDir, "03-log-ergonomics-controls.png");
    await page.screenshot({ path: logsScreenshotPath });
    console.log(`Saved screenshot: ${logsScreenshotPath}`);

    console.log("\n=== TEST SUITE 4: STRUCTURED JSON LOGS VS RAW LOGS ===");
    // Currently in JSON format
    const jsonRows = await page.$$('[data-testid="json-log-row"]');
    assert(jsonRows.length >= 4, "Structured JSON log rows must be rendered");
    console.log(`✓ Structured JSON mode rendered ${jsonRows.length} parsed lines`);

    const infoBadge = await page.$('[data-testid="level-badge-info"]');
    const debugBadge = await page.$('[data-testid="level-badge-debug"]');
    const warnBadge = await page.$('[data-testid="level-badge-warn"]');
    const errorBadge = await page.$('[data-testid="level-badge-error"]');

    assert(infoBadge !== null && debugBadge !== null && warnBadge !== null && errorBadge !== null, "All 4 log level badges (INFO, DEBUG, WARN, ERROR) must be displayed");
    console.log("✓ Colorized level badges verified: INFO, DEBUG, WARN, ERROR");

    const fallbackLine = await page.$('[data-testid="fallback-log-line"]');
    assert(fallbackLine !== null, "Non-JSON plain text log lines must be preserved without error");
    console.log("✓ Plain text non-JSON lines preserved cleanly in fallback rendering");

    // Toggle to Raw mode
    await page.click('[data-testid="log-format-toggle"]');
    const rawLines = await page.$$('[data-testid="raw-log-line"]');
    assert(rawLines.length > 0, "Raw mode must render unprocessed log lines");
    console.log(`✓ Toggled to Raw mode: ${rawLines.length} lines rendered in raw view`);

    // Toggle back to JSON
    await page.click('[data-testid="log-format-toggle"]');

    const jsonScreenshotPath = path.join(evidenceDir, "04-json-structured-logs.png");
    await page.screenshot({ path: jsonScreenshotPath });
    console.log(`Saved screenshot: ${jsonScreenshotPath}`);

    console.log("\n=== TEST SUITE 5: RESOURCEQUOTA HEADROOM & NAMESPACE BREAKDOWN ===");
    await page.click('[data-testid="tab-btn-quotas"]');
    await page.waitForSelector('[data-testid="section-quotas"]');

    // Quota 1: compute-resources-prod in production
    const prodQuotaCard = await page.$('[data-testid="quota-headroom-card-compute-resources-prod"]');
    assert(prodQuotaCard !== null, "Production ResourceQuota card must be rendered");

    // requests.cpu should be critical (95%)
    const cpuReqBadge = await page.textContent('[data-testid="badge-requests.cpu"]');
    assert(cpuReqBadge === "critical", "requests.cpu at 95% must have 'critical' badge");
    console.log("✓ requests.cpu at 95% classified as 'critical'");

    // limits.cpu should be warning (80%)
    const cpuLimBadge = await page.textContent('[data-testid="badge-limits.cpu"]');
    assert(cpuLimBadge === "warning", "limits.cpu at 80% must have 'warning' badge");
    console.log("✓ limits.cpu at 80% classified as 'warning'");

    // requests.memory should be normal (50%)
    const memReqBadge = await page.textContent('[data-testid="badge-requests.memory"]');
    assert(memReqBadge === "normal", "requests.memory at 50% must have 'normal' badge");
    console.log("✓ requests.memory at 50% classified as 'normal'");

    // pods should be critical (120% unclamped)
    const podsBadge = await page.textContent('[data-testid="badge-pods"]');
    assert(podsBadge === "critical", "pods at 120% must have 'critical' badge");
    console.log("✓ pods at 120% (exceeded, unclamped) classified as 'critical'");

    // Quota 3: unlimited-sample (zero hard limit) -> N/A
    const zeroHardBadge = await page.textContent('[data-testid="quota-headroom-card-unlimited-sample"] [data-testid="badge-requests.cpu"]');
    assert(zeroHardBadge === "N/A", "Zero hard limit must yield 'N/A' badge");
    console.log("✓ Zero hard limit safely evaluated to 'N/A' without division-by-zero or crashes");

    const quotasScreenshotPath = path.join(evidenceDir, "05-resourcequota-headroom.png");
    await page.screenshot({ path: quotasScreenshotPath });
    console.log(`Saved screenshot: ${quotasScreenshotPath}`);

    console.log("\n========================================================");
    console.log("  ALL R7-08 PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY!   ");
    console.log("========================================================\n");
  } catch (err) {
    console.error("Playwright verification failed:", err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
