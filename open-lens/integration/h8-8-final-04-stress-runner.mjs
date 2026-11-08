/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");
const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/final-04");
const EARLY_GUARD_PATH = path.join(OPEN_LENS_DIR, "integration/early-network-guard.cjs");

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function computeFileMd5(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(content).digest("hex");
}

export function aggregateAndValidateAppMetrics(rawMetrics, mainMem) {
  if (!mainMem || typeof mainMem !== "object") {
    throw new Error("METRICS_VALIDATION_ERROR: mainMem must be a valid non-null object");
  }
  for (const field of ["rss", "heapUsed", "heapTotal", "external"]) {
    const val = mainMem[field];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: mainMem.${field} must be a non-negative finite number, got: ${val}`);
    }
  }

  if (!Array.isArray(rawMetrics) || rawMetrics.length === 0) {
    throw new Error("METRICS_VALIDATION_ERROR: rawMetrics must be a non-empty array of ProcessMetric objects");
  }

  let mainProcess = null;
  const renderers = [];
  const gpus = [];
  const utilities = [];
  let totalCombinedWsKb = 0;

  for (const m of rawMetrics) {
    if (!m || typeof m !== "object") {
      throw new Error("METRICS_VALIDATION_ERROR: Process metric entry is invalid or not an object");
    }

    const pid = m.pid;
    if (!Number.isInteger(pid) || pid <= 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process pid must be a positive integer, got: ${pid}`);
    }

    const wsKb = m.memory?.workingSetSize;
    const peakKb = m.memory?.peakWorkingSetSize;
    const cpu = m.cpu?.percentCPUUsage;

    if (typeof wsKb !== "number" || !Number.isFinite(wsKb) || wsKb < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid workingSetSize: ${wsKb}`);
    }
    if (typeof peakKb !== "number" || !Number.isFinite(peakKb) || peakKb < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid peakWorkingSetSize: ${peakKb}`);
    }
    if (typeof cpu !== "number" || !Number.isFinite(cpu) || cpu < 0) {
      throw new Error(`METRICS_VALIDATION_ERROR: Process ${pid} (${m.type}) has invalid percentCPUUsage: ${cpu}`);
    }

    totalCombinedWsKb += wsKb;

    const entry = {
      pid,
      workingSetMb: wsKb / 1024,
      peakWorkingSetMb: peakKb / 1024,
      cpuPercent: cpu,
    };

    if (m.type === "Browser") {
      if (mainProcess !== null) {
        throw new Error(`METRICS_VALIDATION_ERROR: Multiple Browser (Main) processes found (pid ${mainProcess.pid} and pid ${pid})`);
      }
      mainProcess = entry;
    } else if (m.type === "Tab") {
      renderers.push(entry);
    } else if (m.type === "GPU") {
      gpus.push(entry);
    } else if (m.type === "Utility") {
      utilities.push(entry);
    }
  }

  if (!mainProcess || mainProcess.workingSetMb <= 0) {
    throw new Error(`METRICS_VALIDATION_ERROR: Missing or zero-consumption Main (Browser) process. Found: ${JSON.stringify(mainProcess)}`);
  }

  if (renderers.length === 0) {
    throw new Error("METRICS_VALIDATION_ERROR: No Renderer (Tab) process found in rawMetrics");
  }

  const totalRendererWsMb = renderers.reduce((sum, r) => sum + r.workingSetMb, 0);
  const totalRendererPeakMb = renderers.reduce((sum, r) => sum + r.peakWorkingSetMb, 0);
  const totalRendererCpu = renderers.reduce((sum, r) => sum + r.cpuPercent, 0);

  if (totalRendererWsMb <= 0) {
    throw new Error(`METRICS_VALIDATION_ERROR: Aggregate Renderer working set must be positive, got: ${totalRendererWsMb}`);
  }

  const totalGpuWsMb = gpus.reduce((sum, g) => sum + g.workingSetMb, 0);
  const totalGpuPeakMb = gpus.reduce((sum, g) => sum + g.peakWorkingSetMb, 0);
  const totalGpuCpu = gpus.reduce((sum, g) => sum + g.cpuPercent, 0);

  const totalUtilityWsMb = utilities.reduce((sum, u) => sum + u.workingSetMb, 0);
  const totalUtilityPeakMb = utilities.reduce((sum, u) => sum + u.peakWorkingSetMb, 0);
  const totalUtilityCpu = utilities.reduce((sum, u) => sum + u.cpuPercent, 0);

  return {
    main: {
      pid: mainProcess.pid,
      workingSetMb: Number(mainProcess.workingSetMb.toFixed(2)),
      peakWorkingSetMb: Number(mainProcess.peakWorkingSetMb.toFixed(2)),
      cpuPercent: Number(mainProcess.cpuPercent.toFixed(2)),
    },
    renderer: {
      count: renderers.length,
      pids: renderers.map(r => r.pid),
      workingSetMb: Number(totalRendererWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalRendererPeakMb.toFixed(2)),
      cpuPercent: Number(totalRendererCpu.toFixed(2)),
    },
    gpu: {
      count: gpus.length,
      pids: gpus.map(g => g.pid),
      workingSetMb: Number(totalGpuWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalGpuPeakMb.toFixed(2)),
      cpuPercent: Number(totalGpuCpu.toFixed(2)),
    },
    utility: {
      count: utilities.length,
      pids: utilities.map(u => u.pid),
      workingSetMb: Number(totalUtilityWsMb.toFixed(2)),
      peakWorkingSetMb: Number(totalUtilityPeakMb.toFixed(2)),
      cpuPercent: Number(totalUtilityCpu.toFixed(2)),
    },
    totalCombinedWorkingSetMb: Number((totalCombinedWsKb / 1024).toFixed(2)),
    activeProcessesCount: rawMetrics.length,
  };
}

