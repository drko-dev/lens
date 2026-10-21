const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));
const outputDir = process.env.OPENLENS_R4_02_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r4-stage/r4-02-validation-20261020-workspace-tabs-final");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const screenshotDir = path.join(projectRoot, "docs/revival/screenshots");
const screenshotPrefix = `r4-02-workspace-tabs-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const navigationMethods = [];

const environments = ["development", "staging", "production", "development", "staging", "development", "testing", "local", "custom", "none"];
const colors = ["#10B981", "#F59E0B", "#EF4444", "#10B981", "#F59E0B", "#10B981", "#8B5CF6", "#06B6D4", "#3D90CE", "#64748B"];
const aliases = ["Synthetic DEV", "Synthetic STG", "Synthetic PROD", "Synthetic 04", "Synthetic 05", "Synthetic 06", "Synthetic 07", "Synthetic 08", "Synthetic 09", "Synthetic 10"];
const contexts = aliases.map((alias, index) => ({
  name: `r4-02-${index + 1}`,
  alias,
  environment: environments[index],
  color: colors[index],
  uid: `r4-02-pod-uid-${index + 1}`,
  image: `registry.synthetic.invalid/api:${index + 1}`,
}));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createLocalApiFixture(context) {
  const requests = [];
  const rejectedWrites = [];
  const activeResponses = new Set();
  let activeWatches = 0;

  const pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "api", namespace: "default", uid: context.uid, resourceVersion: "1" },
    spec: { containers: [{ name: "api", image: context.image }] },
    status: { phase: "Running", containerStatuses: [{ name: "api", image: context.image, ready: true, restartCount: 0 }] },
  };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const isWatch = request.method === "GET" && requestUrl.searchParams.get("watch") === "true";
    requests.push({ method: request.method, path: requestUrl.pathname, watch: isWatch });

    if (request.method === "POST" && /selfsubject(access|rules)review/i.test(requestUrl.pathname)) {
      return json(response, 200, {
        apiVersion: "authorization.k8s.io/v1",
        kind: requestUrl.pathname.toLowerCase().includes("rules") ? "SelfSubjectRulesReview" : "SelfSubjectAccessReview",
        status: { allowed: true, resourceRules: [], nonResourceRules: [], incomplete: false },
      });
    }

    if (request.method !== "GET") {
      rejectedWrites.push({ method: request.method, path: requestUrl.pathname });
      return json(response, 405, { kind: "Status", status: "Failure", reason: "MethodNotAllowed", code: 405 });
    }

    if (isWatch) {
      activeWatches += 1;
      activeResponses.add(response);
      response.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      response.write(`${JSON.stringify({ type: "ADDED", object: pod })}\n`);
      response.on("close", () => {
        activeWatches -= 1;
        activeResponses.delete(response);
      });
      return;
    }

    switch (requestUrl.pathname) {
      case "/version":
        return json(response, 200, {
          major: "1", minor: "31", gitVersion: "v1.31.0", gitCommit: "synthetic-r4-02",
          gitTreeState: "clean", buildDate: "2026-10-20T00:00:00Z", goVersion: "go1.23.0",
          compiler: "gc", platform: "darwin/arm64",
        });
      case "/api":
        return json(response, 200, { kind: "APIVersions", versions: ["v1"], serverAddressByClientCIDRs: [] });
      case "/apis":
        return json(response, 200, { kind: "APIGroupList", groups: [] });
      case "/api/v1":
        return json(response, 200, {
          kind: "APIResourceList", apiVersion: "v1", groupVersion: "v1",
          resources: [
            { name: "namespaces", singularName: "namespace", namespaced: false, kind: "Namespace", verbs: ["get", "list", "watch"] },
            { name: "pods", singularName: "pod", namespaced: true, kind: "Pod", verbs: ["get", "list", "watch"] },
          ],
        });
      case "/api/v1/namespaces":
        return json(response, 200, {
          apiVersion: "v1", kind: "NamespaceList", metadata: { resourceVersion: "1" },
          items: [{ apiVersion: "v1", kind: "Namespace", metadata: { name: "default", uid: `ns-${context.name}` }, status: { phase: "Active" } }],
        });
      case "/api/v1/namespaces/default/pods":
      case "/api/v1/pods":
        return json(response, 200, { apiVersion: "v1", kind: "PodList", metadata: { resourceVersion: "1" }, items: [pod] });
      case "/api/v1/namespaces/default/pods/api":
        return json(response, 200, pod);
      case "/healthz":
        response.writeHead(200, { "content-type": "text/plain" });
        return response.end("ok");
      default:
        return json(response, 404, { kind: "Status", status: "Failure", reason: "NotFound", code: 404 });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve({
        context,
        server,
        endpoint: `http://127.0.0.1:${address.port}`,
        requests,
        rejectedWrites,
        activeResponses,
        get activeWatches() { return activeWatches; },
        close: () => new Promise((done) => {
          for (const response of activeResponses) response.end();
          server.close(() => done());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

function createProfile(root, label, fixtures) {
  const home = path.join(root, `${label}-home`);
  const appData = path.join(root, `${label}-appdata`);
  const kubeConfigPath = path.join(home, ".kube", "config");
  const userData = path.join(appData, "OpenLens DevOps");
  const kubeConfig = [
    "apiVersion: v1",
    "kind: Config",
    `current-context: ${fixtures[0].name}`,
    "clusters:",
    ...fixtures.map((fixture, index) => `- name: cluster-${index + 1}\n  cluster:\n    server: ${fixture.endpoint}`),
    "contexts:",
    ...fixtures.map((fixture, index) => `- name: ${fixture.name}\n  context:\n    cluster: cluster-${index + 1}\n    user: synthetic-user-${index + 1}\n    namespace: default`),
    "users:",
    ...fixtures.map((fixture, index) => `- name: synthetic-user-${index + 1}\n  user: {}`),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(kubeConfigPath), { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(kubeConfigPath, kubeConfig, { mode: 0o600 });

  const clusters = fixtures.map((fixture) => ({
    id: crypto.createHash("md5").update(`${kubeConfigPath}:${fixture.name}`).digest("hex"),
    kubeConfigPath,
    contextName: fixture.name,
    preferences: {
      clusterAlias: fixture.alias,
      clusterEnvironment: fixture.environment,
      clusterColor: fixture.color,
    },
  }));

  fs.writeFileSync(path.join(userData, "lens-cluster-store.json"), JSON.stringify({
    clusters,
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  return { home, appData, kubeConfigPath, clusters };
}

function appEnvironment(profile, workspaceTabs) {
  return {
    ...process.env,
    HOME: profile.home,
    CICD: profile.appData,
    KUBECONFIG: profile.kubeConfigPath,
    OPENLENS_WORKSPACE_TABS: workspaceTabs ? "true" : "false",
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

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Timed out waiting for the packaged app's main renderer");
}

async function openCatalogFromWelcome(page, fixtures) {
  await page.getByText("Browse Clusters in Catalog", { exact: true }).click({ timeout: 20_000 });
  await page.locator('[data-testid="catalog-list-for-Clusters"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText(fixtures[0].alias, { exact: true }).waitFor({ state: "visible", timeout: 30_000 });
}

async function returnToCatalog(page) {
  const previousUrl = page.url();
  await page.getByTestId("history-back").click();
  await page.waitForTimeout(200);

  if (/\/catalog(?:\/|[?#]|$)/i.test(page.url())) {
    navigationMethods.push("history-back");
  } else {
    await page.getByText("view_list", { exact: true }).first().click({ timeout: 10_000 });
    await page.waitForURL(/\/catalog(?:\/entity\.k8slens\.dev\/KubernetesCluster)?(?:[?#].*)?$/i, { timeout: 20_000 });
    navigationMethods.push(`catalog sidebar after history-back from ${previousUrl}`);
  }
}

async function openFromCatalog(page, fixture, clusterId) {
  await page.getByText(fixture.alias, { exact: true }).click({ timeout: 20_000 });
  await page.waitForURL(new RegExp(`/cluster/${clusterId}(?:[?#].*)?$`), { timeout: 20_000 });
  await page.locator(`#cluster-frame-${clusterId}`).waitFor({ state: "attached", timeout: 20_000 });
}

async function expectActiveCluster(page, fixture, clusterId) {
  const tab = page.getByTestId(`workspace-tab-${clusterId}`);
  await tab.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForFunction((id) => document.querySelector(`[data-testid="workspace-tab-${id}"]`)?.getAttribute("aria-selected") === "true", clusterId);
  await page.waitForFunction((id) => {
    const frame = document.querySelector(`#cluster-frame-${id}`);

    return frame && !frame.classList.contains("hidden");
  }, clusterId, { timeout: 30_000 });

  const frame = page.locator(`#cluster-frame-${clusterId}`);
  const frameDetails = await frame.evaluate((element) => ({
    id: element.id,
    name: element.getAttribute("name"),
    role: element.getAttribute("role"),
    label: element.getAttribute("aria-label"),
  }));
  const badge = await page.getByTestId(`tab-env-badge-${clusterId}`).innerText();
  const visibleFrameIds = await page.locator('#lens-views iframe[id^="cluster-frame-"]:not(.hidden)').evaluateAll((frames) => frames.map((frame) => frame.id));

  assert(await tab.getAttribute("aria-controls") === frameDetails.id, "aria-controls must match the cluster frame id");
  assert(frameDetails.id === `cluster-frame-${clusterId}`, "tab must retain its immutable clusterId");
  assert(frameDetails.name === fixture.name, `frame context mismatch for ${fixture.name}`);
  assert(frameDetails.role === "tabpanel", `frame ${fixture.name} must expose role=tabpanel`);
  assert(JSON.stringify(visibleFrameIds) === JSON.stringify([`cluster-frame-${clusterId}`]), "only the selected cluster iframe may be visible");
  assert(badge.trim() === ({ development: "DEV", staging: "STG", production: "PROD", testing: "TEST", local: "LOCAL", custom: "CUSTOM", none: "NONE" }[fixture.environment]), `unexpected environment badge for ${fixture.name}: ${badge}`);

  return { frameDetails, badge: badge.trim() };
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))].toFixed(2));
}

async function takePerformanceSample(app, page, tabCount, fixtures) {
  const before = await app.evaluate(({ app }) => ({
    timestamp: Date.now(),
    mainMemory: process.memoryUsage(),
    mainCpu: process.cpuUsage(),
    appMetrics: app.getAppMetrics().map(({ pid, type, memory, cpu }) => ({
      pid,
      type,
      workingSetSize: memory?.workingSetSize,
      cumulativeCPUUsage: cpu?.cumulativeCPUUsage,
    })),
  }));
  await page.waitForTimeout(1_250);
  const after = await app.evaluate(({ app }) => ({
    timestamp: Date.now(),
    mainMemory: process.memoryUsage(),
    mainCpu: process.cpuUsage(),
    appMetrics: app.getAppMetrics().map(({ pid, type, memory, cpu }) => ({
      pid,
      type,
      workingSetSize: memory?.workingSetSize,
      cumulativeCPUUsage: cpu?.cumulativeCPUUsage,
    })),
  }));
  const renderer = await page.evaluate(() => ({
    heapUsed: performance.memory?.usedJSHeapSize ?? null,
    heapTotal: performance.memory?.totalJSHeapSize ?? null,
  }));
  const intervalMs = Math.max(1, after.timestamp - before.timestamp);
  const mainCpuMicros = (after.mainCpu.user - before.mainCpu.user) + (after.mainCpu.system - before.mainCpu.system);
  const beforeByPid = new Map(before.appMetrics.map((metric) => [metric.pid, metric]));
  const appCpuMicros = after.appMetrics.reduce((total, metric) => {
    const start = beforeByPid.get(metric.pid);
    return total + (start && Number.isFinite(metric.cumulativeCPUUsage) && Number.isFinite(start.cumulativeCPUUsage)
      ? Math.max(0, metric.cumulativeCPUUsage - start.cumulativeCPUUsage)
      : 0);
  }, 0);
  const frames = await page.locator('#lens-views iframe[id^="cluster-frame-"]').count();

  return {
    tabs: tabCount,
    frames,
    rendererProcesses: after.appMetrics.filter((metric) => metric.type === "Tab").length,
    mainRssMB: Number((after.mainMemory.rss / 1024 / 1024).toFixed(2)),
    appReportedWorkingSetMB: Number((after.appMetrics.reduce((total, metric) => total + (metric.workingSetSize || 0), 0) / 1024).toFixed(2)),
    rendererHeapUsedMB: renderer.heapUsed === null ? null : Number((renderer.heapUsed / 1024 / 1024).toFixed(2)),
    rendererHeapTotalMB: renderer.heapTotal === null ? null : Number((renderer.heapTotal / 1024 / 1024).toFixed(2)),
    mainCpuPercent: Number(((mainCpuMicros / (intervalMs * 1000)) * 100).toFixed(2)),
    appProcessesCpuPercent: appCpuMicros > 0 ? Number(((appCpuMicros / (intervalMs * 1000)) * 100).toFixed(2)) : null,
    activeSyntheticApiWatches: fixtures.reduce((sum, fixture) => sum + fixture.activeWatches, 0),
  };
}

async function measureSwitches(page, fixtures, clusterModels, count) {
  if (count < 2) return { p50Ms: null, p95Ms: null, samples: 0 };

  const candidates = [0, count - 1];
  const latencies = [];

  for (let index = 0; index < 30; index += 1) {
    const targetIndex = candidates[index % candidates.length];
    const fixture = fixtures[targetIndex];
    const clusterId = clusterModels[targetIndex].id;
    const startedAt = Date.now();

    await page.getByTestId(`workspace-tab-${clusterId}`).click();
    await page.waitForURL(new RegExp(`/cluster/${clusterId}(?:[?#].*)?$`), { timeout: 20_000 });
    await page.waitForFunction((id) => document.querySelector(`[data-testid="workspace-tab-${id}"]`)?.getAttribute("aria-selected") === "true", clusterId);
    latencies.push(Date.now() - startedAt);
  }

  return { p50Ms: percentile(latencies, 0.50), p95Ms: percentile(latencies, 0.95), samples: latencies.length };
}

async function closeApp(app) {
  if (app) await app.close().catch(() => {});
}

(async () => {
  if (!fs.existsSync(executable)) {
    throw new Error(`Packaged binary does not exist: ${executable}`);
  }

  fs.mkdirSync(screenshotDir, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r4-02-packaged-"));
  const fixtureServers = [];
  let app;
  let page;
  const report = { executable, screenshots: {}, environments: {}, performance: {} };

  try {
    for (const fixture of contexts) {
      fixture.server = await createLocalApiFixture(fixture);
      fixture.endpoint = fixture.server.endpoint;
      fixtureServers.push(fixture.server);
    }

    const outputHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(path.dirname(executable), "../Resources/app.asar"))).digest("hex");
    const classicProfile = createProfile(tempRoot, "classic", contexts);
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing"],
      env: appEnvironment(classicProfile, false),
      timeout: 90_000,
    });
    page = await waitForMainRenderer(app);
    const runtime = await app.evaluate(({ app }) => ({
      name: app.getName(),
      isPackaged: app.isPackaged,
      userData: app.getPath("userData"),
      arch: process.arch,
    }));
    assert(runtime.isPackaged, "verification must run in a packaged Electron app");
    assert(runtime.arch === "arm64", `expected a macOS ARM64 app, got ${runtime.arch}`);
    report.runtime = runtime;
    report.appAsarSha256 = outputHash;

    await openCatalogFromWelcome(page, contexts);
    const classicDevId = classicProfile.clusters[0].id;
    await openFromCatalog(page, contexts[0], classicDevId);
    const fallback = await page.evaluate(() => ({
      hasWorkspaceBar: Boolean(document.querySelector('[data-testid="workspace-tab-bar"]')),
      hasWorkspaceLayoutOffset: Boolean(document.querySelector("#lens-views")?.classList.contains("with-tab-bar")),
    }));
    assert(!fallback.hasWorkspaceBar && !fallback.hasWorkspaceLayoutOffset, "feature-flag-off must preserve the classic shell");
    const fallbackScreenshot = path.join(screenshotDir, `${screenshotPrefix}-classic-fallback.png`);
    await page.screenshot({ path: fallbackScreenshot });
    report.screenshots.classicFallback = fallbackScreenshot;
    await closeApp(app);
    app = undefined;

    const workspaceProfile = createProfile(tempRoot, "workspace", contexts);
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing"],
      env: appEnvironment(workspaceProfile, true),
      timeout: 90_000,
    });
    page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openCatalogFromWelcome(page, contexts);

    const enabledShell = await page.evaluate(() => ({
      hasWorkspaceBar: Boolean(document.querySelector('[data-testid="workspace-tab-bar"]')),
      hasWorkspaceLayoutOffset: Boolean(document.querySelector("#lens-views")?.classList.contains("with-tab-bar")),
    }));
    assert(enabledShell.hasWorkspaceBar && enabledShell.hasWorkspaceLayoutOffset, "workspace flag must add the tab strip without covering #lens-views");

    const workspaceDevId = workspaceProfile.clusters[0].id;
    const initialOpenStartedAt = Date.now();
    await openFromCatalog(page, contexts[0], workspaceDevId);
    await expectActiveCluster(page, contexts[0], workspaceDevId);
    report.performance.oneTabOpenLatencyMs = Date.now() - initialOpenStartedAt;
    const devScreenshot = path.join(screenshotDir, `${screenshotPrefix}-dev.png`);
    await page.screenshot({ path: devScreenshot });
    report.screenshots.dev = devScreenshot;
    report.environments.dev = { clusterId: workspaceDevId, badge: "DEV", route: page.url() };
    report.performance.oneTab = await takePerformanceSample(app, page, 1, fixtureServers);

    const workspaceStgId = workspaceProfile.clusters[1].id;
    await returnToCatalog(page);
    await page.getByTestId(`icon-for-menu-actions-for-catalog-for-${workspaceStgId}`).click({ timeout: 20_000 });
    await page.getByText("Add to Hotbar", { exact: true }).click({ timeout: 10_000 });
    const hotbarIcon = page.locator(`#hotbarIcon-${workspaceStgId}`);
    await hotbarIcon.waitFor({ state: "visible", timeout: 20_000 });
    await hotbarIcon.click();
    await page.waitForURL(new RegExp(`/cluster/${workspaceStgId}(?:[?#].*)?$`), { timeout: 20_000 });
    await expectActiveCluster(page, contexts[1], workspaceStgId);
    const stgScreenshot = path.join(screenshotDir, `${screenshotPrefix}-stg-hotbar.png`);
    await page.screenshot({ path: stgScreenshot });
    report.screenshots.stgHotbar = stgScreenshot;
    report.environments.stg = { clusterId: workspaceStgId, badge: "STG", navigation: "hotbar", route: page.url() };

    for (let index = 2; index < 5; index += 1) {
      await returnToCatalog(page);
      await openFromCatalog(page, contexts[index], workspaceProfile.clusters[index].id);
    }
    const fiveTabDom = await page.locator('[role="tab"]').count();
    assert(fiveTabDom === 5, `expected 5 real cluster tabs, found ${fiveTabDom}`);
    report.performance.fiveTabs = await takePerformanceSample(app, page, 5, fixtureServers);
    report.performance.fiveTabSwitch = await measureSwitches(page, contexts, workspaceProfile.clusters, 5);

    for (let index = 5; index < 10; index += 1) {
      await returnToCatalog(page);
      await openFromCatalog(page, contexts[index], workspaceProfile.clusters[index].id);
    }
    const tenTabDom = await page.locator('[role="tab"]').count();
    assert(tenTabDom === 10, `expected 10 real cluster tabs, found ${tenTabDom}`);
    report.performance.tenTabs = await takePerformanceSample(app, page, 10, fixtureServers);
    report.performance.tenTabSwitch = await measureSwitches(page, contexts, workspaceProfile.clusters, 10);

    for (const index of [0, 1, 2]) {
      const identity = await expectActiveCluster(page, contexts[index], workspaceProfile.clusters[index].id).catch(async () => {
        await page.getByTestId(`workspace-tab-${workspaceProfile.clusters[index].id}`).click();
        await page.waitForURL(new RegExp(`/cluster/${workspaceProfile.clusters[index].id}(?:[?#].*)?$`), { timeout: 20_000 });
        return expectActiveCluster(page, contexts[index], workspaceProfile.clusters[index].id);
      });
      report.environments[index === 0 ? "dev" : index === 1 ? "stg" : "prod"] = {
        ...report.environments[index === 0 ? "dev" : index === 1 ? "stg" : "prod"],
        badge: identity.badge,
      };
    }

    const prodId = workspaceProfile.clusters[2].id;
    const prodTab = page.getByTestId(`workspace-tab-${prodId}`);
    await prodTab.click();
    await page.waitForURL(new RegExp(`/cluster/${prodId}(?:[?#].*)?$`), { timeout: 20_000 });
    const prodWarning = await prodTab.evaluate((element) => ({
      hazard: element.classList.contains("prod-hazard"),
      label: element.getAttribute("aria-label"),
      badge: element.querySelector(".env-badge")?.textContent?.trim(),
    }));
    assert(prodWarning.hazard && prodWarning.badge === "PROD" && /production warning/i.test(prodWarning.label), "PROD must be visibly and accessibly hazardous");
    report.environments.prod = { clusterId: prodId, badge: prodWarning.badge, hazard: prodWarning.hazard, ariaLabel: prodWarning.label, route: page.url() };
    const prodScreenshot = path.join(screenshotDir, `${screenshotPrefix}-prod-warning.png`);
    await page.screenshot({ path: prodScreenshot });
    report.screenshots.prod = prodScreenshot;

    await page.getByTestId(`workspace-tab-${workspaceProfile.clusters[0].id}`).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForURL(new RegExp(`/cluster/${workspaceProfile.clusters[1].id}(?:[?#].*)?$`), { timeout: 20_000 });
    const keyboardFocus = await page.evaluate(() => ({
      id: document.activeElement?.id,
      selected: document.activeElement?.getAttribute("aria-selected"),
    }));
    assert(keyboardFocus.id === `workspace-tab-${workspaceProfile.clusters[1].id}` && keyboardFocus.selected === "true", "ArrowRight must switch the active route and move focus to STG");
    await expectActiveCluster(page, contexts[1], workspaceProfile.clusters[1].id);

    const frameAudit = await page.locator('#lens-views iframe[id^="cluster-frame-"]').evaluateAll((frames) => frames.map((frame) => ({
      id: frame.id,
      name: frame.getAttribute("name"),
      role: frame.getAttribute("role"),
      hidden: frame.classList.contains("hidden"),
    })));
    assert(frameAudit.length === 10, `expected one ClusterFrameHandler iframe per cluster, got ${frameAudit.length}`);
    assert(new Set(frameAudit.map((frame) => frame.id)).size === 10, "cluster iframes must have unique immutable cluster IDs");
    assert(frameAudit.every((frame) => frame.role === "tabpanel"), "every cluster iframe must be an accessible tabpanel");
    report.frameAudit = frameAudit;

    const preCloseUrl = page.url();
    const closedFrameId = workspaceProfile.clusters[9].id;
    await page.getByTestId(`close-tab-${closedFrameId}`).click();
    assert(await page.locator('[role="tab"]').count() === 9, "closing a tab must remove only that workspace tab");
    assert(await page.locator(`#cluster-frame-${closedFrameId}`).count() === 1, "closing a tab must not terminate or destroy the cluster frame");
    assert(page.url() === preCloseUrl, "closing an inactive tab must not change the currently visible cluster route");

    await page.setViewportSize({ width: 900, height: 650 });
    const layoutAudit = await page.evaluate(() => {
      const bar = document.querySelector('[data-testid="workspace-tab-bar"]')?.getBoundingClientRect();
      const views = document.querySelector("#lens-views")?.getBoundingClientRect();
      const tabs = document.querySelector('[role="tablist"]');
      return {
        barBottom: bar?.bottom,
        viewsTop: views?.top,
        tablistClientWidth: tabs?.clientWidth,
        tablistScrollWidth: tabs?.scrollWidth,
        viewportWidth: window.innerWidth,
      };
    });
    assert(layoutAudit.barBottom <= layoutAudit.viewsTop + 1, "tab strip must not overlap the cluster viewport at 900x650");
    report.smallViewport = layoutAudit;

    const fixtureAudit = fixtureServers.map((fixture) => ({
      context: fixture.context.name,
      endpoint: fixture.endpoint,
      requests: fixture.requests.length,
      watchRequests: fixture.requests.filter((request) => request.watch).length,
      activeWatches: fixture.activeWatches,
      rejectedWrites: fixture.rejectedWrites,
    }));
    assert(fixtureAudit.every((fixture) => fixture.endpoint.startsWith("http://127.0.0.1:")), "all fixture API endpoints must be loopback-only");
    assert(fixtureAudit.every((fixture) => fixture.rejectedWrites.length === 0), "the packaged UI attempted a non-read-only operation against a synthetic fixture");
    assert(fixtureAudit.slice(0, 10).every((fixture) => fixture.requests > 0), "every synthetic cluster context must receive at least one API request during the tab exercise");
    report.syntheticApiAudit = fixtureAudit;

    report.status = "PASS";
    report.screenshotPrefix = screenshotPrefix;
    report.navigationMethods = navigationMethods;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.status = "FAIL";
    report.error = error?.stack || String(error);
    report.syntheticApiAudit = fixtureServers.map((fixture) => ({
      context: fixture.context.name,
      endpoint: fixture.endpoint,
      requests: fixture.requests.length,
      activeWatches: fixture.activeWatches,
      rejectedWrites: fixture.rejectedWrites,
    }));
    if (page) {
      report.pageState = await page.evaluate(() => ({
        url: location.href,
        bodyText: document.body.innerText.slice(0, 1500),
        frames: [...document.querySelectorAll('#lens-views iframe[id^="cluster-frame-"]')].map((frame) => ({
          id: frame.id,
          src: frame.getAttribute("src"),
          classes: frame.className,
          rect: (() => { const { width, height } = frame.getBoundingClientRect(); return { width, height }; })(),
          readyState: (() => { try { return frame.contentDocument?.readyState; } catch { return "cross-origin"; } })(),
          innerText: (() => { try { return frame.contentDocument?.body?.innerText?.slice(0, 500); } catch { return "cross-origin"; } })(),
        })),
      })).catch((pageError) => ({ error: String(pageError) }));
    }
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await closeApp(app);
    for (const fixture of fixtureServers) {
      await fixture.close();
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
})();
