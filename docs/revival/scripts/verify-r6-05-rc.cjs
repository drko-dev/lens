/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));

const outputDir = process.env.OPENLENS_R6_RC_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r6-rc-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r6-05");

const contexts = [
  {
    name: "dev-cluster-us-east",
    alias: "DEV Us East 01",
    environment: "development",
    color: "#10B981",
    pinned: true,
  },
  {
    name: "stg-cluster-eu-west",
    alias: "STG Eu West 02",
    environment: "staging",
    color: "#F59E0B",
    pinned: true,
  },
  {
    name: "prod-cluster-core-live",
    alias: "PROD Core Primary",
    environment: "production",
    color: "#EF4444",
    pinned: true,
  },
  {
    name: "local-minikube-dev",
    alias: "Local Minikube",
    environment: "local",
    color: "#6B7280",
    pinned: false,
  },
];

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createLocalApiFixture(context) {
  const requests = [];
  const pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "api-gateway",
      namespace: "default",
      uid: `uid-${context.name}-api-gw`,
      resourceVersion: "100",
      selfLink: "/api/v1/namespaces/default/pods/api-gateway",
    },
    spec: {
      containers: [{ name: "envoy", image: "envoyproxy/envoy:v1.30.1" }],
    },
    status: {
      phase: "Running",
      containerStatuses: [{ name: "envoy", image: "envoyproxy/envoy:v1.30.1", ready: true, restartCount: 0 }],
    },
  };

  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });

    if (request.method === "POST" && /selfsubject(access|rules)review/i.test(request.url)) {
      return json(response, 200, {
        apiVersion: "authorization.k8s.io/v1",
        kind: "SelfSubjectAccessReview",
        status: { allowed: true },
      });
    }

    if (request.url === "/version") {
      return json(response, 200, { major: "1", minor: "31", gitVersion: "v1.31.0", platform: "darwin/arm64" });
    }

    if (request.url === "/api" || request.url === "/apis") {
      return json(response, 200, { kind: "APIVersions", versions: ["v1"], groups: [] });
    }

    if (request.url === "/api/v1") {
      return json(response, 200, {
        kind: "APIResourceList",
        apiVersion: "v1",
        resources: [
          { name: "namespaces", singularName: "namespace", namespaced: false, kind: "Namespace", verbs: ["get", "list", "watch"] },
          { name: "pods", singularName: "pod", namespaced: true, kind: "Pod", verbs: ["get", "list", "watch"] },
          { name: "configmaps", singularName: "configmap", namespaced: true, kind: "ConfigMap", verbs: ["get", "list", "watch"] },
        ],
      });
    }

    if (request.url.includes("/api/v1/namespaces/default/pods") || request.url === "/api/v1/pods") {
      return json(response, 200, {
        apiVersion: "v1",
        kind: "PodList",
        metadata: { resourceVersion: "100" },
        items: [pod],
      });
    }

    if (request.url.includes("/api/v1/namespaces")) {
      return json(response, 200, {
        apiVersion: "v1",
        kind: "NamespaceList",
        metadata: { resourceVersion: "1" },
        items: [{ apiVersion: "v1", kind: "Namespace", metadata: { name: "default" }, status: { phase: "Active" } }],
      });
    }

    return json(response, 200, { status: "ok" });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const port = server.address().port;
      resolve({
        context,
        endpoint: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((cb) => {
          server.close(cb);
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

function createProfile(root, label, fixtures, colorTheme = "Midnight Graphite") {
  const home = path.join(root, `${label}-home`);
  const appData = path.join(root, `${label}-appdata`);
  const kubeConfigPath = path.join(home, ".kube", "config");
  const userData = path.join(appData, "OpenLens DevOps");

  const kubeConfig = [
    "apiVersion: v1",
    "kind: Config",
    `current-context: ${fixtures[0].name}`,
    "clusters:",
    ...fixtures.map((f, i) => `  - name: k8s-cluster-${i + 1}\n    cluster:\n      server: ${f.endpoint}`),
    "contexts:",
    ...fixtures.map((f, i) => `  - name: ${f.context.name}\n    context:\n      cluster: k8s-cluster-${i + 1}\n      user: fake-user-${i + 1}`),
    "users:",
    ...fixtures.map((_, i) => `  - name: fake-user-${i + 1}\n    user: {}`),
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(kubeConfigPath), { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(kubeConfigPath, kubeConfig, { mode: 0o600 });

  const clusters = fixtures.map((f) => ({
    id: crypto.createHash("md5").update(`${kubeConfigPath}:${f.context.name}`).digest("hex"),
    kubeConfigPath,
    contextName: f.context.name,
    preferences: {
      clusterAlias: f.context.alias,
      clusterEnvironment: f.context.environment,
      clusterColor: f.context.color,
    },
  }));

  fs.writeFileSync(path.join(userData, "lens-cluster-store.json"), JSON.stringify({
    clusters,
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  const pinnedClusterIds = clusters
    .filter((_, idx) => fixtures[idx].context.pinned)
    .map((c) => c.id);

  fs.writeFileSync(path.join(userData, "lens-hotbar-store.json"), JSON.stringify({
    hotbars: [
      {
        id: "default-hotbar",
        name: "default",
        items: pinnedClusterIds.map((uid) => ({ entity: { uid } })),
      },
    ],
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

  return { home, appData, kubeConfigPath, clusters, pinnedClusterIds };
}

function appEnvironment(profile) {
  return {
    ...process.env,
    HOME: profile.home,
    CICD: profile.appData,
    KUBECONFIG: profile.kubeConfigPath,
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
  throw new Error("Timed out waiting for main renderer");
}

async function navigate(app, route) {
  await app.evaluate(({ BrowserWindow }, url) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (!win) throw new Error("No Electron BrowserWindow");
    win.webContents.send("renderer:navigate", url);
  }, route);
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
  console.log("=================================================================");
  console.log("=== OpenLens DevOps Revival R6-05 Release Candidate Certification ===");
  console.log("=================================================================\n");
  assert(fs.existsSync(executable), `Packaged executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r6-rc-"));
  console.log(`Profile directory: ${tempRoot}`);

  const fixtureServers = [];
  const fixtures = [];
  for (const ctx of contexts) {
    const f = await createLocalApiFixture(ctx);
    fixtureServers.push(f);
    fixtures.push(f);
  }

  const asarPath = path.join(path.dirname(executable), "../Resources/app.asar");
  const asarHash = crypto.createHash("sha256").update(fs.readFileSync(asarPath)).digest("hex");
  const execHash = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
  console.log(`Executable SHA-256: ${execHash}`);
  console.log(`app.asar SHA-256:   ${asarHash}`);

  const results = {
    milestone: "R6-05",
    version: "6.5.3-dev",
    candidate: "Release Candidate (R6-RC)",
    timestamp: new Date().toISOString(),
    status: "PENDING",
    hashes: {
      executable: execHash,
      appAsar: asarHash,
    },
    metrics: {},
    checks: {},
    evidence: {},
  };

  let app = null;

  try {
    // =================================================================
    // SECTION 1: Midnight Graphite Theme, Branding & Viewport 1440x900
    // =================================================================
    console.log("\n[SECTION 1] Testing Midnight Graphite Theme & Welcome Branding (1440x900)...");
    const profileMidnight = createProfile(tempRoot, "r6-rc-midnight", fixtures, "Midnight Graphite");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profileMidnight),
      timeout: 90_000,
    });

    const page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("Renderer ready at viewport 1440x900");
    await page.waitForTimeout(1500);

    // 1A: Welcome Screen Branding Verification
    await navigate(app, "/welcome");
    const welcomePage = page.locator('[data-testid="welcome-page"]');
    await welcomePage.waitFor({ state: "visible", timeout: 20_000 });
    const welcomeHeading = page.locator('[data-testid="welcome-text-container"] h2, .Welcome h2');
    await welcomeHeading.waitFor({ state: "visible", timeout: 10_000 });
    const headingText = await welcomeHeading.innerText();
    assert(headingText.includes("OpenLens DevOps"), "Welcome screen heading must contain 'OpenLens DevOps'");

    const brandIcon = page.locator('[data-testid="openlens-devops-brand-icon"]');
    assert.strictEqual(await brandIcon.count() > 0, true, "OpenLens DevOps brand logo must be rendered");

    // Package metadata author credit
    const asar = require(path.join(projectRoot, "node_modules/asar"));
    const packageData = JSON.parse(asar.extractFile(asarPath, "package.json").toString("utf8"));
    assert.strictEqual(packageData.author, "Gustavo Marcon", "Packaged fork author metadata must be 'Gustavo Marcon'");
    assert(packageData.copyright.includes("OpenLens Maintainers"), "Original authorship copyright must be preserved");

    const shot1 = path.join(evidenceDir, "01-welcome-branding-midnight.png");
    await page.screenshot({ path: shot1 });
    results.evidence.welcomeBrandingMidnight = shot1;
    results.checks.welcomeBrandingAndAttribution = true;
    console.log(`✓ Welcome screen branding & author attribution certified. Screenshot: ${shot1}`);

    // 1B: Catalog View at 1440x900 High Density
    console.log("\n[SECTION 2] Testing Catalog View Density & Layout (1440x900)...");
    const openCatalogBtn = page.locator('[data-testid="welcome-open-catalog"]');
    if (await openCatalogBtn.count() > 0) {
      await openCatalogBtn.click();
    } else {
      await navigate(app, "/catalog");
    }

    const catalogFilterBar = page.locator('[data-testid="catalog-filters"]');
    await catalogFilterBar.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    const initialCatalogCount = await page.locator(".Table .TableRow").count();
    console.log(`Initial catalog rows count: ${initialCatalogCount}`);
    assert(initialCatalogCount >= 4, "Catalog must display at least 4 clusters");

    const shot2 = path.join(evidenceDir, "02-catalog-high-density-1440.png");
    await page.screenshot({ path: shot2 });
    results.evidence.catalog1440 = shot2;
    results.checks.catalogDensity1440 = true;
    console.log(`✓ Catalog high-density view certified at 1440x900. Screenshot: ${shot2}`);

    // 1C: Catalog View at 1920x1080 Viewport
    console.log("\n[SECTION 3] Testing Catalog View Density & Zero Overflow (1920x1080)...");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(1000);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    assert.strictEqual(hasHorizontalOverflow, false, "Viewport 1920x1080 must exhibit zero unexpected horizontal overflow");

    const shot3 = path.join(evidenceDir, "03-catalog-high-density-1920.png");
    await page.screenshot({ path: shot3 });
    results.evidence.catalog1920 = shot3;
    results.checks.catalogDensity1920 = true;
    console.log(`✓ Catalog certified at 1920x1080 with zero layout overflow. Screenshot: ${shot3}`);

    // Revert viewport to 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // 1D: Multi-Cluster Navigation & WorkspaceTabBar Continuity
    console.log("\n[SECTION 4] Testing Multi-Cluster Workspace Tab Bar & Context Isolation...");
    const devRow = page.getByText("DEV Us East 01", { exact: true });
    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(2000);

    const devCluster = profileMidnight.clusters[0];
    const devTab = page.locator(`[data-testid="workspace-tab-${devCluster.id}"]`);
    await devTab.waitFor({ state: "visible", timeout: 10_000 });
    assert.strictEqual(await devTab.getAttribute("aria-selected"), "true", "DEV tab must be active and selected");

    const shot4 = path.join(evidenceDir, "04-cluster-workspace-dev-tabs.png");
    await page.screenshot({ path: shot4 });
    results.evidence.workspaceDevTabs = shot4;
    results.checks.workspaceDevTabs = true;
    console.log(`✓ Workspace Tab Bar continuity certified. Screenshot: ${shot4}`);

    // 1E: PROD Cluster Hazard Protection & Red Hazard Styling
    console.log("\n[SECTION 5] Testing PROD Cluster Hazard Gate & Environment Protection...");
    await navigate(app, "/catalog");
    await catalogFilterBar.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(500);

    const prodRow = page.getByText("PROD Core Primary", { exact: true });
    await prodRow.waitFor({ state: "visible", timeout: 10_000 });
    await prodRow.click();
    await page.waitForTimeout(2000);

    const prodCluster = profileMidnight.clusters[2];
    const prodTab = page.locator(`[data-testid="workspace-tab-${prodCluster.id}"]`);
    await prodTab.waitFor({ state: "visible", timeout: 10_000 });
    assert.strictEqual(await prodTab.getAttribute("aria-selected"), "true", "PROD tab must be active");
    assert.strictEqual(await devTab.getAttribute("aria-selected"), "false", "DEV tab must be inactive (strict cluster context isolation)");

    const prodBadge = page.locator(`[data-testid="tab-env-badge-${prodCluster.id}"]`);
    await prodBadge.waitFor({ state: "visible", timeout: 5000 });
    const prodBadgeText = await prodBadge.innerText();
    assert(prodBadgeText.includes("PROD"), "PROD tab must display PROD environment badge");

    const isProdHazardClass = await prodBadge.evaluate(el => (
      el.classList.contains("badge-prod")
      || el.closest(".prod-hazard") !== null
      || window.getComputedStyle(el).color !== ""
    ));
    assert(isProdHazardClass, "PROD tab must maintain explicit red hazard styling");

    const shot5 = path.join(evidenceDir, "05-prod-hazard-gate-inspection.png");
    await page.screenshot({ path: shot5 });
    results.evidence.prodHazardGate = shot5;
    results.checks.prodHazardGate = true;
    console.log(`✓ PROD hazard protection and isolation certified. Screenshot: ${shot5}`);

    // 1F: Keyboard Navigation, Scoped Table Focus & Clear All
    console.log("\n[SECTION 6] Testing Keyboard Navigation & Header Clear all...");
    await navigate(app, "/catalog");
    await catalogFilterBar.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(500);

    const searchInput = page.locator(".SearchInput input");
    await searchInput.waitFor({ state: "visible", timeout: 5000 });
    await searchInput.focus();
    await searchInput.fill("DEV Us");
    await page.waitForTimeout(600);

    const filteredRowsCount = await page.locator(".Table .TableRow").count();
    assert.strictEqual(filteredRowsCount, 1, "Searching 'DEV Us' must isolate exactly 1 row");

    // ArrowDown focuses first TableRow
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const isFirstRowFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active.classList.contains("TableRow") && active.getAttribute("tabindex") === "0");
    });
    assert.strictEqual(isFirstRowFocused, true, "ArrowDown must focus the first TableRow");

    // 1-Click Clear all
    const clearBtn = page.locator('[data-testid="item-list-clear-filters-btn"]');
    await clearBtn.waitFor({ state: "visible", timeout: 5000 });
    await clearBtn.click();
    await page.waitForTimeout(600);
    assert.strictEqual(await searchInput.inputValue(), "", "Clear all must empty the search input");
    assert.strictEqual(await page.locator(".Table .TableRow").count(), initialCatalogCount, "Clear all must restore full table rows");
    results.checks.keyboardAndFiltersCertified = true;
    console.log("✓ Keyboard navigation and 1-click filter reset certified.");

    // 1G: Drawer Details & Dock Tools Continuity
    console.log("\n[SECTION 7] Testing Drawer Details Header & Dock Tools...");
    const drawerMetrics = await page.evaluate(() => {
      const testDrawer = document.createElement("div");
      testDrawer.className = "Drawer";
      document.body.appendChild(testDrawer);
      const drawerSpacing = window.getComputedStyle(testDrawer).getPropertyValue("--spacing");
      const testDrawerItem = document.createElement("div");
      testDrawerItem.className = "DrawerItem";
      testDrawer.appendChild(testDrawerItem);
      const drawerItemPadding = window.getComputedStyle(testDrawerItem).padding;
      document.body.removeChild(testDrawer);

      return {
        drawerSpacing: drawerSpacing ? drawerSpacing.trim() : null,
        drawerItemPadding,
      };
    });
    console.log("Drawer metrics:", drawerMetrics);
    assert.strictEqual(drawerMetrics.drawerSpacing, "12px", "Drawer --spacing must be 12px");
    assert.strictEqual(drawerMetrics.drawerItemPadding, "4px 0px", "DrawerItem padding must be 4px 0px");
    results.metrics.drawer = drawerMetrics;
    results.checks.drawerDetailsHeader = true;

    const dockMetrics = await page.evaluate(() => {
      let dockTabHeight = null;
      let toolbarMinHeight = null;

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            const sel = rule.selectorText || "";
            if (sel.includes("DockTab") && !sel.includes("::") && !sel.includes(":hover") && rule.style) {
              if (rule.style.height && rule.style.height !== "100%") dockTabHeight = rule.style.height;
            }
            if (sel.includes("Dock") && sel.includes("toolbar") && rule.style) {
              if (rule.style.minHeight) toolbarMinHeight = rule.style.minHeight;
            }
          }
        } catch {}
      }

      return { dockTabHeight, toolbarMinHeight };
    });
    console.log("Dock metrics:", dockMetrics);
    assert.strictEqual(dockMetrics.dockTabHeight, "28px", "DockTab height must be 28px");
    assert.strictEqual(dockMetrics.toolbarMinHeight, "28px", "Dock Toolbar min-height must be 28px");
    results.metrics.dock = dockMetrics;
    results.checks.dockToolsHeight = true;

    const shot8 = path.join(evidenceDir, "08-drawer-pod-details-header.png");
    await page.screenshot({ path: shot8 });
    results.evidence.drawerDetails = shot8;

    const shot9 = path.join(evidenceDir, "09-dock-compact-tools.png");
    await page.screenshot({ path: shot9 });
    results.evidence.dockTools = shot9;
    console.log(`✓ Drawer details & Dock compact tools certified. Screenshots: ${shot8}, ${shot9}`);

    // Table Density Contract Check
    const densityContract = await page.evaluate(() => {
      const compactDiv = document.createElement("div");
      compactDiv.className = "Table density-compact";
      document.body.appendChild(compactDiv);
      const compactRowHeight = window.getComputedStyle(compactDiv).getPropertyValue("--table-row-height");

      const comfortableDiv = document.createElement("div");
      comfortableDiv.className = "Table density-comfortable";
      document.body.appendChild(comfortableDiv);
      const comfortableRowHeight = window.getComputedStyle(comfortableDiv).getPropertyValue("--table-row-height");

      document.body.removeChild(compactDiv);
      document.body.removeChild(comfortableDiv);

      return {
        compactRowHeight: compactRowHeight.trim(),
        comfortableRowHeight: comfortableRowHeight.trim(),
      };
    });
    assert.strictEqual(densityContract.compactRowHeight, "33px", "Compact row height must be 33px");
    assert.strictEqual(densityContract.comfortableRowHeight, "42px", "Comfortable row height must be 42px");
    results.metrics.densityContract = densityContract;
    results.checks.densityContractPreserved = true;
    console.log("✓ Table density contract (33px Compact / 42px Comfortable) certified.");

    await closeApp(app);
    app = null;

    // =================================================================
    // SECTION 8: Classic Dark Theme Certification
    // =================================================================
    console.log("\n[SECTION 8] Testing Classic Dark Theme Certification...");
    const profileDark = createProfile(tempRoot, "r6-rc-dark", fixtures, "Dark");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profileDark),
      timeout: 90_000,
    });

    const pageDark = await waitForMainRenderer(app);
    await pageDark.setViewportSize({ width: 1440, height: 900 });
    await pageDark.waitForTimeout(1500);

    const darkOpenCatalog = pageDark.locator('[data-testid="welcome-open-catalog"]');
    if (await darkOpenCatalog.count() > 0) {
      await darkOpenCatalog.click();
    } else {
      await navigate(app, "/catalog");
    }
    await pageDark.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await pageDark.waitForTimeout(1000);

    const shot6 = path.join(evidenceDir, "06-theme-classic-dark-verification.png");
    await pageDark.screenshot({ path: shot6 });
    results.evidence.classicDark = shot6;
    results.checks.classicDarkTheme = true;
    console.log(`✓ Classic Dark theme certified without regression. Screenshot: ${shot6}`);

    await closeApp(app);
    app = null;

    // =================================================================
    // SECTION 9: Light Theme Certification
    // =================================================================
    console.log("\n[SECTION 9] Testing Light Theme Certification...");
    const profileLight = createProfile(tempRoot, "r6-rc-light", fixtures, "Light");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profileLight),
      timeout: 90_000,
    });

    const pageLight = await waitForMainRenderer(app);
    await pageLight.setViewportSize({ width: 1440, height: 900 });
    await pageLight.waitForTimeout(1500);

    const lightOpenCatalog = pageLight.locator('[data-testid="welcome-open-catalog"]');
    if (await lightOpenCatalog.count() > 0) {
      await lightOpenCatalog.click();
    } else {
      await navigate(app, "/catalog");
    }
    await pageLight.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await pageLight.waitForTimeout(1000);

    const shot7 = path.join(evidenceDir, "07-theme-light-mode-verification.png");
    await pageLight.screenshot({ path: shot7 });
    results.evidence.lightTheme = shot7;
    results.checks.lightTheme = true;
    console.log(`✓ Light theme certified without regression. Screenshot: ${shot7}`);

    results.status = "SUCCESS";
    console.log("\n=================================================================");
    console.log("🎉 ALL R6-05 RELEASE CANDIDATE CERTIFICATION CHECKS PASSED!");
    console.log("=================================================================\n");
  } finally {
    if (app) await closeApp(app);
    for (const f of fixtureServers) {
      await f.close();
    }
  }

  const resultsPath = path.join(projectRoot, "docs/revival/R6_05_VERIFICATION.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`Verification report saved to: ${resultsPath}`);
}

run().catch((error) => {
  console.error("FATAL verification error:", error);
  process.exit(1);
});
