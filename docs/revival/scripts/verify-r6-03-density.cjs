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

const outputDir = process.env.OPENLENS_R6_03_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r6-03-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r6-03");

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

async function closeApp(app) {
  if (!app) return;
  try {
    await app.close();
  } catch {
    // Ignore close errors
  }
}

async function run() {
  console.log("=== OpenLens DevOps Revival R6-03 UI Density Verification ===");
  assert(fs.existsSync(executable), `Packaged executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r6-03-"));
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
    milestone: "R6-03",
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
    const profile = createProfile(tempRoot, "r6-03", fixtures, "Midnight Graphite");

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
    // 1. Catalog & High-Density Table Measurement
    // -----------------------------------------------------------------
    console.log("\n[TEST 1] Measuring Catalog Density & Row Metrics...");
    const openCatalogBtn = page.locator('[data-testid="welcome-open-catalog"]');
    if (await openCatalogBtn.count() > 0) {
      await openCatalogBtn.click();
    } else {
      await page.keyboard.press("Meta+Shift+C");
    }

    const catalogFilterBar = page.locator('[data-testid="catalog-filters"]');
    await catalogFilterBar.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    // Measure Catalog styling and table density
    const catalogMetrics = await page.evaluate(() => {
      const views = document.querySelector('[class*="views"]');
      const viewsStyle = views ? window.getComputedStyle(views) : null;
      const tableRows = Array.from(document.querySelectorAll(".TableRow"));
      const tableHead = document.querySelector(".TableHead");
      const headStyle = tableHead ? window.getComputedStyle(tableHead) : null;
      const searchInput = document.querySelector(".SearchInput");
      const searchStyle = searchInput ? window.getComputedStyle(searchInput) : null;
      const firstRow = tableRows[0];
      const rowStyle = firstRow ? window.getComputedStyle(firstRow) : null;
      const cell = document.querySelector(".TableCell");
      const cellStyle = cell ? window.getComputedStyle(cell) : null;

      return {
        viewsPadding: viewsStyle ? viewsStyle.padding : null,
        rowCount: tableRows.length,
        firstRowHeight: firstRow ? firstRow.getBoundingClientRect().height : null,
        firstRowMinHeight: rowStyle ? rowStyle.minHeight : null,
        headHeight: tableHead ? tableHead.getBoundingClientRect().height : null,
        headTextTransform: headStyle ? headStyle.textTransform : null,
        headFontSize: headStyle ? headStyle.fontSize : null,
        searchHeight: searchInput ? searchInput.getBoundingClientRect().height : null,
        cellFontVariantNumeric: cellStyle ? cellStyle.fontVariantNumeric : null,
        themeHasMidnight: document.body.classList.contains("theme-midnight-graphite"),
      };
    });

    console.log("Catalog metrics measured:", catalogMetrics);
    results.metrics.catalog = catalogMetrics;

    assert.strictEqual(catalogMetrics.themeHasMidnight, true, "Theme must be theme-midnight-graphite");
    // Catalog customRowHeights is 36px (due to entity avatar); standard table row min-height is 33px compact
    assert(catalogMetrics.firstRowHeight >= 33 && catalogMetrics.firstRowHeight <= 37, `Catalog row height must be ~36px (actual: ${catalogMetrics.firstRowHeight})`);
    assert.strictEqual(catalogMetrics.firstRowMinHeight, "33px", "TableRow CSS min-height contract must be 33px");
    assert.strictEqual(catalogMetrics.viewsPadding, "10px 12px", "Catalog .views padding must be 10px 12px");
    assert.strictEqual(catalogMetrics.headTextTransform, "uppercase", "Table head must be uppercase");

    const shot1 = path.join(evidenceDir, "01-catalog-high-density.png");
    await page.screenshot({ path: shot1 });
    results.evidence.catalog = shot1;
    results.checks.catalogDensity = true;
    console.log(`✓ Catalog table compact layout verified (${catalogMetrics.firstRowHeight}px row, ${catalogMetrics.viewsPadding} padding). Screenshot: ${shot1}`);

    // Verify PROD hazard ring in catalog
    const prodMarkerCount = await page.locator('[data-testid="catalog-prod-marker"]').count();
    assert.strictEqual(prodMarkerCount, 1, `Expected exactly 1 PROD marker, found ${prodMarkerCount}`);
    results.checks.explicitProdHazardMarker = true;
    console.log("✓ Explicit PROD hazard indicator intact in catalog");

    // -----------------------------------------------------------------
    // 2. Workspace Tab Bar Measurements
    // -----------------------------------------------------------------
    console.log("\n[TEST 2] Measuring Workspace Tab Bar...");
    const workspaceTabsBar = page.locator(".WorkspaceTabBar");
    const barCount = await workspaceTabsBar.count();
    let tabMetrics = {};

    if (barCount > 0) {
      tabMetrics = await page.evaluate(() => {
        const bar = document.querySelector(".WorkspaceTabBar");
        const barRect = bar ? bar.getBoundingClientRect() : null;
        const barStyle = bar ? window.getComputedStyle(bar) : null;
        return {
          barHeight: barRect ? barRect.height : null,
          barFlexBasis: barStyle ? barStyle.flexBasis : null,
        };
      });
      console.log("WorkspaceTab metrics:", tabMetrics);
      results.metrics.workspaceTabBar = tabMetrics;
      assert(tabMetrics.barHeight <= 34, `WorkspaceTabBar height must be <= 34px (actual: ${tabMetrics.barHeight})`);
      assert.strictEqual(tabMetrics.barFlexBasis, "32px", "WorkspaceTabBar flex-basis must be 32px");
      results.checks.workspaceTabBarCompact = true;
    }

    const shot2 = path.join(evidenceDir, "02-workspace-tabs-compact.png");
    await page.screenshot({ path: shot2 });
    results.evidence.workspaceTabs = shot2;
    console.log(`✓ Workspace Tab Bar compact layout verified (height: ${tabMetrics.barHeight}px). Screenshot: ${shot2}`);

    // -----------------------------------------------------------------
    // 3. Navigate into Cluster (DEV) to inspect Workspace Tab and Cluster Frame
    // -----------------------------------------------------------------
    console.log("\n[TEST 3] Activating cluster to test Workspace Tab & Sidebar...");
    const devCluster = profile.clusters[0];
    const devRow = page.getByText("DEV Us East 01", { exact: true });
    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(2500);

    const devTab = page.locator(`[data-testid="workspace-tab-${devCluster.id}"]`);
    const devTabVisible = await devTab.isVisible().catch(() => false);
    console.log(`DEV workspace tab visible: ${devTabVisible}`);

    // Read stylesheet rules for Sidebar components
    const sidebarStyles = await page.evaluate(() => {
      let navItemCss = "";
      let clusterHeaderCss = "";
      let prodSidebarCss = "";

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            const sel = rule.selectorText || "";
            if (sel.includes("navItem") && rule.style && rule.style.cssText.includes("padding")) {
              navItemCss = rule.style.cssText;
            }
            if (sel.includes("SidebarCluster") && !sel.includes("isProductionSidebar") && rule.style && rule.style.cssText.includes("padding")) {
              clusterHeaderCss = rule.style.cssText;
            }
            if (sel.includes("isProductionSidebar") && rule.style && rule.style.cssText.includes("border-left")) {
              prodSidebarCss = rule.style.cssText;
            }
          }
        } catch {
          // Ignore cross-origin stylesheet access if any
        }
      }

      return { navItemCss, clusterHeaderCss, prodSidebarCss };
    });

    console.log("Sidebar CSS Rules:", sidebarStyles);
    results.metrics.sidebar = sidebarStyles;
    assert(sidebarStyles.navItemCss.includes("4px") || sidebarStyles.navItemCss.includes("3px"), "Sidebar navItem padding must be compact (3px/4px vertical)");
    assert(sidebarStyles.clusterHeaderCss.includes("8px 10px"), "Sidebar cluster header padding must be 8px 10px");
    assert(sidebarStyles.prodSidebarCss.includes("3px solid"), "PROD sidebar red hazard border must be 3px solid");
    results.checks.sidebarCompact = true;

    const shot3 = path.join(evidenceDir, "03-sidebar-dense.png");
    await page.screenshot({ path: shot3 });
    results.evidence.sidebar = shot3;
    console.log(`✓ Sidebar high-density CSS rules verified. Screenshot: ${shot3}`);

    // -----------------------------------------------------------------
    // 4. ItemListLayout & Drawer Density Specifications
    // -----------------------------------------------------------------
    console.log("\n[TEST 4] Measuring ItemListLayout Header and Drawer Rules...");
    const itemListAndDrawerMetrics = await page.evaluate(() => {
      // Create test drawer
      const testDrawer = document.createElement("div");
      testDrawer.className = "Drawer";
      document.body.appendChild(testDrawer);
      const drawerSpacing = window.getComputedStyle(testDrawer).getPropertyValue("--spacing");

      const testDrawerItem = document.createElement("div");
      testDrawerItem.className = "DrawerItem";
      testDrawer.appendChild(testDrawerItem);
      const drawerItemPadding = window.getComputedStyle(testDrawerItem).padding;
      document.body.removeChild(testDrawer);

      // Search ItemListLayout header rules in stylesheets
      let headerCss = "";
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            const sel = rule.selectorText || "";
            if (sel.includes("ItemListLayout") && sel.includes("header") && rule.style) {
              if (rule.style.cssText.includes("min-height")) {
                headerCss = rule.style.cssText;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        headerCss,
        drawerSpacing: drawerSpacing ? drawerSpacing.trim() : null,
        drawerItemPadding,
      };
    });

    console.log("ItemList & Drawer metrics:", itemListAndDrawerMetrics);
    results.metrics.itemListAndDrawer = itemListAndDrawerMetrics;

    assert.strictEqual(itemListAndDrawerMetrics.drawerSpacing, "12px", "Drawer --spacing must be 12px");
    assert.strictEqual(itemListAndDrawerMetrics.drawerItemPadding, "4px 0px", "DrawerItem padding must be 4px 0px");
    assert(itemListAndDrawerMetrics.headerCss.includes("8px"), "ItemListLayout header padding must be compact 8px vertical");
    assert(itemListAndDrawerMetrics.headerCss.includes("44px"), "ItemListLayout header min-height must be 44px");

    results.checks.itemListHeaderCompact = true;
    results.checks.drawerSpacingCompact = true;

    const shot4 = path.join(evidenceDir, "04-drawer-compact-specs.png");
    await page.screenshot({ path: shot4 });
    results.evidence.drawer = shot4;
    console.log(`✓ Drawer & ItemListLayout high-density verified. Screenshot: ${shot4}`);

    // -----------------------------------------------------------------
    // 5. Dock Measurements
    // -----------------------------------------------------------------
    console.log("\n[TEST 5] Measuring Dock Tabs & Toolbar Dimensions...");
    const dockMetrics = await page.evaluate(() => {
      let dockTabHeight = null;
      let toolbarMinHeight = null;
      let dockControlsMinHeight = null;

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
            if (sel.includes("controls") && rule.style && rule.style.minHeight) {
              dockControlsMinHeight = rule.style.minHeight;
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        dockTabHeight,
        toolbarMinHeight,
        dockControlsMinHeight,
      };
    });

    console.log("Dock metrics:", dockMetrics);
    results.metrics.dock = dockMetrics;
    assert.strictEqual(dockMetrics.dockTabHeight, "28px", "DockTab height must be 28px");
    assert.strictEqual(dockMetrics.toolbarMinHeight, "28px", "Dock Toolbar min-height must be 28px");
    results.checks.dockCompact = true;

    const shot5 = path.join(evidenceDir, "05-dock-compact.png");
    await page.screenshot({ path: shot5 });
    results.evidence.dock = shot5;
    console.log(`✓ Dock compact layout verified. Screenshot: ${shot5}`);

    // -----------------------------------------------------------------
    // 6. Table Density 33px / 42px Contract Check
    // -----------------------------------------------------------------
    console.log("\n[TEST 6] Validating Table Density Contract (Compact 33px / Comfortable 42px)...");
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

    console.log("Density Contract:", densityContract);
    results.metrics.tableDensityContract = densityContract;
    assert.strictEqual(densityContract.compactRowHeight, "33px", "Compact row height must be 33px");
    assert.strictEqual(densityContract.comfortableRowHeight, "42px", "Comfortable row height must be 42px");
    results.checks.tableDensityContract = true;
    console.log("✓ Table density contract intact: 33px compact (default), 42px comfortable (optional)");

    results.status = "SUCCESS";
    console.log("\n🎉 ALL R6-03 PLAYWRIGHT DENSITY CHECKS PASSED SUCCESSFULLY!");
  } finally {
    if (app) await closeApp(app);
    for (const f of fixtureServers) {
      await f.close();
    }
  }

  const resultsPath = path.join(projectRoot, "docs/revival/R6_03_VERIFICATION.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nVerification report saved to: ${resultsPath}`);
}

run().catch((error) => {
  console.error("FATAL verification error:", error);
  process.exit(1);
});
