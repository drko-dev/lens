// Playwright Functional Verification for OpenLens DevOps R4-01: Secure Pilot Window
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));
const outputDir = process.env.OPENLENS_OUTPUT_DIR || path.join(projectRoot, "open-lens/dist-gemini-stage");
const defaultExe = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const fallbackExe = path.join(projectRoot, "open-lens/dist-r4-stage/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const exe = process.env.OPENLENS_EXECUTABLE_PATH || (fs.existsSync(defaultExe) ? defaultExe : fallbackExe);

if (!fs.existsSync(exe)) {
  console.error("Packaged binary does not exist at: " + exe);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync("/tmp/openlens-r4-01-pilot-");
fs.mkdirSync(path.join(tmpDir, "home"));
fs.mkdirSync(path.join(tmpDir, "appdata"));

const screenshotsDir = path.join(projectRoot, "docs/revival/screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

(async () => {
  let app;
  try {
    const env = {
      ...process.env,
      HOME: path.join(tmpDir, "home"),
      CICD: path.join(tmpDir, "appdata"),
      KUBECONFIG: "/dev/null",
      OPENLENS_R4_PILOT: "true",
    };

    console.log("[R4-01 Verification] Launching OpenLens DevOps from dist-r4-stage with --enable-secure-pilot...");
    app = await _electron.launch({
      executablePath: exe,
      args: ["--integration-testing", "--enable-secure-pilot"],
      env,
      timeout: 90000,
    });

    const runtime = await app.evaluate(({ app }) => ({
      name: app.getName(),
      isPackaged: app.isPackaged,
      userData: app.getPath("userData"),
    }));
    console.log("[R4-01 Verification] Runtime identity:", JSON.stringify(runtime));

    if (!runtime.isPackaged) {
      throw new Error("Verification failed: App reported isPackaged = false. Must run packaged binary.");
    }

    let pilotPage = null;
    const registerWindow = (p) => {
      const url = p.url();
      console.log(`[R4-01 Verification] Window opened/navigated: ${url}`);
      if (url.includes("secure-pilot.html")) {
        pilotPage = p;
      }
      p.on("framenavigated", (f) => {
        const frameUrl = f.url();
        console.log(`[R4-01 Verification] Frame navigated: ${frameUrl}`);
        if (frameUrl.includes("secure-pilot.html")) {
          pilotPage = p;
        }
      });
    };

    app.on("window", registerWindow);
    app.windows().forEach(registerWindow);

    // Wait for pilot window to appear
    console.log("[R4-01 Verification] Waiting for Secure Pilot Window to register...");
    const startWait = Date.now();
    while (!pilotPage && Date.now() - startWait < 40000) {
      await new Promise((r) => setTimeout(r, 500));
      for (const w of app.windows()) {
        const liveUrl = await w.evaluate(() => location.href).catch(() => "");
        if (liveUrl.includes("secure-pilot.html")) {
          pilotPage = w;
          break;
        }
      }
    }

    if (!pilotPage) {
      throw new Error("Timed out waiting for Secure Pilot window to open.");
    }

    console.log("[R4-01 Verification] Pilot window detected. Waiting for UI elements...");
    await pilotPage.waitForSelector('[data-testid="pilot-container"]', { timeout: 15000 });

    // 1. Verify Badges
    const contextIsoBadge = await pilotPage.textContent('[data-testid="badge-context-isolation"]');
    const nodeDisabledBadge = await pilotPage.textContent('[data-testid="badge-node-disabled"]');
    const sandboxBadge = await pilotPage.textContent('[data-testid="badge-sandbox"]');

    console.log(`[R4-01 Verification] Badges: [${contextIsoBadge}] [${nodeDisabledBadge}] [${sandboxBadge}]`);
    if (!contextIsoBadge.includes("true") || !nodeDisabledBadge.includes("false") || !sandboxBadge.includes("true")) {
      throw new Error("Security badges do not match required secure isolation parameters.");
    }

    // 2. Direct In-Page Node Symbol Accessibility Test
    const securityAudit = await pilotPage.evaluate(() => {
      return {
        requireUndefined: typeof window.require === "undefined",
        processUndefined: typeof window.process === "undefined",
        bufferUndefined: typeof window.Buffer === "undefined",
        bridgePresent: typeof window.lensSecurePilotBridge === "object" && window.lensSecurePilotBridge !== null,
      };
    });

    console.log("[R4-01 Verification] In-page security audit:", JSON.stringify(securityAudit));
    if (!securityAudit.requireUndefined || !securityAudit.processUndefined || !securityAudit.bufferUndefined || !securityAudit.bridgePresent) {
      throw new Error("Security boundary failed: Node symbols leaked into isolated renderer!");
    }

    // 3. Query DEV Cluster
    console.log("[R4-01 Verification] Querying DEV cluster fixture...");
    await pilotPage.click('[data-testid="btn-query-dev"]');
    await pilotPage.waitForFunction(() => {
      const el = document.querySelector('[data-testid="dev-result"]');
      return el && el.textContent.includes("cluster-dev-01");
    }, { timeout: 10000 });

    const devResultText = await pilotPage.textContent('[data-testid="dev-result"]');
    console.log("[R4-01 Verification] DEV result verified:", devResultText.replace(/\s+/g, " ").slice(0, 120));

    // 4. Query PROD Cluster
    console.log("[R4-01 Verification] Querying PROD cluster fixture...");
    await pilotPage.click('[data-testid="btn-query-prod"]');
    await pilotPage.waitForFunction(() => {
      const el = document.querySelector('[data-testid="prod-result"]');
      return el && el.textContent.includes("cluster-prod-99");
    }, { timeout: 10000 });

    const prodResultText = await pilotPage.textContent('[data-testid="prod-result"]');
    console.log("[R4-01 Verification] PROD result verified:", prodResultText.replace(/\s+/g, " ").slice(0, 120));

    // 5. Negative Test: Verify Node Inaccessibility Button
    await pilotPage.click('[data-testid="btn-test-node"]');
    await pilotPage.waitForSelector('[data-testid="security-test-output"]', { timeout: 5000 });
    const nodeStatusMsg = await pilotPage.textContent('[data-testid="security-test-output"]');
    console.log(`[R4-01 Verification] Node access test output: "${nodeStatusMsg}"`);
    if (!nodeStatusMsg.includes("PASS")) {
      throw new Error("Negative test failed: Node access test did not pass!");
    }

    // 6. Negative Test: Test Unauthorized Channel Invocation
    await pilotPage.click('[data-testid="btn-test-unauthorized-ipc"]');
    await new Promise((r) => setTimeout(r, 800));
    const unauthorizedIpcMsg = await pilotPage.textContent('[data-testid="security-test-output"]');
    console.log(`[R4-01 Verification] Unauthorized IPC test output: "${unauthorizedIpcMsg}"`);
    if (!unauthorizedIpcMsg.includes("PASS")) {
      throw new Error("Negative test failed: Unauthorized IPC channel was not rejected!");
    }

    // 7. Negative Test: Test Spoofed Cluster ID
    await pilotPage.click('[data-testid="btn-test-spoofing"]');
    await new Promise((r) => setTimeout(r, 800));
    const spoofingMsg = await pilotPage.textContent('[data-testid="security-test-output"]');
    console.log(`[R4-01 Verification] Spoofed cluster test output: "${spoofingMsg}"`);
    if (!spoofingMsg.includes("PASS")) {
      throw new Error("Negative test failed: Spoofed cluster request was not rejected!");
    }

    // 8. Capture Screenshot
    const screenshotPath = path.join(screenshotsDir, "r4-01-secure-pilot.png");
    await pilotPage.screenshot({ path: screenshotPath });
    console.log(`[R4-01 Verification] Screenshot saved to: ${screenshotPath}`);

    console.log("\n=======================================================");
    console.log("R4-01 PLAYWRIGHT VERIFICATION PASSED SUCCESSFULLY (100%)");
    console.log("=======================================================\n");

    await app.close();
    process.exit(0);
  } catch (err) {
    console.error("[R4-01 Verification] FATAL ERROR:", err);
    if (app) {
      try { await app.close(); } catch (_) {}
    }
    process.exit(1);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
})();
