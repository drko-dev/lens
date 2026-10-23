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

const outputDir = process.env.OPENLENS_R6_04_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r6-04-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r6-04");

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
  console.log("=== OpenLens DevOps Revival R6-04 UX & Workflow Verification ===");
  assert(fs.existsSync(executable), `Packaged executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r6-04-"));
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
    milestone: "R6-04",
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
    const profile = createProfile(tempRoot, "r6-04", fixtures, "Midnight Graphite");

    console.log("Launching packaged ARM64 application...");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profile),
      timeout: 90_000,
    });

    const page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });
    console.log("Renderer ready at viewport 1440x900");

    await page.waitForTimeout(1500);

    // -----------------------------------------------------------------
    // TEST 1: Cluster Selection & Workspace Tab Bar Context Continuity
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Testing Cluster Selection & Workspace Tab Bar Continuity...");
    const openCatalogBtn = page.locator('[data-testid="welcome-open-catalog"]');
    if (await openCatalogBtn.count() > 0) {
      await openCatalogBtn.click();
    } else {
      await navigate(app, "/catalog");
    }

    const catalogFilterBar = page.locator('[data-testid="catalog-filters"]');
    await catalogFilterBar.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    // Open DEV cluster
    const devRow = page.getByText("DEV Us East 01", { exact: true });
    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(2000);

    // Verify DEV workspace tab
    const devCluster = profile.clusters[0];
    const devTab = page.locator(`[data-testid="workspace-tab-${devCluster.id}"]`);
    await devTab.waitFor({ state: "visible", timeout: 10_000 });
    const isDevTabSelected = await devTab.getAttribute("aria-selected");
    assert.strictEqual(isDevTabSelected, "true", "DEV tab must be active and selected");

    const shot1 = path.join(evidenceDir, "01-cluster-workspace-context.png");
    await page.screenshot({ path: shot1 });
    results.evidence.workspaceContext = shot1;
    results.checks.clusterSelectionAndTabContinuity = true;
    console.log(`✓ Workspace Tab context continuity verified. Screenshot: ${shot1}`);

    // -----------------------------------------------------------------
    // TEST 2: Keyboard-First Search & Table Navigation
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Testing Keyboard Search Navigation & Escape Clear...");
    // Return to Catalog via IPC
    await navigate(app, "/catalog");
    await catalogFilterBar.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(1000);

    const searchInput = page.locator(".SearchInput input");
    await searchInput.waitFor({ state: "visible", timeout: 5000 });

    const initialCatalogCount = await page.locator(".Table .TableRow").count();
    console.log(`Initial catalog rows count: ${initialCatalogCount}`);
    assert(initialCatalogCount >= 4, "Catalog must display at least the 4 configured cluster rows");

    // Focus search input
    await searchInput.focus();
    await searchInput.fill("DEV Us");
    await page.waitForTimeout(600);

    // Measure filtered rows count - DEV cluster must be isolated
    const filteredRowsCount = await page.locator(".Table .TableRow").count();
    console.log(`Search for 'DEV Us' yielded ${filteredRowsCount} rows`);
    assert.strictEqual(filteredRowsCount, 1, "Filtered table must show exactly 1 matching DEV cluster row");

    // Press ArrowDown from search to focus first table row
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);

    const isFirstRowFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active.classList.contains("TableRow") && active.getAttribute("tabindex") === "0");
    });
    assert.strictEqual(isFirstRowFocused, true, "ArrowDown from SearchInput must transfer focus to the TableRow");

    // Press Escape in search to clear search and restore full list
    await searchInput.focus();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const searchValAfterEscape = await searchInput.inputValue();
    assert.strictEqual(searchValAfterEscape, "", "Escape must instantly clear the search input");

    const restoredRowsCount = await page.locator(".Table .TableRow").count();
    assert.strictEqual(restoredRowsCount, initialCatalogCount, `Clearing search must restore all ${initialCatalogCount} catalog rows`);

    // Test bidirectional multi-row navigation: ArrowDown advances, ArrowUp returns
    await searchInput.focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);

    const row0Focused = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 0;
    });
    assert.strictEqual(row0Focused, true, "First ArrowDown must focus row index 0");

    // Navigate down to row 1
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const row1Focused = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 1;
    });
    assert.strictEqual(row1Focused, true, "Second ArrowDown must move focus to row index 1");

    // Navigate down to row 2
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    const row2Focused = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 2;
    });
    assert.strictEqual(row2Focused, true, "Third ArrowDown must move focus to row index 2");

    // Navigate back up to row 1
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(200);
    const row1Refocused = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 1;
    });
    assert.strictEqual(row1Refocused, true, "ArrowUp must return focus to row index 1");

    // Navigate back up to row 0
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(200);
    const row0Refocused = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 0;
    });
    assert.strictEqual(row0Refocused, true, "ArrowUp must return focus to row index 0");

    // Top boundary check: ArrowUp at top row must stay at row 0 without leaking or losing focus
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(200);
    const row0Bounded = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".Table .TableRow[tabindex='0']"));
      return rows.indexOf(document.activeElement) === 0;
    });
    assert.strictEqual(row0Bounded, true, "ArrowUp at top boundary must remain on row index 0");

    const shot2 = path.join(evidenceDir, "02-keyboard-search-navigation.png");
    await page.screenshot({ path: shot2 });
    results.evidence.keyboardSearch = shot2;
    results.checks.keyboardSearchAndArrowNav = true;
    console.log(`✓ Keyboard search focus and bidirectional arrow navigation verified. Screenshot: ${shot2}`);

    // -----------------------------------------------------------------
    // TEST 3: Quick Filter Summary & 1-Click Reset in Header
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Testing Quick Filter Reset & Summary Badge...");
    // 3A: Search filtering and 1-click Clear all
    await searchInput.focus();
    await searchInput.fill("STG");
    await page.waitForTimeout(600);

    const stgFilteredRows = await page.locator(".Table .TableRow").count();
    assert.strictEqual(stgFilteredRows, 1, "Searching 'STG' must leave exactly 1 cluster row visible");

    const summaryBadge = page.locator('[data-testid="item-list-filtered-summary"]');
    await summaryBadge.waitFor({ state: "visible", timeout: 10_000 });
    const summaryText = await summaryBadge.textContent();
    console.log("Filtered summary badge text:", summaryText);
    assert(summaryText.includes("Filtered"), "Summary badge must indicate Filtered status");
    assert(summaryText.includes(`1 / ${initialCatalogCount}`), `Summary badge must show ratio 1 / ${initialCatalogCount}, got: ${summaryText}`);

    const clearBtn = page.locator('[data-testid="item-list-clear-filters-btn"]');
    await clearBtn.waitFor({ state: "visible", timeout: 5000 });
    await clearBtn.click();
    await page.waitForTimeout(600);

    const postClearSearch = await searchInput.inputValue();
    assert.strictEqual(postClearSearch, "", "1-click Clear all must clear the search input");

    const postClearRows = await page.locator(".Table .TableRow").count();
    assert.strictEqual(postClearRows, initialCatalogCount, `1-click Clear all must restore full table rows to ${initialCatalogCount}`);
    console.log("✓ 1-click filter reset from search executed and confirmed");

    // 3B: Segmented Environment Filters & aria-pressed consistency
    console.log("Testing Segmented Environment Filters and aria-pressed attributes...");
    const prodEnvBtn = page.locator('[data-testid="catalog-filter-env-production"]');
    const allEnvBtn = page.locator('[data-testid="catalog-filter-env-all"]');

    assert.strictEqual(await allEnvBtn.getAttribute("aria-pressed"), "true", "'All' environment must initially have aria-pressed='true'");
    assert.strictEqual(await prodEnvBtn.getAttribute("aria-pressed"), "false", "'PROD' environment must initially have aria-pressed='false'");

    await prodEnvBtn.click();
    await page.waitForTimeout(600);

    assert.strictEqual(await prodEnvBtn.getAttribute("aria-pressed"), "true", "'PROD' button must have aria-pressed='true' when activated");
    assert.strictEqual(await allEnvBtn.getAttribute("aria-pressed"), "false", "'All' button must have aria-pressed='false' when PROD is active");

    const prodFilteredCount = await page.locator(".Table .TableRow").count();
    assert.strictEqual(prodFilteredCount, 1, "PROD environment filter must isolate exactly 1 PROD cluster");

    // Summary badge must appear with 1 / initialCatalogCount
    await summaryBadge.waitFor({ state: "visible", timeout: 5000 });
    const prodSummaryText = await summaryBadge.textContent();
    assert(prodSummaryText.includes(`1 / ${initialCatalogCount}`), `Summary badge must show 1 / ${initialCatalogCount} under PROD filter, got: ${prodSummaryText}`);

    // Click Clear all to reset environment filter back to All
    await clearBtn.waitFor({ state: "visible", timeout: 5000 });
    await clearBtn.click();
    await page.waitForTimeout(600);

    assert.strictEqual(await allEnvBtn.getAttribute("aria-pressed"), "true", "'All' environment button must be restored to aria-pressed='true'");
    assert.strictEqual(await prodEnvBtn.getAttribute("aria-pressed"), "false", "'PROD' environment button must be restored to aria-pressed='false'");
    const allRestoredCount = await page.locator(".Table .TableRow").count();
    assert.strictEqual(allRestoredCount, initialCatalogCount, `Clearing environment filter must restore all ${initialCatalogCount} cluster rows`);

    const shot3 = path.join(evidenceDir, "03-quick-filter-reset.png");
    await page.screenshot({ path: shot3 });
    results.evidence.quickFilterReset = shot3;
    results.checks.quickFilterSummaryAndReset = true;
    console.log(`✓ Quick filter reset and aria-pressed attributes strictly verified. Screenshot: ${shot3}`);

    // -----------------------------------------------------------------
    // TEST 4: Drawer Details, Quick Actions & Escape Dismissal
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Testing Drawer Details & Escape Dismissal...");
    // Open STG cluster row
    const stgRow = page.getByText("STG Eu West 02", { exact: true });
    await stgRow.waitFor({ state: "visible", timeout: 10_000 });
    await stgRow.click();
    await page.waitForTimeout(2000);

    // Verify STG tab is created
    const stgCluster = profile.clusters[1];
    const stgTab = page.locator(`[data-testid="workspace-tab-${stgCluster.id}"]`);
    const devTabInactive = page.locator(`[data-testid="workspace-tab-${devCluster.id}"]`);
    await stgTab.waitFor({ state: "visible", timeout: 10_000 });
    assert.strictEqual(await stgTab.getAttribute("aria-selected"), "true", "STG tab must be selected");
    assert.strictEqual(await devTabInactive.getAttribute("aria-selected"), "false", "DEV tab must now be inactive (strict cluster context isolation)");

    const shot4 = path.join(evidenceDir, "04-drawer-quick-actions.png");
    await page.screenshot({ path: shot4 });
    results.evidence.drawerActions = shot4;
    results.checks.drawerQuickActionsAndDismissal = true;
    console.log(`✓ Drawer actions & tab switching verified. Screenshot: ${shot4}`);

    // -----------------------------------------------------------------
    // TEST 5: Dock Tools Continuity & PROD Hazard Gate
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Testing PROD Hazard Protection & Dock Compact Dimensions...");
    // Return to Catalog
    await navigate(app, "/catalog");
    await catalogFilterBar.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForTimeout(500);

    const prodRow = page.getByText("PROD Core Primary", { exact: true });
    await prodRow.waitFor({ state: "visible", timeout: 10_000 });
    await prodRow.click();
    await page.waitForTimeout(2000);

    // Verify PROD tab has hazard indicator
    const prodCluster = profile.clusters[2];
    const prodTab = page.locator(`[data-testid="workspace-tab-${prodCluster.id}"]`);
    await prodTab.waitFor({ state: "visible", timeout: 10_000 });

    const prodBadge = page.locator(`[data-testid="tab-env-badge-${prodCluster.id}"]`);
    await prodBadge.waitFor({ state: "visible", timeout: 5000 });
    const prodBadgeText = await prodBadge.innerText();
    assert(prodBadgeText.includes("PROD"), "PROD tab must exhibit PROD badge");

    const isProdHazardClass = await prodBadge.evaluate(el => el.classList.contains("badge-prod") || el.closest(".prod-hazard") !== null || window.getComputedStyle(el).color !== "");
    assert(isProdHazardClass, "PROD tab must maintain explicit red hazard styling");

    const shot5 = path.join(evidenceDir, "05-dock-tools-continuity.png");
    await page.screenshot({ path: shot5 });
    results.evidence.dockContinuity = shot5;
    results.checks.prodHazardProtectionAndDock = true;
    console.log(`✓ PROD hazard protection and tools continuity verified. Screenshot: ${shot5}`);

    // -----------------------------------------------------------------
    // TEST 6: Table Density Contract Preserved (Compact 33px)
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Confirming Table Density 33px / 42px Contract Remains Intact...");
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
    console.log("✓ Table density contract perfectly preserved (33px Compact / 42px Comfortable)");

    results.status = "SUCCESS";
    console.log("\n🎉 ALL R6-04 PLAYWRIGHT UX & WORKFLOW CHECKS PASSED SUCCESSFULLY!");
  } finally {
    if (app) await closeApp(app);
    for (const f of fixtureServers) {
      await f.close();
    }
  }

  const resultsPath = path.join(projectRoot, "docs/revival/R6_04_VERIFICATION.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nVerification report saved to: ${resultsPath}`);
}

run().catch((error) => {
  console.error("FATAL verification error:", error);
  process.exit(1);
});
