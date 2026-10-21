/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));

const outputDir = process.env.OPENLENS_R4_03_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r4-stage/r4-03");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const screenshotDir = path.join(projectRoot, "docs/revival/screenshots");
const screenshotPrefix = `r4-03-persistence-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const contexts = [
  { name: "r4-03-dev", alias: "Synthetic DEV", environment: "development", color: "#10B981", isProd: false },
  { name: "r4-03-stg", alias: "Synthetic STG", environment: "staging", color: "#F59E0B", isProd: false },
  { name: "r4-03-prod", alias: "Synthetic PROD", environment: "production", color: "#EF4444", isProd: true },
];

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
    metadata: { name: "api", namespace: "default", uid: `uid-${context.name}`, resourceVersion: "1" },
    spec: { containers: [{ name: "api", image: `registry.synthetic.invalid/api:${context.name}` }] },
    status: { phase: "Running", containerStatuses: [{ name: "api", image: `registry.synthetic.invalid/api:${context.name}`, ready: true, restartCount: 0 }] },
  };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const isWatch = request.method === "GET" && requestUrl.searchParams.get("watch") === "true";
    requests.push({ method: request.method, path: requestUrl.pathname, watch: isWatch, timestamp: Date.now() });

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
        return json(response, 200, { major: "1", minor: "31", gitVersion: "v1.31.0", platform: "darwin/arm64" });
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

function syntheticKubeConfig(fixtures) {
  return [
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
}

function createProfile(root, label, fixtures) {
  const home = path.join(root, `${label}-home`);
  const appData = path.join(root, `${label}-appdata`);
  const kubeConfigPath = path.join(home, ".kube", "config");
  const userData = path.join(appData, "OpenLens DevOps");

  fs.mkdirSync(path.dirname(kubeConfigPath), { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(kubeConfigPath, syntheticKubeConfig(fixtures), { mode: 0o600 });

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

  return { home, appData, kubeConfigPath, clusters, userData };
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
  let lastLogged = 0;

  while (Date.now() - startedAt < 90_000) {
    const windows = app.windows();
    const page = windows.find((candidate) => candidate.url().startsWith("https://lens.app"));

    if (Date.now() - lastLogged > 5000) {
      lastLogged = Date.now();
      console.log(`[R4-03 AUDIT]: Waiting for main renderer... Open windows (${windows.length}): ${windows.map((w) => w.url()).join(", ") || "(none yet)"}`);
    }

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

async function openFromCatalog(page, fixture, clusterId) {
  await page.getByText(fixture.alias, { exact: true }).click({ timeout: 20_000 });
  await page.waitForURL(new RegExp(`/cluster/${clusterId}(?:[?#].*)?$`), { timeout: 20_000 });
  await page.locator(`#cluster-frame-${clusterId}`).waitFor({ state: "attached", timeout: 20_000 });
}

async function closeApp(app) {
  if (!app) return;

  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) return;

  const exited = new Promise((resolve) => child.once("exit", resolve));

  try {
    await app.evaluate(({ app: electronApp }) => electronApp.quit());
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }

  let timeout;
  const exitResult = await Promise.race([
    exited,
    new Promise((resolve) => timeout = setTimeout(() => resolve(undefined), 15_000)),
  ]);

  clearTimeout(timeout);

  if (exitResult === undefined) {
    await app.close().catch(() => undefined);
    throw new Error("Packaged Electron process did not exit after app.quit()");
  }

  assert(child.exitCode !== null || child.signalCode !== null, "Packaged Electron process must be fully terminated");

  return { exitCode: child.exitCode, signalCode: child.signalCode };
}

function sessionPath(profile) {
  return path.join(profile.userData, "lens-workspace-sessions.json");
}

function clusterStorePath(profile) {
  return path.join(profile.userData, "lens-cluster-store.json");
}

function tabOrder(page) {
  return page.locator(".workspace-tab-item").evaluateAll((items) => items.map((item) => {
    const testId = item.querySelector('[role="tab"]')?.getAttribute("data-testid") || "";

    return testId.replace(/^workspace-tab-/, "");
  }));
}

async function launchRestorationApp(profile, label) {
  const launchedApp = await _electron.launch({
    executablePath: executable,
    args: [
      "--integration-testing",
      "--enable-workspace-tabs",
      "--user-data-dir=" + profile.userData,
    ],
    env: appEnvironment(profile, true),
    timeout: 90_000,
  });

  launchedApp.process().stdout.on("data", (data) => process.stdout.write("[" + label + " STDOUT]: " + data));
  launchedApp.process().stderr.on("data", (data) => process.stderr.write("[" + label + " STDERR]: " + data));

  const mainPage = await waitForMainRenderer(launchedApp);
  const rendererErrors = [];

  mainPage.on("console", (message) => console.log("[" + label + " RENDERER]: " + message.text()));
  mainPage.on("pageerror", (error) => rendererErrors.push(error.message));
  await mainPage.setViewportSize({ width: 1280, height: 800 });
  await mainPage.locator('[data-testid="workspace-tab-bar"]').waitFor({ state: "visible", timeout: 20_000 });
  await mainPage.waitForTimeout(1500);

  return { app: launchedApp, page: mainPage, rendererErrors };
}

