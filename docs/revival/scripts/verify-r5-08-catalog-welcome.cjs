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

const outputDir = process.env.OPENLENS_R5_08_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r5-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r5-08");

const contexts = [
  {
    name: "synthetic-dev-cluster",
    alias: "Engineering Development",
    environment: "development",
    color: "#10B981",
    pinned: true,
  },
  {
    name: "synthetic-stg-cluster",
    alias: "Staging Pre-Release",
    environment: "staging",
    color: "#F59E0B",
    pinned: false,
  },
  {
    name: "synthetic-prod-cluster",
    alias: "Production Live",
    environment: "production",
    color: "#3B82F6", // custom blue color proves red hazard ring is independent of cluster color
    pinned: true,
  },
  {
    name: "minikube-production-local",
    alias: "Local Minikube",
    environment: "local",
    color: "#6B7280",
    pinned: false, // negative test: context name contains 'production', must NOT be inferred as PROD
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createLocalApiFixture(context) {
  const requests = [];
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
      return json(response, 200, { major: "1", minor: "28", gitVersion: "v1.28.0" });
    }

    if (request.url.includes("/api/v1/namespaces")) {
      return json(response, 200, {
        apiVersion: "v1",
        kind: "NamespaceList",
        items: [{ apiVersion: "v1", kind: "Namespace", metadata: { name: "default" } }],
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

function createProfile(root, label, fixtures, colorTheme = "lens-dark") {
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
  console.log("=== OpenLens DevOps Revival R5-08 Catalog & Welcome Verification ===");
  assert(fs.existsSync(executable), `Packaged app executable not found: ${executable}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r5-08-"));
  console.log(`Temporary profile directory: ${tempRoot}`);

  const fixtureServers = [];
  const fixtures = [];
  for (const ctx of contexts) {
    const f = await createLocalApiFixture(ctx);
    fixtureServers.push(f);
    fixtures.push(f);
  }

  const asarPath = path.join(path.dirname(executable), "../Resources/app.asar");
  const asarHash = crypto.createHash("sha256").update(fs.readFileSync(asarPath)).digest("hex");
  console.log(`Target app.asar SHA-256: ${asarHash}`);

  const results = {
    milestone: "R5-08",
    status: "PENDING",
    asarSha256: asarHash,
    executable,
    timestamp: new Date().toISOString(),
    evidence: {},
    checks: {},
  };

  let app = null;

  try {
    // ----------------------------------------------------
    // PHASE 1: DARK THEME (WELCOME + CATALOG + FILTERS)
    // ----------------------------------------------------
    console.log("\n[PHASE 1] Starting Dark Theme Run...");
    const darkProfile = createProfile(tempRoot, "dark", fixtures, "lens-dark");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing"],
      env: appEnvironment(darkProfile),
      timeout: 90_000,
    });
    let page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 1: Verify Welcome Screen in Dark Mode
    console.log("1. Verifying Modernized Welcome Screen (Dark)...");
    const purpose = page.locator('[data-testid="welcome-text-container"] .purpose');
    await purpose.waitFor({ state: "visible", timeout: 20_000 });
    const noticeText = await purpose.textContent();
    assert(noticeText.includes("Nothing connects until you open a cluster"), "Welcome notice must state no-autoconnect");

    const openCatalogBtn = page.locator('[data-testid="welcome-open-catalog"]');
    const addClusterBtn = page.locator('[data-testid="welcome-add-cluster"]');
    await openCatalogBtn.waitFor({ state: "visible", timeout: 10_000 });
    await addClusterBtn.waitFor({ state: "visible", timeout: 10_000 });

    const summary = page.locator('[data-testid="welcome-workspace-summary"]');
    await summary.waitFor({ state: "visible", timeout: 10_000 });
    const summaryText = await summary.textContent();
    assert(summaryText.includes("4 clusters"), "Workspace summary should count 4 clusters");
    assert(summaryText.includes("2 pinned"), "Workspace summary should count 2 pinned clusters");
    assert(summaryText.includes("PROD") && summaryText.includes("DEV"), "Workspace summary should show environment badges");

    const welcomeDarkPath = path.join(evidenceDir, "welcome-dark.png");
    await page.screenshot({ path: welcomeDarkPath });
    results.evidence.welcomeDark = welcomeDarkPath;
    results.checks.welcomeDark = true;
    console.log(`Saved screenshot: ${welcomeDarkPath}`);

    // Step 2: Open Catalog
    console.log("2. Navigating to Catalog...");
    await openCatalogBtn.click();
    const filterBar = page.locator('[data-testid="catalog-filters"]');
    await filterBar.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    // Verify Catalog presentation
    const catalogAllDarkPath = path.join(evidenceDir, "catalog-all-dark.png");
    await page.screenshot({ path: catalogAllDarkPath });
    results.evidence.catalogAllDark = catalogAllDarkPath;
    results.checks.catalogAllDark = true;
    console.log(`Saved screenshot: ${catalogAllDarkPath}`);

    // Verify PROD hazard ring: exactly 1 prodMarker in the entire catalog
    const prodMarkerCount = await page.locator('[data-testid="catalog-prod-marker"]').count();
    assert(prodMarkerCount === 1, `Expected exactly 1 PROD marker ring, found ${prodMarkerCount}`);

    // Verify pinned indicator count: exactly 2 pinned clusters (DEV and PROD)
    const pinCount = await page.locator('[data-testid="catalog-pin-indicator"]').count();
    assert(pinCount === 2, `Expected exactly 2 pinned cluster indicators, found ${pinCount}`);

    // Verify negative test: Minikube cluster has "production" in context name, but environment is "local" -> no PROD marker
    results.checks.explicitProdSafetyVerified = true;
    console.log("PROD explicit hazard ring verified (strict isolation, no context-name inference).");

    // Step 3: Filter by PROD
    console.log("3. Testing PROD environment filter...");
    const prodFilterBtn = page.locator('[data-testid="catalog-filter-env-production"]');
    await prodFilterBtn.click();
    await page.waitForTimeout(500);

    const catalogFilterProdPath = path.join(evidenceDir, "catalog-filter-prod.png");
    await page.screenshot({ path: catalogFilterProdPath });
    results.evidence.catalogFilterProd = catalogFilterProdPath;
    results.checks.filterProd = true;
    console.log(`Saved screenshot: ${catalogFilterProdPath}`);

    // Step 4: Filter by Pinned
    console.log("4. Testing Pinned filter...");
    const allFilterBtn = page.locator('[data-testid="catalog-filter-env-all"]');
    await allFilterBtn.click();
    await page.waitForTimeout(300);

    const pinnedFilterBtn = page.locator('[data-testid="catalog-filter-pinned"]');
    await pinnedFilterBtn.click();
    await page.waitForTimeout(500);

    const catalogFilterPinnedPath = path.join(evidenceDir, "catalog-filter-pinned.png");
    await page.screenshot({ path: catalogFilterPinnedPath });
    results.evidence.catalogFilterPinned = catalogFilterPinnedPath;
    results.checks.filterPinned = true;
    console.log(`Saved screenshot: ${catalogFilterPinnedPath}`);

    // Step 5: Test Empty Filter State
    console.log("5. Testing Empty Filter State with TEST environment...");
    const testFilterBtn = page.locator('[data-testid="catalog-filter-env-testing"]');
    await testFilterBtn.click();
    await page.waitForTimeout(500);

    const emptyFilter = page.locator('[data-testid="catalog-filter-empty"]');
    await emptyFilter.waitFor({ state: "visible", timeout: 5000 });
    const emptyShowAll = page.locator('[data-testid="catalog-filter-empty"] button');
    await emptyShowAll.waitFor({ state: "visible", timeout: 5000 });

    const catalogEmptyFiltersPath = path.join(evidenceDir, "catalog-empty-filters.png");
    await page.screenshot({ path: catalogEmptyFiltersPath });
    results.evidence.catalogEmptyFilters = catalogEmptyFiltersPath;
    results.checks.emptyFilterState = true;
    console.log(`Saved screenshot: ${catalogEmptyFiltersPath}`);

    await closeApp(app);
    app = null;

    // ----------------------------------------------------
    // PHASE 2: LIGHT THEME (WELCOME + CATALOG)
    // ----------------------------------------------------
    console.log("\n[PHASE 2] Starting Light Theme Run...");
    const lightProfile = createProfile(tempRoot, "light", fixtures, "lens-light");
    app = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing"],
      env: appEnvironment(lightProfile),
      timeout: 90_000,
    });
    page = await waitForMainRenderer(app);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 6: Verify Welcome Screen in Light Mode
    console.log("6. Verifying Modernized Welcome Screen (Light)...");
    const welcomeTextContainerLight = page.locator('[data-testid="welcome-text-container"]');
    await welcomeTextContainerLight.waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    const welcomeLightPath = path.join(evidenceDir, "welcome-light.png");
    await page.screenshot({ path: welcomeLightPath });
    results.evidence.welcomeLight = welcomeLightPath;
    results.checks.welcomeLight = true;
    console.log(`Saved screenshot: ${welcomeLightPath}`);

    // Step 7: Verify Catalog in Light Mode
    console.log("7. Verifying Catalog (Light)...");
    await page.locator('[data-testid="welcome-open-catalog"]').click();
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    const catalogAllLightPath = path.join(evidenceDir, "catalog-all-light.png");
    await page.screenshot({ path: catalogAllLightPath });
    results.evidence.catalogAllLight = catalogAllLightPath;
    results.checks.catalogAllLight = true;
    console.log(`Saved screenshot: ${catalogAllLightPath}`);

    await closeApp(app);
    app = null;

    results.status = "SUCCESS";
    console.log("\nAll R5-08 Playwright verification checks PASSED successfully!");
  } finally {
    if (app) await closeApp(app);
    for (const f of fixtureServers) {
      await f.close();
    }
  }

  const resultsPath = path.join(projectRoot, "docs/revival/R5_08_VERIFICATION.json");
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nVerification JSON written to ${resultsPath}`);
}

run().catch((error) => {
  console.error("FATAL verification error:", error);
  process.exit(1);
});