export function validateScannerStatus(status) {
  if (!status || typeof status !== "object") {
    throw new Error("TELEMETRY_IPC_FAILURE: Scanner status response is null or not an object");
  }
  if (status.error) {
    throw new Error(`TELEMETRY_IPC_FAILURE: Scanner status returned error: ${status.error}`);
  }
  if (typeof status.isEnabled !== "boolean") {
    throw new Error(`TELEMETRY_IPC_FAILURE: Scanner status 'isEnabled' must be a boolean, got: ${status.isEnabled}`);
  }
  if (typeof status.activeWatchersCount !== "number" || !Number.isFinite(status.activeWatchersCount) || status.activeWatchersCount < 0) {
    throw new Error(`TELEMETRY_IPC_FAILURE: Scanner status 'activeWatchersCount' must be a non-negative finite integer, got: ${status.activeWatchersCount}`);
  }
  return {
    isEnabled: status.isEnabled,
    activeWatchersCount: status.activeWatchersCount,
    scope: status.scope,
  };
}

export async function runAcceleratedStressSuite() {
  console.log("==========================================================================");
  console.log("   NovaKube H8.8 FINAL-04-R2: Rigorous Multi-Process Accelerated Stress    ");
  console.log("==========================================================================");

  const TMP_STRESS_DIR = path.join(os.tmpdir(), `novakube-final-04-stress-${Date.now()}`);
  const APPDATA_DIR = path.join(TMP_STRESS_DIR, "appdata");
  const APP_SUPPORT_DIR = path.join(APPDATA_DIR, "OpenLens DevOps");
  const SYNTHETIC_HOME = path.join(TMP_STRESS_DIR, "synthetic-home");
  const SYNTHETIC_KUBEDIR = path.join(SYNTHETIC_HOME, ".kube");
  const SYNTHETIC_KUBECONFIG = path.join(SYNTHETIC_KUBEDIR, "config");

  fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  fs.mkdirSync(path.join(SYNTHETIC_HOME, "Library"), { recursive: true });
  fs.mkdirSync(SYNTHETIC_KUBEDIR, { recursive: true });

  fs.writeFileSync(
    SYNTHETIC_KUBECONFIG,
    `apiVersion: v1
kind: Config
clusters: []
contexts: []
users: []
preferences: {}
`,
    "utf-8",
  );

  console.log("Repo Root:", REPO_ROOT);
  console.log("Evidence Output:", EVIDENCE_DIR);
  console.log("Isolated Sandbox:", TMP_STRESS_DIR);
  console.log("Early Network Guard:", EARLY_GUARD_PATH);

  const interceptedUrls = [];
  const blockedExternalRequests = [];
  const unauthorizedExternalLeaks = [];
  const NEGATIVE_TEST_HOST = "negative-test-external.lens-security-audit.invalid";

  const isAllowedUrl = (url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === "lens.app" ||
        host.endsWith(".lens.app") ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        parsed.protocol === "data:" ||
        parsed.protocol === "file:" ||
        parsed.protocol === "devtools:" ||
        parsed.protocol === "chrome-extension:"
      );
    } catch {
      return false;
    }
  };

  console.log("\n==> [1/7] Launching Electron real application under isolated sandbox...");
  const app = await electron.launch({
    executablePath: ELECTRON_PATH,
    cwd: OPEN_LENS_DIR,
    args: [
      "-r",
      EARLY_GUARD_PATH,
      ".",
      "--use-mock-keychain",
      "--offline",
      `--host-rules=MAP ${NEGATIVE_TEST_HOST} 127.0.0.1`,
    ],
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: SYNTHETIC_HOME,
      KUBECONFIG: SYNTHETIC_KUBECONFIG,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });

  const electronPid = app.process().pid;
  console.log("    ✓ Electron Process PID:", electronPid);

  const testReport = {
    suite: "H8.8-FINAL-04-R2-ACCELERATED-STRESS",
    startedAt: new Date().toISOString(),
    completedAt: null,
    pid: electronPid,
    telemetry: {
      baseline: null,
      block1Post: null,
      block2Post: null,
      block3Post: null,
      resting: null,
      deltasVsBaseline: null,
    },
    stressCycles: {
      totalRequested: 60,
      totalCompleted: 0,
      incidentScansExecuted: 0,
      contextSwitchesExecuted: 0,
      failedCycles: 0,
    },
    negativeNetworkTest: {
      executed: false,
      blockedRequestsCount: 0,
      unauthorizedLeaksCount: 0,
      verdict: "PENDING",
    },
    negativeTelemetryTests: {
      processMetricsValidation: { executed: false, verdict: "PENDING" },
      ipcFailureInjection: { executed: false, verdict: "PENDING" },
    },
    screenshots: {},
    verdict: "PENDING",
  };

  try {
    const ctx = app.context();

    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      interceptedUrls.push(url);

      if (isAllowedUrl(url)) {
        await route.continue();
      } else {
        if (url.includes(NEGATIVE_TEST_HOST)) {
          blockedExternalRequests.push(url);
        } else {
          unauthorizedExternalLeaks.push(url);
        }
        await route.abort("blockedbyclient");
      }
    });

    // Register webRequest interceptor in Electron main process
    await app.evaluate(async ({ session }) => {
      globalThis.__ALL_REQUESTS__ = [];
      globalThis.__BLOCKED_REQUESTS__ = globalThis.__BLOCKED_REQUESTS__ || [];

      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        globalThis.__ALL_REQUESTS__.push(url);

        let isAllowed = false;
        try {
          const parsed = new URL(url);
          const host = parsed.hostname.toLowerCase();
          isAllowed =
            host === "lens.app" ||
            host.endsWith(".lens.app") ||
            host === "localhost" ||
            host === "127.0.0.1" ||
            parsed.protocol === "data:" ||
            parsed.protocol === "file:" ||
            parsed.protocol === "devtools:" ||
            parsed.protocol === "chrome-extension:";
        } catch {
          isAllowed = false;
        }

        if (isAllowed) {
          callback({});
        } else {
          globalThis.__BLOCKED_REQUESTS__.push({
            url,
            timestamp: new Date().toISOString(),
            status: "BLOCKED_BY_POLICY",
          });
          callback({ cancel: true });
        }
      });
    });

    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded");
    await sleep(2500);

    // Negative fail-closed network test
    console.log("\n==> [2/7] Executing Negative Fail-Closed Network Probe...");
    const negUrl = `https://${NEGATIVE_TEST_HOST}/telemetry-audit-probe`;
    const negResult = await win.evaluate(async (target) => {
      try {
        await fetch(target, { method: "GET" });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }, negUrl);

    if (negResult.success) {
      testReport.negativeNetworkTest.verdict = "FAIL";
      throw new Error("FAIL-CLOSED SECURITY VIOLATION: Unauthorized external synthetic probe was not blocked!");
    }

    await sleep(500);

    const mainBlocked = await app.evaluate(() =>
      (globalThis.__BLOCKED_REQUESTS__ || []).map((b) => (typeof b === "string" ? b : b.url)),
    );
    const earlyBlocked = await app.evaluate(() =>
      (globalThis.__BLOCKED_REQUESTS_LOG__ || []).map((b) => b.url || b.target),
    );

    const wasBlockedByPlaywright = blockedExternalRequests.some((u) => u.includes(NEGATIVE_TEST_HOST));
    const wasBlockedByElectron =
      mainBlocked.some((u) => u && u.includes(NEGATIVE_TEST_HOST)) ||
      earlyBlocked.some((u) => u && u.includes(NEGATIVE_TEST_HOST));

    const totalBlockedCount =
      blockedExternalRequests.length +
      mainBlocked.filter((u) => u && u.includes(NEGATIVE_TEST_HOST)).length +
      earlyBlocked.filter((u) => u && u.includes(NEGATIVE_TEST_HOST)).length;

    testReport.negativeNetworkTest.executed = true;
    testReport.negativeNetworkTest.blockedRequestsCount = totalBlockedCount;
    testReport.negativeNetworkTest.unauthorizedLeaksCount = unauthorizedExternalLeaks.length;

    // R1-03: Eliminate assertions that always pass: MUST BE STRICTLY > 0 and confirmed by policy
    if (totalBlockedCount === 0 || (!wasBlockedByPlaywright && !wasBlockedByElectron)) {
      testReport.negativeNetworkTest.verdict = "FAIL";
      throw new Error("FAIL: Security policy did not record any blocked external requests on negative probe.");
    }
    if (testReport.negativeNetworkTest.unauthorizedLeaksCount > 0) {
      testReport.negativeNetworkTest.verdict = "FAIL";
      throw new Error(`FAIL: Unauthorized network leaks detected (${testReport.negativeNetworkTest.unauthorizedLeaksCount})!`);
    }
    testReport.negativeNetworkTest.verdict = "PASS";
    console.log(`    ✓ Negative probe confirmed BLOCKED by security policy (totalBlocked: ${totalBlockedCount}, 0 leaks).`);

    // Initialize UI: NovaKube theme & cluster demo
    console.log("\n==> [3/7] Initializing NovaKube UI, Cluster Demo & Incident Center...");
    await win.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      if (di) {
        const state = di.injectById("user-preferences-state");
        const applyTheme = di.injectById("apply-lens-theme");
        const novakube = di.injectById("openlens-devops-novakube-theme");
        if (state && applyTheme && novakube) {
          state.colorTheme = "NovaKube";
          applyTheme(novakube);
        }
      }
    });
    await sleep(500);

    const welcomeLaunchBtn = win.locator('[data-testid="welcome-launch-demo-cluster"]');
    await welcomeLaunchBtn.waitFor({ state: "visible", timeout: 10_000 });
    await welcomeLaunchBtn.click();
    console.log("    * Waiting for demo cluster frame initialization...");
    await sleep(4000);

    let clusterFrame;
    for (let i = 0; i < 30 && !clusterFrame; i++) {
      clusterFrame = win.frames().find((f) => /openlens-demo-cluster-local\.lens\.app/.test(f.url()));
      if (!clusterFrame) await sleep(500);
    }
    if (!clusterFrame) {
      throw new Error("Cluster demo frame not found after launch.");
    }
    console.log("    ✓ Demo cluster frame attached.");

    // Navigate to Incidents in main frame
    await win.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      if (di) {
        const nav = di.injectById("navigate-to-incidents");
        if (nav) nav({ clusterId: "openlens-demo-cluster-local", namespace: "production" });
      }
    });
    await sleep(2000);

    const incidentListView = win.locator('[data-testid="incident-list-view"]');
    await incidentListView.waitFor({ state: "visible", timeout: 15_000 });
    console.log("    ✓ Incident Workbench mounted in authentic main frame.");

    // Explicitly start the LocalIncidentScanner via authentic IPC and verify it is enabled
    console.log("    * Initializing and verifying LocalIncidentScanner via authentic IPC...");
    const initialScannerStatus = await win.evaluate(async () => {
      const { ipcRenderer } = require("electron");
      let status = await ipcRenderer.invoke("openlens:incident:scanner:get-status");
      if (!status.isEnabled) {
        status = await ipcRenderer.invoke("openlens:incident:scanner:start", {
          scope: {
            clusterId: "openlens-demo-cluster-local",
            namespace: "production",
          },
        });
      }
      return status;
    });

    if (!initialScannerStatus.isEnabled) {
      throw new Error("FAIL: LocalIncidentScanner could not be started or is not enabled.");
    }
    console.log("    ✓ Scanner started and enabled. Active cluster:", initialScannerStatus.scope?.clusterId);

    // Capture stabilized baseline screenshot
    const shotBaseline = path.join(EVIDENCE_DIR, "01_ui_stabilized_baseline.png");
    await win.screenshot({ path: shotBaseline });
    testReport.screenshots["01_ui_stabilized_baseline"] = {
      path: shotBaseline,
      md5: computeFileMd5(shotBaseline),
    };
    console.log("    ✓ Baseline screenshot captured (MD5:", testReport.screenshots["01_ui_stabilized_baseline"].md5, ")");

    // Function to collect detailed multi-process telemetry with strict validation
    const collectDetailedTelemetry = async (label) => {
      const appMetrics = await app.evaluate(({ app: electronApp }, { label }) => {
        const rawMetrics = electronApp.getAppMetrics();
        const mainMem = process.memoryUsage();
        return {
          label,
          timestamp: Date.now(),
          rawMetrics,
          mainMem: {
            rss: mainMem.rss,
            heapUsed: mainMem.heapUsed,
            heapTotal: mainMem.heapTotal,
            external: mainMem.external,
          },
        };
      }, { label });

      const validatedBreakdown = aggregateAndValidateAppMetrics(appMetrics.rawMetrics, appMetrics.mainMem);

      // Query active scanner status via authentic IPC
      const rawScannerStatus = await win.evaluate(async () => {
        const { ipcRenderer } = require("electron");
        try {
          return await ipcRenderer.invoke("openlens:incident:scanner:get-status");
        } catch (err) {
          return { error: err ? String(err.message || err) : "Unknown IPC error" };
        }
      });

      const validatedScanner = validateScannerStatus(rawScannerStatus);

      return {
        label,
        timestamp: appMetrics.timestamp,
        mainProcessMemory: {
          rssMb: Number((appMetrics.mainMem.rss / (1024 * 1024)).toFixed(2)),
          heapUsedMb: Number((appMetrics.mainMem.heapUsed / (1024 * 1024)).toFixed(2)),
          heapTotalMb: Number((appMetrics.mainMem.heapTotal / (1024 * 1024)).toFixed(2)),
          externalMb: Number((appMetrics.mainMem.external / (1024 * 1024)).toFixed(2)),
        },
        processBreakdown: validatedBreakdown,
        activeProcessesCount: validatedBreakdown.activeProcessesCount,
        activeWatchers: validatedScanner.activeWatchersCount,
        isScannerEnabled: validatedScanner.isEnabled,
      };
    };

    // -------------------------------------------------------------------------
    // Negative Telemetry & IPC Validation Probes (FINAL-04-R2)
    // -------------------------------------------------------------------------
    console.log("    * Executing Negative Process Metrics Telemetry Probes...");
    const sampleMainMem = { rss: 100 * 1024 * 1024, heapUsed: 50 * 1024 * 1024, heapTotal: 80 * 1024 * 1024, external: 10 * 1024 * 1024 };

    let probeMissingMain = false;
    try {
      aggregateAndValidateAppMetrics(
        [{ type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.0 } }],
        sampleMainMem,
      );
    } catch (err) {
      if (/Missing or zero-consumption Main/.test(err.message)) probeMissingMain = true;
    }
    if (!probeMissingMain) throw new Error("FAIL: Negative probe did not reject missing Main process");

    let probeMissingRenderer = false;
    try {
      aggregateAndValidateAppMetrics(
        [{ type: "Browser", pid: 100, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 0.5 } }],
        sampleMainMem,
      );
    } catch (err) {
      if (/No Renderer \(Tab\) process found/.test(err.message)) probeMissingRenderer = true;
    }
    if (!probeMissingRenderer) throw new Error("FAIL: Negative probe did not reject missing Renderer process");

    let probeNegativeMem = false;
    try {
      aggregateAndValidateAppMetrics(
        [
          { type: "Browser", pid: 100, memory: { workingSetSize: -100, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 0.5 } },
          { type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.0 } },
        ],
        sampleMainMem,
      );
    } catch (err) {
      if (/invalid workingSetSize/.test(err.message)) probeNegativeMem = true;
    }
    if (!probeNegativeMem) throw new Error("FAIL: Negative probe did not reject negative workingSetSize");

    testReport.negativeTelemetryTests.processMetricsValidation = { executed: true, verdict: "PASS" };
    console.log("    ✓ Negative Process Metrics Probes confirmed FAIL-CLOSED (missing/negative values rejected).");

    // Negative IPC Failure Probe (FINAL-04-R2: Requirement 1)
    console.log("    * Executing Negative IPC Failure Telemetry Probe...");
    let probeIpcErrorCaught = false;
    try {
      await win.evaluate(() => {
        const { ipcRenderer } = require("electron");
        window.__origIpcInvoke = ipcRenderer.invoke;
        ipcRenderer.invoke = async (channel, ...args) => {
          if (channel === "openlens:incident:scanner:get-status") {
            throw new Error("Simulated transient IPC failure in negative audit probe");
          }
          return window.__origIpcInvoke.call(ipcRenderer, channel, ...args);
        };
      });

      await collectDetailedTelemetry("negative_ipc_probe");
    } catch (err) {
      if (/TELEMETRY_IPC_FAILURE/.test(err.message)) {
        probeIpcErrorCaught = true;
      }
    } finally {
      await win.evaluate(() => {
        const { ipcRenderer } = require("electron");
        if (window.__origIpcInvoke) {
          ipcRenderer.invoke = window.__origIpcInvoke;
          delete window.__origIpcInvoke;
        }
      });
    }

    if (!probeIpcErrorCaught) {
      throw new Error("FAIL: Negative IPC probe did not reject fail-closed when IPC returned an error!");
    }
    testReport.negativeTelemetryTests.ipcFailureInjection = { executed: true, verdict: "PASS" };
    console.log("    ✓ Negative IPC Failure Probe confirmed FAIL-CLOSED (telemetry collection strictly rejected on IPC error).");

    // R1-02: Obtain stabilized baseline AFTER full UI initialization
    console.log("\n==> [4/7] Sampling Stabilized Multi-Process Baseline Telemetry...");
    const baseline = await collectDetailedTelemetry("baseline");
    testReport.telemetry.baseline = baseline;
    console.log("    ✓ Main Process RSS:", baseline.processBreakdown.main.workingSetMb, "MB | Heap:", baseline.mainProcessMemory.heapUsedMb, "MB");
    console.log("    ✓ Renderer Process RSS:", baseline.processBreakdown.renderer.workingSetMb, "MB");
    console.log("    ✓ GPU Process RSS:", baseline.processBreakdown.gpu.workingSetMb, "MB");
    console.log("    ✓ Utility Process RSS:", baseline.processBreakdown.utility.workingSetMb, "MB");
    console.log("    ✓ Total Combined RSS:", baseline.processBreakdown.totalCombinedWorkingSetMb, "MB");

    // =========================================================================
    // EXECUTE 3 ACCELERATED STRESS BLOCKS (20 CYCLES EACH = 60 TOTAL)
    // =========================================================================
    console.log("\n==> [5/7] Executing 3 Accelerated Stress Blocks (20 Cycles each = 60 Total)...");

    const executeStressBlock = async (blockNumber, startCycle, endCycle, screenshotName) => {
      console.log(`\n  --- Starting Block ${blockNumber} (Cycles ${startCycle} to ${endCycle}) ---`);

      for (let cycle = startCycle; cycle <= endCycle; cycle++) {
        const targetNamespace = cycle % 2 === 0 ? "production" : "monitoring";
        // Alternate between rich fault scenarios
        const targetScenario = ["crash_loop_backoff", "oom_killed", "image_pull_backoff", "all_clean"][cycle % 4];

        // 1. Rapid cluster/namespace switch in renderer store and scanner scope
        const switchSuccess = await win.evaluate(async ({ ns }) => {
          const { ipcRenderer } = require("electron");
          const di = window.__LENS_RENDERER_DI__;
          if (di) {
            const store = di.injectById("incident-store");
            if (store && typeof store.setActiveClusterContext === "function") {
              store.setActiveClusterContext("openlens-demo-cluster-local", ns);
            }
          }
          const status = await ipcRenderer.invoke("openlens:incident:scanner:start", {
            scope: {
              clusterId: "openlens-demo-cluster-local",
              namespace: ns,
            },
          });
          return status.isEnabled && status.scope?.namespace === ns;
        }, { ns: targetNamespace });

        if (!switchSuccess) {
          testReport.stressCycles.failedCycles++;
          throw new Error(`FAIL: Context switch to namespace ${targetNamespace} failed in cycle ${cycle}`);
        }
        testReport.stressCycles.contextSwitchesExecuted++;

        // 2. Real scan execution from synthetic snapshot via authentic IPC
        const scanResult = await win.evaluate(async ({ ns, scenario, cycleNum }) => {
          const { ipcRenderer } = require("electron");

          const pods = [];
          if (scenario === "crash_loop_backoff") {
            pods.push({
              apiVersion: "v1",
              kind: "Pod",
              metadata: { name: `stress-crash-${cycleNum}`, namespace: ns, uid: `uid-crash-${cycleNum}` },
              status: {
                phase: "Running",
                containerStatuses: [{
                  name: "app",
                  restartCount: cycleNum + 3,
                  state: { waiting: { reason: "CrashLoopBackOff", message: "Back-off restarting failed container" } },
                }],
              },
            });
          } else if (scenario === "oom_killed") {
            pods.push({
              apiVersion: "v1",
              kind: "Pod",
              metadata: { name: `stress-oom-${cycleNum}`, namespace: ns, uid: `uid-oom-${cycleNum}` },
              status: {
                phase: "Running",
                containerStatuses: [{
                  name: "worker",
                  restartCount: cycleNum + 1,
                  state: { terminated: { reason: "OOMKilled", exitCode: 137, finishedAt: new Date().toISOString() } },
                  lastState: { terminated: { reason: "OOMKilled", exitCode: 137, finishedAt: new Date().toISOString() } },
                }],
              },
            });
          } else if (scenario === "image_pull_backoff") {
            pods.push({
              apiVersion: "v1",
              kind: "Pod",
              metadata: { name: `stress-image-${cycleNum}`, namespace: ns, uid: `uid-image-${cycleNum}` },
              status: {
                phase: "Pending",
                containerStatuses: [{
                  name: "web",
                  restartCount: 0,
                  state: { waiting: { reason: "ImagePullBackOff", message: "Back-off pulling image registry.example.invalid/app:v1" } },
                }],
              },
            });
          }

          const snapshot = {
            pods,
            workloads: [],
            events: [],
          };

          const signals = await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", snapshot);
          const status = await ipcRenderer.invoke("openlens:incident:scanner:get-status");

          return {
            status: "OK",
            signalCount: signals ? signals.length : 0,
            activeNamespace: status.scope?.namespace,
            scenario,
          };
        }, { ns: targetNamespace, scenario: targetScenario, cycleNum: cycle });

        // R1-01: Verify scan results. Fail immediately on silent errors or unexpected empty results.
        if (scanResult.status !== "OK") {
          testReport.stressCycles.failedCycles++;
          throw new Error(`FAIL: Scan failed on cycle ${cycle}: ${JSON.stringify(scanResult)}`);
        }
        if (targetScenario !== "all_clean" && scanResult.signalCount === 0) {
          testReport.stressCycles.failedCycles++;
          throw new Error(`FAIL: Scan for scenario '${targetScenario}' produced zero signals on cycle ${cycle}!`);
        }

        testReport.stressCycles.incidentScansExecuted++;
        testReport.stressCycles.totalCompleted = cycle;
        await sleep(100);
      }

      // Update UI visual state distinctively per block
      if (blockNumber === 1) {
        // Refresh store so newly ingested incidents appear in DOM
        await win.evaluate(async () => {
          const di = window.__LENS_RENDERER_DI__;
          if (di) {
            const store = di.injectById("incident-store");
            if (store) await store.loadIncidents();
          }
        });
        await sleep(1500);
      } else if (blockNumber === 2) {
        // Open the Incident Workbench side panel on the active incident
        await win.evaluate(async () => {
          const di = window.__LENS_RENDERER_DI__;
          if (di) {
            const store = di.injectById("incident-store");
            if (store) {
              await store.loadIncidents();
              if (store.incidents.length > 0) {
                store.activeIncidentId = store.incidents[0].id;
              }
            }
          }
        });
        await sleep(500);
        const openBtn = win.locator('[data-testid^="open-workbench-btn-"]').first();
        if ((await openBtn.count()) > 0) {
          await openBtn.click();
        }
        await sleep(1500);
      } else if (blockNumber === 3) {
        // Ensure workbench is open and switch to the Evidence tab
        const tabEvidence = win.locator('[data-testid="tab-evidence"]');
        if ((await tabEvidence.count()) > 0) {
          await tabEvidence.click({ force: true });
        }
        await sleep(1500);
      }

      // Capture screenshot at end of block
      const shotPath = path.join(EVIDENCE_DIR, `${screenshotName}.png`);
      await win.screenshot({ path: shotPath });
      testReport.screenshots[screenshotName] = {
        path: shotPath,
        md5: computeFileMd5(shotPath),
      };
      console.log(`    ✓ Block ${blockNumber} completed. Screenshot saved (MD5: ${testReport.screenshots[screenshotName].md5})`);

      // Short cooldown and metric sampling
      console.log(`    * Pausing 1.5s cooldown after Block ${blockNumber}...`);
      await sleep(1500);
      const blockMetrics = await collectDetailedTelemetry(`block_${blockNumber}_post`);
      console.log(`    [Post-Block ${blockNumber}] Main RSS: ${blockMetrics.processBreakdown.main.workingSetMb} MB | Renderer RSS: ${blockMetrics.processBreakdown.renderer.workingSetMb} MB | Total Combined: ${blockMetrics.processBreakdown.totalCombinedWorkingSetMb} MB`);
      return blockMetrics;
    };

    // Block 1 (Cycles 1-20)
    testReport.telemetry.block1Post = await executeStressBlock(1, 1, 20, "02_block1_active_stress");

    // Block 2 (Cycles 21-40)
    testReport.telemetry.block2Post = await executeStressBlock(2, 21, 40, "03_block2_active_stress");

    // Block 3 (Cycles 41-60)
    testReport.telemetry.block3Post = await executeStressBlock(3, 41, 60, "04_block3_active_stress");

    // Cleanly stop the scanner and verify zero watchers
    console.log("\n==> [6/7] Stopping Scanner & Entering Final Cooldown (4.0s)...");
    const finalScannerStatus = await win.evaluate(async () => {
      const { ipcRenderer } = require("electron");
      await ipcRenderer.invoke("openlens:incident:scanner:stop");
      return ipcRenderer.invoke("openlens:incident:scanner:get-status");
    });

    if (finalScannerStatus.isEnabled || finalScannerStatus.activeWatchersCount !== 0) {
      throw new Error(`FAIL: Scanner did not stop cleanly. isEnabled: ${finalScannerStatus.isEnabled}, activeWatchers: ${finalScannerStatus.activeWatchersCount}`);
    }
    console.log("    ✓ Scanner stopped cleanly. Active watchers count: 0");

    // In resting state: switch workbench tab to timeline and filter search input for visually distinct resting state
    const tabTimeline = win.locator('[data-testid="tab-timeline"]');
    if ((await tabTimeline.count()) > 0) {
      await tabTimeline.click({ force: true });
    }
    const searchInput = win.locator('[data-testid="incident-search-input"]');
    if ((await searchInput.count()) > 0) {
      await searchInput.fill("CrashLoopBackOff");
    }
    await sleep(4000);

    // Final Resting Telemetry
    const resting = await collectDetailedTelemetry("final_resting");
    testReport.telemetry.resting = resting;

    // Capture final resting screenshot
    const shotResting = path.join(EVIDENCE_DIR, "05_final_post_stress_resting_state.png");
    await win.screenshot({ path: shotResting });
    testReport.screenshots["05_final_post_stress_resting_state"] = {
      path: shotResting,
      md5: computeFileMd5(shotResting),
    };
    console.log("    ✓ Final resting screenshot saved (MD5:", testReport.screenshots["05_final_post_stress_resting_state"].md5, ")");

    // Compute deltas against baseline
    const deltas = {
      mainRssMb: Number((resting.processBreakdown.main.workingSetMb - baseline.processBreakdown.main.workingSetMb).toFixed(2)),
      mainHeapMb: Number((resting.mainProcessMemory.heapUsedMb - baseline.mainProcessMemory.heapUsedMb).toFixed(2)),
      rendererRssMb: Number((resting.processBreakdown.renderer.workingSetMb - baseline.processBreakdown.renderer.workingSetMb).toFixed(2)),
      gpuRssMb: Number((resting.processBreakdown.gpu.workingSetMb - baseline.processBreakdown.gpu.workingSetMb).toFixed(2)),
      utilityRssMb: Number((resting.processBreakdown.utility.workingSetMb - baseline.processBreakdown.utility.workingSetMb).toFixed(2)),
      totalCombinedRssMb: Number((resting.processBreakdown.totalCombinedWorkingSetMb - baseline.processBreakdown.totalCombinedWorkingSetMb).toFixed(2)),
      maxRestingCpuPercent: Math.max(
        resting.processBreakdown.main.cpuPercent,
        resting.processBreakdown.renderer.cpuPercent,
        resting.processBreakdown.gpu.cpuPercent,
        resting.processBreakdown.utility.cpuPercent,
      ),
      activeWatchersCount: resting.activeWatchers,
    };
    testReport.telemetry.deltasVsBaseline = deltas;

    console.log("\n==========================================================================");
    console.log("   Multi-Process Memory Progression Across Blocks:                        ");
    console.log("==========================================================================");
    console.log(`   Baseline:      Main ${baseline.processBreakdown.main.workingSetMb} MB | Renderer ${baseline.processBreakdown.renderer.workingSetMb} MB | Total ${baseline.processBreakdown.totalCombinedWorkingSetMb} MB`);
    console.log(`   Post-Block 1:  Main ${testReport.telemetry.block1Post.processBreakdown.main.workingSetMb} MB | Renderer ${testReport.telemetry.block1Post.processBreakdown.renderer.workingSetMb} MB | Total ${testReport.telemetry.block1Post.processBreakdown.totalCombinedWorkingSetMb} MB`);
    console.log(`   Post-Block 2:  Main ${testReport.telemetry.block2Post.processBreakdown.main.workingSetMb} MB | Renderer ${testReport.telemetry.block2Post.processBreakdown.renderer.workingSetMb} MB | Total ${testReport.telemetry.block2Post.processBreakdown.totalCombinedWorkingSetMb} MB`);
    console.log(`   Post-Block 3:  Main ${testReport.telemetry.block3Post.processBreakdown.main.workingSetMb} MB | Renderer ${testReport.telemetry.block3Post.processBreakdown.renderer.workingSetMb} MB | Total ${testReport.telemetry.block3Post.processBreakdown.totalCombinedWorkingSetMb} MB`);
    console.log(`   Final Resting: Main ${resting.processBreakdown.main.workingSetMb} MB | Renderer ${resting.processBreakdown.renderer.workingSetMb} MB | Total ${resting.processBreakdown.totalCombinedWorkingSetMb} MB`);
    console.log("--------------------------------------------------------------------------");
    console.log(`   Deltas vs Baseline: Main RSS: ${deltas.mainRssMb} MB | Heap: ${deltas.mainHeapMb} MB | Renderer: ${deltas.rendererRssMb} MB | Total Combined: ${deltas.totalCombinedRssMb} MB`);
    console.log(`   Max Resting CPU: ${deltas.maxRestingCpuPercent.toFixed(2)}% | Active Watchers: ${deltas.activeWatchersCount}`);

    // =========================================================================
    // VERIFY CRITICAL GATES & CRITERIA (R1-03)
    // =========================================================================
    console.log("\n==> [7/7] Validating Release Candidate Quality Gates...");

    const gate1_completedAllCycles = testReport.stressCycles.totalCompleted === 60 && testReport.stressCycles.failedCycles === 0;
    const gate2_confirmedRealScans = testReport.stressCycles.incidentScansExecuted === 60;
    const gate3_confirmedSwitches = testReport.stressCycles.contextSwitchesExecuted === 60;
    const gate4_zeroWatchers = resting.activeWatchers === 0;
    const gate5_restingCpuLow = deltas.maxRestingCpuPercent < 15.0;
    const gate6_negativeProbeBlocked = testReport.negativeNetworkTest.blockedRequestsCount > 0 && testReport.negativeNetworkTest.unauthorizedLeaksCount === 0;
    const gate7_distinctScreenshots = new Set(Object.values(testReport.screenshots).map(s => s.md5)).size === 5;
    const gate8_negativeTelemetryBlocked = testReport.negativeTelemetryTests?.processMetricsValidation?.verdict === "PASS" &&
      testReport.negativeTelemetryTests?.ipcFailureInjection?.verdict === "PASS";

    console.log("    * Gate 1 - Full 60/60 Cycles Completed Cleanly:", gate1_completedAllCycles ? "PASS" : "FAIL");
    console.log("    * Gate 2 - Confirmed 60 Real Incident Scans Executed:", gate2_confirmedRealScans ? "PASS" : "FAIL");
    console.log("    * Gate 3 - Confirmed 60 Real Context Switches Executed:", gate3_confirmedSwitches ? "PASS" : "FAIL");
    console.log("    * Gate 4 - Zero Leaked Watchers (activeWatchers === 0):", gate4_zeroWatchers ? "PASS" : "FAIL");
    console.log("    * Gate 5 - Idle Resting CPU (< 15.0%):", gate5_restingCpuLow ? "PASS" : "FAIL", `(${deltas.maxRestingCpuPercent}%)`);
    console.log("    * Gate 6 - Strict Fail-Closed Network Policy (blocked > 0, leaks == 0):", gate6_negativeProbeBlocked ? "PASS" : "FAIL");
    console.log("    * Gate 7 - Five Verifiably Distinct Screenshot Hashes (5/5 unique):", gate7_distinctScreenshots ? "PASS" : "FAIL");
    console.log("    * Gate 8 - Strict Telemetry Validation & Negative IPC Probe:", gate8_negativeTelemetryBlocked ? "PASS" : "FAIL");

    const allGatesPassed = gate1_completedAllCycles &&
      gate2_confirmedRealScans &&
      gate3_confirmedSwitches &&
      gate4_zeroWatchers &&
      gate5_restingCpuLow &&
      gate6_negativeProbeBlocked &&
      gate7_distinctScreenshots &&
      gate8_negativeTelemetryBlocked;

    if (!allGatesPassed) {
      testReport.verdict = "FAIL";
      throw new Error(`FINAL-04-R2 Gate Failure: ${JSON.stringify({
        gate1_completedAllCycles,
        gate2_confirmedRealScans,
        gate3_confirmedSwitches,
        gate4_zeroWatchers,
        gate5_restingCpuLow,
        gate6_negativeProbeBlocked,
        gate7_distinctScreenshots,
        gate8_negativeTelemetryBlocked,
      })}`);
    }

    testReport.verdict = "PASS";
    testReport.completedAt = new Date().toISOString();

    const reportPath = path.join(EVIDENCE_DIR, "stress-metrics.json");
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2), "utf-8");
    console.log("    ✓ Detailed JSON report written to:", reportPath);

    console.log("\n==========================================================================");
    console.log("   NovaKube H8.8 FINAL-04-R2: VERDICT -> PASS (All 8 Gates Met)           ");
    console.log("==========================================================================");
  } finally {
    try {
      await app.close();
    } catch {
      // Ignore cleanup error
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAcceleratedStressSuite().catch((err) => {
    console.error("\n❌ FINAL-04-R2 Stress Runner Error:", err);
    process.exit(1);
  });
}