function resetFixtureRequests() {
  contexts.forEach((context) => {
    context.fixture.requests.length = 0;
    context.fixture.rejectedWrites.length = 0;
  });
}

function fixtureRequestCounts() {
  return Object.fromEntries(contexts.map((context) => [context.name, context.fixture.requests.length]));
}

async function verifyInactiveRestore(profile, label, expectedClusterIds) {
  resetFixtureRequests();
  const launched = await launchRestorationApp(profile, label);
  const { app: launchedApp, page: mainPage, rendererErrors } = launched;
  try {
    await mainPage.waitForTimeout(2000);

    const restoredOrder = await tabOrder(mainPage);

    assert(
      JSON.stringify(restoredOrder) === JSON.stringify(expectedClusterIds),
      `${label}: expected restored order ${JSON.stringify(expectedClusterIds)}, got ${JSON.stringify(restoredOrder)}`,
    );

    for (const clusterId of expectedClusterIds) {
      const restoredTab = mainPage.getByTestId(`workspace-tab-${clusterId}`);

      assert(await restoredTab.getAttribute("data-restored-inactive") === "true", `${label}: tab ${clusterId} must remain inactive`);
      assert(await restoredTab.getAttribute("aria-controls") === null, `${label}: inactive tab ${clusterId} must not claim a live frame`);
      assert(await mainPage.locator(`#cluster-frame-${clusterId}`).count() === 0, `${label}: restoration must not create frame ${clusterId}`);
    }

    const totalRequests = contexts.reduce((total, context) => total + context.fixture.requests.length, 0);

    assert(totalRequests === 0, `${label}: restoration must make zero synthetic Kubernetes API requests, got ${JSON.stringify(fixtureRequestCounts())}`);
    assert(rendererErrors.length === 0, `${label}: renderer errors: ${rendererErrors.join("; ")}`);

    const screenshot = path.join(screenshotDir, `${screenshotPrefix}-${label}.png`);

    await mainPage.screenshot({ path: screenshot });

    return { order: restoredOrder, screenshot, requests: fixtureRequestCounts(), rendererErrors };
  } finally {
    await closeApp(launchedApp);
  }
}

async function verifyCorruptSnapshot(root, label, payload, profileLabel) {
  const profile = createProfile(root, profileLabel, contexts);

  writeProfileFile(sessionPath(profile), payload);

  return verifyInactiveRestore(profile, label, []);
}

function sessionSnapshotFor(profile, clusterIndexes, activeIndex) {
  const selectedClusters = clusterIndexes.map((index) => profile.clusters[index]);
  const tabs = selectedClusters.map((cluster, index) => ({
    id: "tab-" + cluster.id,
    workspaceId: "default",
    clusterId: cluster.id,
    title: cluster.preferences.clusterAlias,
    kind: "cluster",
    environment: cluster.preferences.clusterEnvironment,
    isProduction: cluster.preferences.clusterEnvironment === "production",
    accentColor: cluster.preferences.clusterColor,
    createdAt: index + 1,
  }));
  const entries = tabs.map((tab, index) => ({
    tabId: tab.id,
    workspaceId: "default",
    clusterId: tab.clusterId,
    path: "/cluster/" + tab.clusterId,
    timestamp: index + 1,
  }));

  return {
    version: 1,
    timestamp: Date.now(),
    activeWorkspaceId: "default",
    workspaces: [{
      id: "default",
      name: "Default Workspace",
      activeClusterId: selectedClusters[activeIndex]?.id,
      clusterIds: selectedClusters.map((cluster) => cluster.id),
      createdAt: 1,
      updatedAt: 1,
    }],
    layouts: {
      default: {
        tabs,
        activeTabId: tabs[activeIndex]?.id,
      },
    },
    history: {
      default: {
        workspaceId: "default",
        entries,
        currentIndex: entries.length - 1,
      },
    },
  };
}

function writeProfileFile(filePath, value) {
  fs.writeFileSync(filePath, value, { encoding: "utf-8", mode: 0o600 });
}

function appendSyntheticContext(profile, contextName, endpoint) {
  const original = fs.readFileSync(profile.kubeConfigPath, "utf-8");
  const [clustersSection, rest] = original.split("\ncontexts:\n");
  const [contextsSection, usersSection] = (rest || "").split("\nusers:\n");

  assert(clustersSection && contextsSection !== undefined && usersSection !== undefined, "Synthetic kubeconfig sections must be present");

  const clusterName = "cluster-" + contextName;
  const userName = "synthetic-user-" + contextName;
  const updated = [
    clustersSection,
    "- name: " + clusterName + "\n  cluster:\n    server: " + endpoint,
    "contexts:",
    contextsSection,
    "- name: " + contextName + "\n  context:\n    cluster: " + clusterName + "\n    user: " + userName + "\n    namespace: default",
    "users:",
    usersSection,
    "- name: " + userName + "\n  user: {}",
  ].join("\n");

  writeProfileFile(profile.kubeConfigPath, updated);

  return {
    id: crypto.createHash("md5").update(profile.kubeConfigPath + ":" + contextName).digest("hex"),
    kubeConfigPath: profile.kubeConfigPath,
    contextName,
  };
}

