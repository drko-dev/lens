/**
 * OpenLens DevOps Revival — R4-01: Reproducible Baseline Performance Benchmark
 *
 * Measures:
 * 1. Cold start time (clean user data profile).
 * 2. Warm start time (re-launch on established user data profile).
 * 3. Time to usable UI (DOM ready / renderer interactive).
 * 4. Main process RSS and JS Heap.
 * 5. Renderer process RSS and JS Heap.
 * 6. Auxiliary processes and CPU metrics via app.getAppMetrics().
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { _electron } = require("playwright");

const projectRoot = path.resolve(__dirname, "../../..");
const outputDir = process.env.OPENLENS_OUTPUT_DIR || path.join(projectRoot, "open-lens/dist-gemini-stage");
const defaultExe = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const fallbackExe = path.join(projectRoot, "open-lens/dist-r4-stage/r4-02-validation-20261020-workspace-tabs-final/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const exe = process.env.OPENLENS_EXECUTABLE_PATH || (fs.existsSync(defaultExe) ? defaultExe : fallbackExe);

if (!fs.existsSync(exe)) {
  console.error("Executable does not exist at:", exe);
  process.exit(1);
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
}

async function measureStartup(isCold, profileDir) {
  const homeDir = path.join(profileDir, "home");
  const appData = path.join(profileDir, "appdata");
  if (isCold) {
    fs.rmSync(homeDir, { recursive: true, force: true });
    fs.rmSync(appData, { recursive: true, force: true });
  }
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });

  const env = {
    ...process.env,
    HOME: homeDir,
    CICD: appData,
    KUBECONFIG: "/dev/null",
  };

  const t0 = Date.now();
  const app = await _electron.launch({
    executablePath: exe,
    args: ["--integration-testing"],
    env,
    timeout: 60000,
  });

  const launchDurationMs = Date.now() - t0;

  // Wait for main renderer window
  let mainPage = null;
  const startedWaiting = Date.now();
  while (Date.now() - startedWaiting < 30000) {
    const windows = app.windows();
    const candidate = windows.find(w => w.url().startsWith("https://lens.app") || w.url().includes("index.html"));
    if (candidate) {
      mainPage = candidate;
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  let timeToUsableUiMs = Date.now() - t0;
  if (mainPage) {
    await mainPage.locator("body").waitFor({ state: "visible", timeout: 30000 });
    timeToUsableUiMs = Date.now() - t0;
  }

  // Sample process metrics
  const mainMetrics = await app.evaluate(({ app }) => {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      appMetrics: app.getAppMetrics().map(m => ({
        pid: m.pid,
        type: m.type,
        memory: m.memory,
        cpu: m.cpu,
      })),
    };
  });

  let rendererHeap = null;
  if (mainPage) {
    rendererHeap = await mainPage.evaluate(() => {
      return performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null;
    }).catch(() => null);
  }

  await app.close().catch(() => {});

  return {
    isCold,
    launchDurationMs,
    timeToUsableUiMs,
    mainRssMB: Number((mainMetrics.memory.rss / (1024 * 1024)).toFixed(2)),
    mainHeapUsedMB: Number((mainMetrics.memory.heapUsed / (1024 * 1024)).toFixed(2)),
    mainHeapTotalMB: Number((mainMetrics.memory.heapTotal / (1024 * 1024)).toFixed(2)),
    rendererHeapUsedMB: rendererHeap ? Number((rendererHeap.usedJSHeapSize / (1024 * 1024)).toFixed(2)) : null,
    processCount: mainMetrics.appMetrics.length,
    processDetails: mainMetrics.appMetrics,
  };
}

async function runBenchmark() {
  console.log("==================================================");
  console.log("R4-01 BASELINE PERFORMANCE BENCHMARK");
  console.log("Executable:", exe);
  console.log("Node:", process.version);
  console.log("Arch:", process.arch);
  console.log("OS:", os.type(), os.release());
  console.log("==================================================");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-baseline-bench-"));
  const coldRuns = [];
  const warmRuns = [];

  try {
    console.log("\n[Warmup Run] Running one warmup cycle...");
    await measureStartup(true, path.join(tempRoot, "warmup"));
    console.log("[Warmup Run] Completed.");

    console.log("\n[Cold Start Benchmark] Measuring 3 cold starts...");
    for (let i = 1; i <= 3; i++) {
      console.log(`  Cold Start ${i}/3...`);
      const sample = await measureStartup(true, path.join(tempRoot, `cold-${i}`));
      coldRuns.push(sample);
      console.log(`    Launch: ${sample.launchDurationMs} ms, Usable UI: ${sample.timeToUsableUiMs} ms, Main RSS: ${sample.mainRssMB} MB`);
    }

    console.log("\n[Warm Start Benchmark] Measuring 3 warm starts on same profile...");
    const warmProfile = path.join(tempRoot, "warm-profile");
    // Initial run to initialize profile
    await measureStartup(true, warmProfile);
    for (let i = 1; i <= 3; i++) {
      console.log(`  Warm Start ${i}/3...`);
      const sample = await measureStartup(false, warmProfile);
      warmRuns.push(sample);
      console.log(`    Launch: ${sample.launchDurationMs} ms, Usable UI: ${sample.timeToUsableUiMs} ms, Main RSS: ${sample.mainRssMB} MB`);
    }

    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: process.arch,
        cpuCount: os.cpus().length,
        totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
        executable: exe,
      },
      coldStart: {
        samples: coldRuns.length,
        launchMs_p50: percentile(coldRuns.map(r => r.launchDurationMs), 0.5),
        launchMs_p95: percentile(coldRuns.map(r => r.launchDurationMs), 0.95),
        usableUiMs_p50: percentile(coldRuns.map(r => r.timeToUsableUiMs), 0.5),
        usableUiMs_p95: percentile(coldRuns.map(r => r.timeToUsableUiMs), 0.95),
        mainRssMB_p50: percentile(coldRuns.map(r => r.mainRssMB), 0.5),
        mainHeapUsedMB_p50: percentile(coldRuns.map(r => r.mainHeapUsedMB), 0.5),
        rawSamples: coldRuns,
      },
      warmStart: {
        samples: warmRuns.length,
        launchMs_p50: percentile(warmRuns.map(r => r.launchDurationMs), 0.5),
        launchMs_p95: percentile(warmRuns.map(r => r.launchDurationMs), 0.95),
        usableUiMs_p50: percentile(warmRuns.map(r => r.timeToUsableUiMs), 0.5),
        usableUiMs_p95: percentile(warmRuns.map(r => r.timeToUsableUiMs), 0.95),
        mainRssMB_p50: percentile(warmRuns.map(r => r.mainRssMB), 0.5),
        mainHeapUsedMB_p50: percentile(warmRuns.map(r => r.mainHeapUsedMB), 0.5),
        rawSamples: warmRuns,
      },
    };

    console.log("\n==================================================");
    console.log("BENCHMARK SUMMARY RESULTS:");
    console.log(`Cold Start UI p50: ${report.coldStart.usableUiMs_p50} ms (p95: ${report.coldStart.usableUiMs_p95} ms)`);
    console.log(`Warm Start UI p50: ${report.warmStart.usableUiMs_p50} ms (p95: ${report.warmStart.usableUiMs_p95} ms)`);
    console.log(`Main RSS p50:      ${report.warmStart.mainRssMB_p50} MB`);
    console.log(`Main Heap p50:     ${report.warmStart.mainHeapUsedMB_p50} MB`);
    console.log("==================================================");

    const logDir = path.join(projectRoot, "docs/revival/logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "R4_01_BASELINE_METRICS.json");
    fs.writeFileSync(logFile, JSON.stringify(report, null, 2));
    console.log(`Saved benchmark report to: ${logFile}`);

  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runBenchmark().catch(err => {
  console.error("FATAL in benchmark:", err);
  process.exit(1);
});