const FORBIDDEN_PATTERNS = [
  "password", "secret", "kubeconfig", "buffer", "pty", "draft", "stringdata", "privatekey",
  "credential", "execauth", "bearer", "apikey", "sessiontoken", "clientcertificate", "clientkey",
  "command", "process", "processid", "pid", "portforward", "terminal", "logbuffer",
];

function assertNoForbiddenFields(obj, currentPath = "root") {
  if (!obj || typeof obj !== "object") return;
  for (const [key, value] of Object.entries(obj)) {
    const normalized = key.toLowerCase().replace(/[-_]/g, "");
    if (normalized === "data" || FORBIDDEN_PATTERNS.some((p) => normalized.includes(p))) {
      throw new Error(`Security violation: forbidden field "${key}" found at ${currentPath}.${key}`);
    }
    assertNoForbiddenFields(value, `${currentPath}.${key}`);
  }
}

async function run() {
  console.log(`[R4-03 AUDIT]: Executing verification against: ${executable}`);
  assert(fs.existsSync(executable), `Executable does not exist at ${executable}`);

  const asarPath = path.join(path.dirname(executable), "../Resources/app.asar");
  const asarHash = fs.existsSync(asarPath)
    ? crypto.createHash("sha256").update(fs.readFileSync(asarPath)).digest("hex")
    : "not-found";
  const exeHash = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");

  console.log(`[R4-03 AUDIT]: app.asar SHA-256 = ${asarHash}`);
  console.log(`[R4-03 AUDIT]: Binary SHA-256   = ${exeHash}`);

  fs.mkdirSync(screenshotDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r4-03-e2e-"));
  const fixtureServers = [];
  let app;
  let page;
  const report = {
    executable,
    binarySha256: exeHash,
    appAsarSha256: asarHash,
    electronVersion: null,
    screenshots: {},
    phases: {},
  };

  try {
    for (const context of contexts) {
      const fixture = await createLocalApiFixture(context);
      context.endpoint = fixture.endpoint;
      context.fixture = fixture;
      fixtureServers.push(fixture);
    }

    console.log("[R4-03 AUDIT]: Synthetic Kubernetes API servers listening on dynamic local ports");

    // Single unified profile for persistence round-trip testing
    const profile = createProfile(tempRoot, "r4-03-session", contexts);

    // =========================================================================
    // PHASE 1: Launch with --enable-workspace-tabs, open 3 tabs, test history
    // =========================================================================
    console.log("\n--- PHASE 1: Launch with Workspace Tabs & Establish Multi-Cluster Session ---");
    app = await _electron.launch({
      executablePath: executable,
      args: [
        "--integration-testing",
        "--enable-workspace-tabs",
        `--user-data-dir=${profile.userData}`,
      ],
      env: appEnvironment(profile, true),
      timeout: 90_000,
    });

    app.process().stdout.on("data", (data) => process.stdout.write(`[ELECTRON STDOUT]: ${data}`));
    app.process().stderr.on("data", (data) => process.stderr.write(`[ELECTRON STDERR]: ${data}`));

    page = await waitForMainRenderer(app);
    report.electronVersion = await app.evaluate(() => process.versions.electron);
    page.on("console", (msg) => console.log(`[RENDERER CONSOLE]: ${msg.text()}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await openCatalogFromWelcome(page, contexts);

    // Workspace tab bar must be present
    const hasWorkspaceBar = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="workspace-tab-bar"]')),
    );
    assert(hasWorkspaceBar, "WorkspaceTabBar must be visible when --enable-workspace-tabs is active");

    // Open DEV tab
    console.log("[R4-03 AUDIT]: Opening DEV tab (1/3)...");
    const devClusterId = profile.clusters[0].id;
    await openFromCatalog(page, contexts[0], devClusterId);
    await page.getByTestId(`workspace-tab-${devClusterId}`).waitFor({ state: "visible", timeout: 20_000 });

    // Return to catalog and open STG tab
    console.log("[R4-03 AUDIT]: Opening STG tab (2/3)...");
    const stgClusterId = profile.clusters[1].id;
    await page.getByText("view_list", { exact: true }).first().click({ timeout: 10_000 });
    await page.waitForURL(/\/catalog(?:\/entity\.k8slens\.dev\/KubernetesCluster)?(?:[?#].*)?$/i, { timeout: 20_000 });
    await openFromCatalog(page, contexts[1], stgClusterId);
    await page.getByTestId(`workspace-tab-${stgClusterId}`).waitFor({ state: "visible", timeout: 20_000 });

    // Return to catalog and open PROD tab
    console.log("[R4-03 AUDIT]: Opening PROD tab (3/3)...");
    const prodClusterId = profile.clusters[2].id;
    await page.getByText("view_list", { exact: true }).first().click({ timeout: 10_000 });
    await page.waitForURL(/\/catalog(?:\/entity\.k8slens\.dev\/KubernetesCluster)?(?:[?#].*)?$/i, { timeout: 20_000 });
    await openFromCatalog(page, contexts[2], prodClusterId);
    await page.getByTestId(`workspace-tab-${prodClusterId}`).waitFor({ state: "visible", timeout: 20_000 });

    // Verify exactly 3 tabs
    const tabElements = await page.locator(".workspace-tab-item").count();
    assert(tabElements === 3, `Expected 3 tabs in workspace, got ${tabElements}`);

    // Verify PROD hazard class
    const prodTab = page.getByTestId(`workspace-tab-${prodClusterId}`);
    assert(await prodTab.evaluate((el) => el.classList.contains("prod-hazard")), "Production tab must have prod-hazard styling");

    // Reorder via the actual draggable UI, not by editing serialized state.
    await page.getByTestId(`workspace-tab-${devClusterId}`).dragTo(prodTab);
    const reorderedIds = [stgClusterId, prodClusterId, devClusterId];

    await page.waitForFunction((expected) => {
      const actual = Array.from(document.querySelectorAll(".workspace-tab-item [role=tab]"))
        .map((tab) => tab.getAttribute("data-testid")?.replace(/^workspace-tab-/, ""));

      return JSON.stringify(actual) === JSON.stringify(expected);
    }, reorderedIds, { timeout: 10_000 });
    assert(JSON.stringify(await tabOrder(page)) === JSON.stringify(reorderedIds), "Actual UI drag must persist a reordered tab sequence");

    // History navigation test: Click Back button
    const backBtn = page.getByTestId("workspace-nav-back");
    const forwardBtn = page.getByTestId("workspace-nav-forward");

    assert(!await backBtn.isDisabled(), "Back button must be enabled after visiting multiple tabs");
    console.log("[R4-03 AUDIT]: Clicking Back button to test workspace history...");
    await backBtn.click();
    await page.waitForFunction(
      (id) => document.querySelector(`[data-testid="workspace-tab-${id}"]`)?.getAttribute("aria-selected") === "true",
      stgClusterId,
      { timeout: 10_000 },
    );
    console.log("[R4-03 AUDIT]: Back button successfully selected STG tab!");

    assert(!await forwardBtn.isDisabled(), "Forward button must be enabled after going back");
    console.log("[R4-03 AUDIT]: Clicking Forward button to test forward history...");
    await forwardBtn.click();
    await page.waitForFunction(
      (id) => document.querySelector(`[data-testid="workspace-tab-${id}"]`)?.getAttribute("aria-selected") === "true",
      prodClusterId,
      { timeout: 10_000 },
    );
    console.log("[R4-03 AUDIT]: Forward button successfully re-selected PROD tab!");

    // Capture Phase 1 screenshot
    const phase1Screenshot = path.join(screenshotDir, `${screenshotPrefix}-phase1-active-tabs.png`);
    await page.screenshot({ path: phase1Screenshot });
    report.screenshots.phase1 = phase1Screenshot;
    console.log(`[R4-03 AUDIT]: Phase 1 screenshot saved to ${phase1Screenshot}`);

    // Wait 600ms for debounced atomic file persistence to complete
    await page.waitForTimeout(600);

    // Verify session snapshot on disk
    const sessionFilePath = sessionPath(profile);

    assert(fs.existsSync(sessionFilePath), "File-backed workspace session snapshot must exist in the isolated test profile");
    const savedSnapshot = JSON.parse(fs.readFileSync(sessionFilePath, "utf-8"));
    assertNoForbiddenFields(savedSnapshot);
    assert(savedSnapshot.version === 1, "Snapshot version must be 1");
    assert(savedSnapshot.layouts && savedSnapshot.layouts.default, "Layout default must exist");
    assert(savedSnapshot.layouts.default.tabs.length === 3, "Snapshot must have 3 persisted tabs");
    assert(savedSnapshot.layouts.default.activeTabId === `tab-${prodClusterId}`, "Active tab must be PROD");
    assert(
      JSON.stringify(savedSnapshot.layouts.default.tabs.map((tab) => tab.clusterId)) === JSON.stringify(reorderedIds),
      "Snapshot must preserve the user-reordered tab sequence",
    );
    assert(savedSnapshot.layouts.default.tabs.every((tab) => tab.kind === "cluster"), "Only cluster descriptors may persist; tool sessions are not restorable");
    assert(
      savedSnapshot.history.default.entries.every((entry) => entry.path === `/cluster/${entry.clusterId}`),
      "Persisted workspace history must contain canonical cluster routes only",
    );
    console.log(`[R4-03 AUDIT]: Validated serialized session snapshot on disk (${fs.statSync(sessionFilePath).size} bytes)`);

    report.phases.phase1 = {
      status: "PASS",
      tabsCount: 3,
      tabOrder: reorderedIds,
      historyBackForwardTested: true,
      activeClusterId: prodClusterId,
      screenshot: phase1Screenshot,
    };

    await closeApp(app);
    app = undefined;
    page = undefined;

    // =========================================================================
    // PHASE 2: Relaunch app with SAME profile & enforce strict "NO AUTO-START"
    // =========================================================================
    console.log("\n--- PHASE 2: Session Restoration & Strict NO AUTO-START Verification ---");

    resetFixtureRequests();

    app = await _electron.launch({
      executablePath: executable,
      args: [
        "--integration-testing",
        "--enable-workspace-tabs",
        `--user-data-dir=${profile.userData}`,
      ],
      env: appEnvironment(profile, true),
      timeout: 90_000,
    });

    app.process().stdout.on("data", (data) => process.stdout.write(`[ELECTRON STDOUT P2]: ${data}`));
    app.process().stderr.on("data", (data) => process.stderr.write(`[ELECTRON STDERR P2]: ${data}`));

    page = await waitForMainRenderer(app);
    page.on("console", (msg) => console.log(`[RENDERER CONSOLE]: ${msg.text()}`));
    await page.setViewportSize({ width: 1280, height: 800 });

    // Wait for WorkspaceTabBar to hydrate and mount
    await page.locator('[data-testid="workspace-tab-bar"]').waitFor({ state: "visible", timeout: 20_000 });

    // Wait 2 full seconds for any background processes or restoration loops to settle
    await page.waitForTimeout(2000);

    // Check restored tabs count
    const restoredTabsCount = await page.locator(".workspace-tab-item").count();
    console.log(`[R4-03 AUDIT]: Restored tab count: ${restoredTabsCount}`);
    assert(restoredTabsCount === 3, `Expected 3 restored tab descriptors, got ${restoredTabsCount}`);
    assert(JSON.stringify(await tabOrder(page)) === JSON.stringify(reorderedIds), "Restored tab order must match the order before shutdown");
    assert(
      await page.getByTestId(`workspace-tab-${prodClusterId}`).getAttribute("aria-selected") === "true",
      "Logical focus must restore to PROD without creating a live cluster frame",
    );
    const workspaceIndicator = page.locator(".workspace-indicator");
    const workspaceIdentityLabel = await workspaceIndicator.innerText();

    assert(
      workspaceIdentityLabel.toLowerCase().includes("default") || await workspaceIndicator.getAttribute("title") === "Workspace: default",
      `Restored workspace identity must remain default; visible label=${JSON.stringify(workspaceIdentityLabel)}, title=${JSON.stringify(await workspaceIndicator.getAttribute("title"))}`,
    );

    for (const clusterId of [devClusterId, stgClusterId, prodClusterId]) {
      const restoredTab = page.getByTestId(`workspace-tab-${clusterId}`);

      assert(await restoredTab.getAttribute("data-restored-inactive") === "true", `Restored tab ${clusterId} must remain inactive`);
      assert(await restoredTab.getAttribute("aria-controls") === null, `Inactive tab ${clusterId} must not claim a live cluster frame`);
      assert(await page.locator(`#cluster-frame-${clusterId}`).count() === 0, `Restoration must not create frame ${clusterId}`);
    }

    // STRICT SAFETY AUDIT: Zero Kubernetes API requests may be made by session restoration!
    const devReqs = contexts[0].fixture.requests.length;
    const stgReqs = contexts[1].fixture.requests.length;
    const prodReqs = contexts[2].fixture.requests.length;
    const totalRestorationReqs = devReqs + stgReqs + prodReqs;

    console.log(`[R4-03 AUDIT]: Cluster API requests upon session restoration: DEV=${devReqs}, STG=${stgReqs}, PROD=${prodReqs}`);
    assert(
      totalRestorationReqs === 0,
      `VIOLATION OF NO AUTO-START CONTRACT: Expected 0 requests on restoration, got ${totalRestorationReqs}`,
    );
    console.log("[R4-03 AUDIT]: PASS: Strict NO AUTO-START verified. Zero Kubernetes network requests triggered by restoration.");

    // Capture Phase 2 screenshot
    const phase2Screenshot = path.join(screenshotDir, `${screenshotPrefix}-phase2-restored-no-autostart.png`);
    await page.screenshot({ path: phase2Screenshot });
    report.screenshots.phase2 = phase2Screenshot;
    console.log(`[R4-03 AUDIT]: Phase 2 screenshot saved to ${phase2Screenshot}`);

    // Restored history is exercised only after explicit navigation controls are activated.
    assert(!await page.getByTestId("workspace-nav-back").isDisabled(), "Persisted Back history must be available after restart");
    console.log("[R4-03 AUDIT]: Exercising persisted history Back after restart...");
    await page.getByTestId("workspace-nav-back").click();
    await page.waitForURL(new RegExp(`/cluster/${stgClusterId}(?:[?#].*)?$`), { timeout: 20_000 });
    await page.waitForTimeout(1000);
    assert(await page.getByTestId(`workspace-tab-${stgClusterId}`).getAttribute("aria-selected") === "true", "Back must select its recorded STG tab");
    assert(contexts[0].fixture.requests.length === 0 && contexts[1].fixture.requests.length > 0 && contexts[2].fixture.requests.length === 0,
      `Back must activate only STG; observed ${JSON.stringify(fixtureRequestCounts())}`);
    assert(!await page.getByTestId("workspace-nav-forward").isDisabled(), "Forward history must become available after an explicit Back action");
    const historyBackScreenshot = path.join(screenshotDir, `${screenshotPrefix}-phase2-history-back-stg.png`);
    await page.screenshot({ path: historyBackScreenshot });

    const requestCountsBeforeForward = contexts.map((context) => context.fixture.requests.length);

    console.log("[R4-03 AUDIT]: Exercising persisted history Forward after restart...");
    await page.getByTestId("workspace-nav-forward").click();
    await page.waitForURL(new RegExp(`/cluster/${prodClusterId}(?:[?#].*)?$`), { timeout: 20_000 });
    await page.waitForTimeout(1000);
    assert(await page.getByTestId(`workspace-tab-${prodClusterId}`).getAttribute("aria-selected") === "true", "Forward must select its recorded PROD tab");
    assert(contexts[0].fixture.requests.length === requestCountsBeforeForward[0] && contexts[2].fixture.requests.length > requestCountsBeforeForward[2],
      `Forward must activate PROD and never DEV; before=${JSON.stringify(requestCountsBeforeForward)}, after=${JSON.stringify(fixtureRequestCounts())}`);
    const historyForwardScreenshot = path.join(screenshotDir, `${screenshotPrefix}-phase2-history-forward-prod.png`);
    await page.screenshot({ path: historyForwardScreenshot });

    // Now verify intentional activation on explicit user interaction
    console.log("[R4-03 AUDIT]: Explicitly clicking DEV tab to verify intentional activation...");
    await page.getByTestId(`workspace-tab-${devClusterId}`).click();
    await page.waitForURL(new RegExp(`/cluster/${devClusterId}(?:[?#].*)?$`), { timeout: 20_000 });
    await page.waitForTimeout(1000);

    const devReqsAfterClick = contexts[0].fixture.requests.length;
    console.log(`[R4-03 AUDIT]: DEV cluster requests after explicit user click: ${devReqsAfterClick}`);
    assert(devReqsAfterClick > 0, "Explicit user click must activate cluster frame and initiate query");
    const activationScreenshot = path.join(screenshotDir, `${screenshotPrefix}-phase2-explicit-activation.png`);

    await page.screenshot({ path: activationScreenshot });
    report.screenshots.phase2Activation = activationScreenshot;

    report.phases.phase2 = {
      status: "PASS",
      restoredTabsCount,
      restoredOrder: reorderedIds,
      restoredWorkspaceId: "default",
      restoredFocusedClusterId: prodClusterId,
      restorationK8sRequests: totalRestorationReqs,
      noAutoStartVerified: true,
      backAfterRestartTargets: stgClusterId,
      forwardAfterRestartTargets: prodClusterId,
      intentionalActivationVerified: true,
      historyBackScreenshot,
      historyForwardScreenshot,
      explicitActivationScreenshot: activationScreenshot,
      screenshot: phase2Screenshot,
    };

    await closeApp(app);
    app = undefined;
    page = undefined;

    // =========================================================================
    // PHASE 3: Classic Shell Fallback (Flag OFF)
    // =========================================================================
    console.log("\n--- PHASE 3: Classic Shell Fallback (Flag OFF) ---");
    app = await _electron.launch({
      executablePath: executable,
      args: [
        "--integration-testing",
        `--user-data-dir=${profile.userData}`,
      ],
      env: appEnvironment(profile, false),
      timeout: 90_000,
    });

    page = await waitForMainRenderer(app);
    page.on("console", (msg) => console.log(`[RENDERER CONSOLE]: ${msg.text()}`));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(2000);

    const fallbackCheck = await page.evaluate(() => ({
      hasWorkspaceBar: Boolean(document.querySelector('[data-testid="workspace-tab-bar"]')),
      hasWorkspaceOffset: Boolean(document.querySelector("#lens-views")?.classList.contains("with-tab-bar")),
    }));

    assert(!fallbackCheck.hasWorkspaceBar, "WorkspaceTabBar must NOT be rendered when flag is off");
    assert(!fallbackCheck.hasWorkspaceOffset, "Layout offset must NOT be applied when flag is off");
    console.log("[R4-03 AUDIT]: PASS: Classic shell completely preserved when workspace-tabs flag is disabled.");

    const phase3Screenshot = path.join(screenshotDir, `${screenshotPrefix}-phase3-classic-fallback.png`);
    await page.screenshot({ path: phase3Screenshot });
    report.screenshots.phase3 = phase3Screenshot;
    console.log(`[R4-03 AUDIT]: Phase 3 screenshot saved to ${phase3Screenshot}`);

    report.phases.phase3 = {
      status: "PASS",
      classicShellPreserved: true,
      screenshot: phase3Screenshot,
    };

    await closeApp(app);
    app = undefined;
    page = undefined;

    // =========================================================================
    // PHASE 4: Deleted clusters and same-label, different-identity replacement
    // =========================================================================
    console.log("\n--- PHASE 4: Missing Cluster & Identity Replacement ---");
    const storedClusterData = JSON.parse(fs.readFileSync(clusterStorePath(profile), "utf-8"));

    storedClusterData.clusters = storedClusterData.clusters.filter((cluster) => cluster.id !== prodClusterId);
    writeProfileFile(clusterStorePath(profile), JSON.stringify(storedClusterData, null, 2));
    writeProfileFile(profile.kubeConfigPath, syntheticKubeConfig(contexts.slice(0, 2)));

    const syncedKubeConfigDir = path.join(profile.userData, "kubeconfigs");

    if (fs.existsSync(syncedKubeConfigDir)) {
      fs.rmSync(syncedKubeConfigDir, { recursive: true, force: true });
    }

    report.phases.deletedCluster = await verifyInactiveRestore(profile, "missing-cluster", [stgClusterId, devClusterId]);

    const missingClusterSnapshot = JSON.parse(fs.readFileSync(sessionPath(profile), "utf-8"));

    report.phases.deletedCluster.staleReferenceRetainedOnDisk = missingClusterSnapshot.layouts.default.tabs.some((tab) => tab.clusterId === prodClusterId);
    report.phases.deletedCluster.staleHistoryRetainedOnDisk = missingClusterSnapshot.history.default.entries.some((entry) => entry.clusterId === prodClusterId);
    assert(!report.phases.deletedCluster.staleReferenceRetainedOnDisk, "Deleted cluster tab must be purged from the persisted snapshot");
    assert(!report.phases.deletedCluster.staleHistoryRetainedOnDisk, "Deleted cluster history must be purged from the persisted snapshot");

    const replacementContext = { ...contexts[2], name: "r4-03-prod-replacement" };
    const replacementProfile = createProfile(tempRoot, "r4-03-identity-replacement", [contexts[0], contexts[1], replacementContext]);
    const replacementClusterId = replacementProfile.clusters[2].id;
    const staleProdClusterId = crypto.createHash("md5").update(`${replacementProfile.kubeConfigPath}:r4-03-prod`).digest("hex");
    const replacementSnapshot = sessionSnapshotFor(replacementProfile, [0, 1, 2], 2);
    const staleProdTab = replacementSnapshot.layouts.default.tabs[2];

    replacementSnapshot.workspaces[0].clusterIds[2] = staleProdClusterId;
    replacementSnapshot.workspaces[0].activeClusterId = staleProdClusterId;
    staleProdTab.id = `tab-${staleProdClusterId}`;
    staleProdTab.clusterId = staleProdClusterId;
    replacementSnapshot.layouts.default.activeTabId = staleProdTab.id;
    replacementSnapshot.history.default.entries[2].tabId = staleProdTab.id;
    replacementSnapshot.history.default.entries[2].clusterId = staleProdClusterId;
    replacementSnapshot.history.default.entries[2].path = `/cluster/${staleProdClusterId}`;
    writeProfileFile(sessionPath(replacementProfile), JSON.stringify(replacementSnapshot));

    const replacementResult = await verifyInactiveRestore(
      replacementProfile,
      "identity-replacement",
      [replacementProfile.clusters[0].id, replacementProfile.clusters[1].id],
    );

    assert(replacementClusterId !== staleProdClusterId, "Same-label replacement must have a different cluster identity");
    assert(replacementProfile.clusters[2].preferences.clusterAlias === contexts[2].alias, "Replacement fixture must have the same visible production alias");
    report.phases.identityReplacement = {
      status: "PASS",
      staleClusterId: staleProdClusterId,
      replacementClusterId,
      sharedVisibleAlias: contexts[2].alias,
      replacementTabDiscarded: true,
      ...replacementResult,
    };

    // =========================================================================
    // PHASE 5: Corrupt and hostile-but-allowlisted session payloads
    // =========================================================================
    console.log("\n--- PHASE 5: Corrupt Snapshot Inputs ---");
    report.phases.corruptInputs = {};
    report.phases.corruptInputs.invalidJson = await verifyCorruptSnapshot(tempRoot, "corrupt-invalid-json", "{", "r4-03-corrupt-json");
    report.phases.corruptInputs.unknownVersion = await verifyCorruptSnapshot(
      tempRoot,
      "corrupt-unknown-version",
      JSON.stringify({ version: 999 }),
      "r4-03-corrupt-version",
    );

    const duplicateProfile = createProfile(tempRoot, "r4-03-duplicate-tabs", contexts);
    const duplicateSnapshot = sessionSnapshotFor(duplicateProfile, [0, 1, 2], 2);

    duplicateSnapshot.layouts.default.tabs[1].id = duplicateSnapshot.layouts.default.tabs[0].id;
    writeProfileFile(sessionPath(duplicateProfile), JSON.stringify(duplicateSnapshot));
    report.phases.corruptInputs.duplicateTabIds = await verifyInactiveRestore(duplicateProfile, "corrupt-duplicate-tabs", []);

    const sensitiveProfile = createProfile(tempRoot, "r4-03-sensitive-field", contexts);
    const sensitiveSnapshot = sessionSnapshotFor(sensitiveProfile, [0, 1, 2], 2);

    sensitiveSnapshot.token = "synthetic-invalid-token";
    writeProfileFile(sessionPath(sensitiveProfile), JSON.stringify(sensitiveSnapshot));
    report.phases.corruptInputs.sensitiveField = await verifyInactiveRestore(sensitiveProfile, "corrupt-sensitive-field", []);

    const allowlistProfile = createProfile(tempRoot, "r4-03-path-allowlist", contexts);
    const allowlistSnapshot = sessionSnapshotFor(allowlistProfile, [0, 1, 2], 2);

    allowlistSnapshot.layouts.default.tabs[0].command = "kubectl delete namespace synthetic";
    allowlistSnapshot.history.default.entries[0].path = "javascript:alert(1)";
    allowlistSnapshot.history.default.entries[0].command = "kubectl delete namespace synthetic";
    allowlistSnapshot.unexpectedMetadata = { command: "kubectl delete namespace synthetic" };
    writeProfileFile(sessionPath(allowlistProfile), JSON.stringify(allowlistSnapshot));
    const allowlistResult = await verifyInactiveRestore(
      allowlistProfile,
      "allowlist-unsafe-path-and-fields",
      allowlistProfile.clusters.map((cluster) => cluster.id),
    );
    report.phases.corruptInputs.unsafeRouteAndUnexpectedFields = allowlistResult;

    const allowlistLaunched = await launchRestorationApp(allowlistProfile, "allowlist-explicit-activation");
    const allowlistTabId = allowlistProfile.clusters[0].id;

    await allowlistLaunched.page.getByTestId(`workspace-tab-${allowlistTabId}`).click();
    await allowlistLaunched.page.waitForURL(new RegExp(`/cluster/${allowlistTabId}(?:[?#].*)?$`), { timeout: 20_000 });
    assert(!allowlistLaunched.page.url().includes("javascript:"), "A prohibited persisted route must never be replayed");
    await allowlistLaunched.page.waitForTimeout(1000);
    const allowlistActivationRequests = fixtureRequestCounts();

    assert(
      allowlistActivationRequests[contexts[0].name] > 0 &&
      allowlistActivationRequests[contexts[1].name] === 0 &&
      allowlistActivationRequests[contexts[2].name] === 0,
      `Explicit DEV activation after sanitization must not query another cluster: ${JSON.stringify(allowlistActivationRequests)}`,
    );
    const safeSnapshot = JSON.parse(fs.readFileSync(sessionPath(allowlistProfile), "utf-8"));

    assertNoForbiddenFields(safeSnapshot);
    assert(!JSON.stringify(safeSnapshot).includes("kubectl delete"), "Unexpected command fields must be omitted by the persistence allowlist");
    assert(safeSnapshot.unexpectedMetadata === undefined, "Unexpected top-level fields must be omitted by the persistence allowlist");
    const allowlistActivatedRoute = allowlistLaunched.page.url();
    const allowlistActivationScreenshot = path.join(screenshotDir, `${screenshotPrefix}-allowlist-explicit-activation.png`);

    await allowlistLaunched.page.screenshot({ path: allowlistActivationScreenshot });

    await closeApp(allowlistLaunched.app);
    report.phases.corruptInputs.explicitActivationAfterSanitization = {
      ...allowlistResult,
      status: "PASS",
      activatedClusterId: allowlistTabId,
      route: allowlistActivatedRoute,
      requests: allowlistActivationRequests,
      activationScreenshot: allowlistActivationScreenshot,
    };

    // =========================================================================
    // FINAL AUDIT SUMMARY
    // =========================================================================
    const rejectedWrites = contexts.flatMap((context) => context.fixture.rejectedWrites.map((write) => ({ cluster: context.name, ...write })));

    assert(rejectedWrites.length === 0, `Synthetic API fixtures rejected mutation attempts: ${JSON.stringify(rejectedWrites)}`);
    report.syntheticFixtureWrites = { rejected: rejectedWrites.length };
    console.log("\n========================================================");
    console.log("   ALL R4-03 PLAYWRIGHT E2E AUDIT GATES PASSED!");
    console.log("========================================================\n");
    console.log(JSON.stringify(report, null, 2));

  } finally {
    if (app) await closeApp(app);
    await Promise.all(fixtureServers.map((s) => s.close()));
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error("\n[R4-03 AUDIT FATAL ERROR]:", err);
    process.exit(1);
  });
}

module.exports = {
  contexts, createLocalApiFixture, createProfile, appEnvironment, launchRestorationApp,
  closeApp, sessionPath, clusterStorePath, tabOrder, verifyInactiveRestore,
  openCatalogFromWelcome, openFromCatalog, writeProfileFile, assert, syntheticKubeConfig,
};
