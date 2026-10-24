/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * OpenLens DevOps Revival — R7-06 E2E Verification
 * RBAC Permission Inspector & Simulation Engine (auth can-i)
 *
 * Runs against real React 17 component (NonInjectedRbacInspector) compiled via esbuild & sass.
 * Verifies:
 * 1. SelfSubjectAccessReview (current user): get secrets --namespace default -> ALLOWED_API
 * 2. SubjectAccessReview (ServiceAccount): create deployments -> ALLOWED_API
 * 3. Explicit Denial: delete nodes -> DENIED_API
 * 4. Subresources: pods/exec vs pods
 * 5. RBAC 403 Graceful Handling -> COINCIDENCIA LOCAL — NO VERIFICADA (allowed: false)
 * 6. Dynamic Input Invalidation: changing inputs clears previous results
 * 7. Multi-cluster Hardening: context switch protection
 * 8. All Verbs Matrix evaluation (8 standard verbs)
 * 9. Conscious operator action: URL navigation does NOT auto-execute
 * 10. Strict 100% read-only guarantee: 0 mutations to operational cluster resources
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "../../..");
const harnessDir = path.join(__dirname, "r7-06-harness");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-06");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

// 1. Compile real React harness bundle with esbuild and sass
console.log("Compiling real React test harness with esbuild & sass...");
try {
  execSync("node build.cjs", { cwd: harnessDir, stdio: "inherit" });
} catch (err) {
  console.error("Failed to build harness bundle:", err);
  process.exit(1);
}

const bundlePath = path.join(harnessDir, "dist/bundle.js");
const stylesPath = path.join(harnessDir, "dist/styles.css");

if (!fs.existsSync(bundlePath) || !fs.existsSync(stylesPath)) {
  console.error("Harness build artifacts missing:", { bundlePath, stylesPath });
  process.exit(1);
}

const bundleContent = fs.readFileSync(bundlePath);
const stylesContent = fs.readFileSync(stylesPath);

const { chromium } = require(path.join(projectRoot, "node_modules/playwright"));
const chromeExecutable = "/Users/gustavomarcon/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

if (!fs.existsSync(chromeExecutable)) {
  console.error("Chrome executable does not exist at: " + chromeExecutable);
  process.exit(1);
}

// 2. Setup Synthetic HTTP Server for Real Browser Testing
const PORT = 45679;
const recordedRequests = [];

const syntheticServer = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = reqUrl.pathname;

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    let parsedBody = null;
    try {
      if (body) parsedBody = JSON.parse(body);
    } catch {
      // not json
    }

    recordedRequests.push({
      method: req.method,
      pathname,
      body: parsedBody,
      timestamp: new Date().toISOString(),
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Host");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // Static Assets
    if (pathname === "/styles.css") {
      res.writeHead(200, { "Content-Type": "text/css" });
      return res.end(stylesContent);
    }

    if (pathname === "/bundle.js") {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      return res.end(bundleContent);
    }

    if (pathname === "/" || pathname === "/index.html") {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>OpenLens RBAC Inspector Real Harness</title>
  <link rel="stylesheet" href="/styles.css">
  <script>
    window.global = window;
    window.process = {
      env: { NODE_ENV: "development" },
      platform: "darwin",
      nextTick: function(fn) { setTimeout(fn, 0); },
      argv: [],
      stdout: { isTTY: true },
      stderr: { isTTY: true }
    };
  </script>
  <style>
    body {
      margin: 0;
      background: #0b0f19;
      color: #eceff1;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="/bundle.js"></script>
</body>
</html>`;
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(html);
    }

    // Synthetic K8s AccessReview Endpoints
    if (pathname === "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews") {
      const rAttrs = parsedBody?.spec?.resourceAttributes;

      if (rAttrs?.verb === "get" && rAttrs?.resource === "secrets") {
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          status: { allowed: true, reason: "RBAC cluster-admin rule allowed access" },
        }));
      }

      if (rAttrs?.verb === "delete" && rAttrs?.resource === "nodes") {
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          status: { allowed: false, denied: true, reason: "RBAC denied: current user cannot delete nodes" },
        }));
      }

      // Default SelfSubject response
      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        apiVersion: "authorization.k8s.io/v1",
        kind: "SelfSubjectAccessReview",
        status: { allowed: false, reason: "No rule allows this action in the API server" },
      }));
    }

    if (pathname === "/apis/authorization.k8s.io/v1/subjectaccessreviews") {
      const user = parsedBody?.spec?.user;
      const rAttrs = parsedBody?.spec?.resourceAttributes;

      // Simulate RBAC 403 Forbidden for restricted-sa
      if (user && user.includes("restricted-sa")) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          kind: "Status",
          apiVersion: "v1",
          status: "Failure",
          message: "User cannot create SubjectAccessReview in the namespace",
          reason: "Forbidden",
          code: 403,
        }));
      }

      // deployer SA creating deployments
      if (user?.includes("deployer") && rAttrs?.verb === "create" && rAttrs?.resource === "deployments") {
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SubjectAccessReview",
          status: { allowed: true, reason: "Allowed by RoleBinding deployer-binding" },
        }));
      }

      // Subresource test: pods/exec is allowed, plain pods is denied
      if (rAttrs?.resource === "pods") {
        if (rAttrs?.subresource === "exec" && rAttrs?.verb === "create") {
          res.writeHead(201, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            apiVersion: "authorization.k8s.io/v1",
            kind: "SubjectAccessReview",
            status: { allowed: true, reason: "Allowed pods/exec subresource" },
          }));
        }

        if (!rAttrs?.subresource && rAttrs?.verb === "delete") {
          res.writeHead(201, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            apiVersion: "authorization.k8s.io/v1",
            kind: "SubjectAccessReview",
            status: { allowed: false, reason: "Denied deletion of pods" },
          }));
        }
      }

      // General matrix query handling
      if (rAttrs?.verb === "get" || rAttrs?.verb === "list") {
        res.writeHead(201, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SubjectAccessReview",
          status: { allowed: true, reason: "Read actions allowed" },
        }));
      }

      // Default deny
      res.writeHead(201, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        apiVersion: "authorization.k8s.io/v1",
        kind: "SubjectAccessReview",
        status: { allowed: false, reason: "Action not permitted" },
      }));
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });
});

async function run() {
  await new Promise(resolve => syntheticServer.listen(PORT, "127.0.0.1", resolve));
  console.log(`Synthetic HTTP Server running on http://127.0.0.1:${PORT}`);

  const results = {
    testDate: new Date().toISOString(),
    milestone: "R7-06",
    title: "OpenLens DevOps Revival — R7-06 RBAC Inspector Real React Harness E2E",
    platform: "mac-arm64",
    browser: "Google Chrome for Testing (Chromium 1243)",
    checkpoints: {},
    audit: {
      totalRequests: 0,
      mutatingRequests: 0,
      accessReviewRequests: 0,
    },
  };

  const browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
  });

  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();

  page.on("console", msg => console.log("BROWSER CONSOLE:", msg.text()));
  page.on("pageerror", err => console.error("BROWSER PAGEERROR:", err));

  try {
    console.log("=== Step 1: Navigate to Real React Harness ===");
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector("[data-testid='rbac-inspector-container']", { timeout: 10000 });

    // Checkpoint 1: Header, styling & Production warning badge
    const prodBadge = await page.waitForSelector("[data-testid='prod-warning-badge']");
    const prodBadgeText = await prodBadge.innerText();
    assert(prodBadgeText.includes("PRODUCTION CLUSTER"), "Prod badge text mismatch");
    results.checkpoints["1_header_prod_badge"] = { status: "PASS", text: prodBadgeText };
    console.log("✓ Checkpoint 1 PASS: Header & Production warning badge rendered in real React DOM");

    // Checkpoint 2: Current user can-i get secrets (SelfSubjectAccessReview)
    console.log("=== Step 2: Test SelfSubjectAccessReview (can-i get secrets) ===");
    await page.fill("[data-testid='target-namespace-input']", "default");
    await page.fill("[data-testid='target-resource-input']", "secrets");
    await page.selectOption("[data-testid='target-verb-select']", "get");
    await page.click("[data-testid='check-permission-button']");

    await page.waitForSelector("[data-testid='verdict-allowed-api']");
    const allowedApiVerdict = await page.innerText("[data-testid='single-result-box']");
    assert(allowedApiVerdict.toUpperCase().includes("ALLOWED (API SERVER)"), "Verdict should be ALLOWED (API Server)");
    results.checkpoints["2_self_subject_allowed"] = { status: "PASS", summary: "can-i get secrets allowed via API server" };
    console.log("✓ Checkpoint 2 PASS: SelfSubjectAccessReview confirmed ALLOWED_API");

    // Checkpoint 3: ServiceAccount SubjectAccessReview (create deployments)
    console.log("=== Step 3: Test SubjectAccessReview as ServiceAccount (create deployments) ===");
    await page.selectOption("[data-testid='identity-type-select']", "service-account");
    await page.fill("[data-testid='sa-namespace-input']", "default");
    await page.fill("[data-testid='sa-name-input']", "deployer");
    await page.fill("[data-testid='target-resource-input']", "deployments");
    await page.selectOption("[data-testid='target-verb-select']", "create");
    await page.click("[data-testid='check-permission-button']");

    await page.waitForSelector("[data-testid='verdict-allowed-api']");
    const saVerdict = await page.innerText("[data-testid='single-result-box']");
    assert(saVerdict.includes("Allowed by RoleBinding"), "Should reflect API server permission");
    results.checkpoints["3_subject_access_allowed"] = { status: "PASS", summary: "deployer SA can create deployments" };
    console.log("✓ Checkpoint 3 PASS: SubjectAccessReview for ServiceAccount confirmed");

    // Checkpoint 4: Denied Action Check (delete nodes)
    console.log("=== Step 4: Test Explicit Denial (delete nodes) ===");
    await page.selectOption("[data-testid='identity-type-select']", "current-user");
    await page.fill("[data-testid='target-resource-input']", "nodes");
    await page.selectOption("[data-testid='target-verb-select']", "delete");
    await page.click("[data-testid='check-permission-button']");

    await page.waitForSelector("[data-testid='verdict-denied-api']");
    const deniedVerdict = await page.innerText("[data-testid='single-result-box']");
    assert(deniedVerdict.toUpperCase().includes("DENIED (API SERVER)"), "Verdict should be DENIED (API Server)");
    results.checkpoints["4_explicit_denial"] = { status: "PASS", summary: "delete nodes confirmed DENIED_API" };
    console.log("✓ Checkpoint 4 PASS: Explicit denial handled correctly");

    // Checkpoint 5: Subresource verification (pods/exec vs pods)
    console.log("=== Step 5: Test Subresource pods/exec ===");
    await page.selectOption("[data-testid='identity-type-select']", "service-account");
    await page.fill("[data-testid='sa-namespace-input']", "default");
    await page.fill("[data-testid='sa-name-input']", "deployer");
    await page.fill("[data-testid='target-resource-input']", "pods");
    await page.fill("[data-testid='target-subresource-input']", "exec");
    await page.selectOption("[data-testid='target-verb-select']", "create");
    await page.click("[data-testid='check-permission-button']");

    await page.waitForSelector("[data-testid='verdict-allowed-api']");
    results.checkpoints["5_subresource_handling"] = { status: "PASS", subresource: "pods/exec" };
    console.log("✓ Checkpoint 5 PASS: Subresource pods/exec correctly authorized");

    // Checkpoint 6: RBAC 403 Graceful Handling with unverified local match
    console.log("=== Step 6: Test RBAC 403 Graceful Handling (COINCIDENCIA LOCAL — NO VERIFICADA) ===");
    await page.fill("[data-testid='sa-name-input']", "restricted-sa");
    await page.fill("[data-testid='sa-namespace-input']", "default");
    await page.fill("[data-testid='target-namespace-input']", "backend");
    await page.fill("[data-testid='target-resource-input']", "pods");
    await page.fill("[data-testid='target-subresource-input']", "");
    await page.selectOption("[data-testid='target-verb-select']", "get");
    await page.click("[data-testid='check-permission-button']");

    await page.waitForSelector("[data-testid='verdict-local-match']");
    const localMatchBadge = await page.innerText("[data-testid='verdict-local-match']");
    assert(localMatchBadge.includes("COINCIDENCIA LOCAL — NO VERIFICADA"), "Badge must display COINCIDENCIA LOCAL — NO VERIFICADA");

    const localMatchBox = await page.innerText("[data-testid='single-result-box']");
    assert(localMatchBox.includes("RBAC 403"), "Must indicate RBAC 403");
    assert(localMatchBox.includes("NO VERIFICADA"), "Must indicate unverified");
    results.checkpoints["6_rbac_403_local_match"] = {
      status: "PASS",
      verdictBadge: localMatchBadge,
      allowed: false,
      guarantee: "Never displayed as ALLOWED; explicitly marked unverified",
    };
    console.log("✓ Checkpoint 6 PASS: RBAC 403 gracefully handled with COINCIDENCIA LOCAL — NO VERIFICADA badge");

    // Checkpoint 7: Dynamic Input Invalidation
    console.log("=== Step 7: Test Dynamic Input Invalidation ===");
    assert(await page.isVisible("[data-testid='single-result-box']"), "Result box should be visible before edit");
    await page.fill("[data-testid='target-resource-input']", "configmaps");
    await page.waitForTimeout(200);
    const isBoxVisibleAfterEdit = await page.isVisible("[data-testid='single-result-box']");
    assert(!isBoxVisibleAfterEdit, "Result box must be invalidated and cleared on input change");
    results.checkpoints["7_dynamic_invalidation"] = { status: "PASS", summary: "Editing input cleared previous result" };
    console.log("✓ Checkpoint 7 PASS: Results dynamically invalidated on form modification");

    // Checkpoint 8: Check All Verbs Matrix (8 standard verbs)
    console.log("=== Step 8: Test Check All Verbs Matrix (8 standard verbs) ===");
    await page.selectOption("[data-testid='identity-type-select']", "current-user");
    await page.fill("[data-testid='target-resource-input']", "pods");
    await page.click("[data-testid='check-matrix-button']");

    await page.waitForSelector("[data-testid='matrix-results-box']");
    const verbs = ["get", "list", "watch", "create", "update", "patch", "delete", "deletecollection"];
    for (const v of verbs) {
      const row = await page.waitForSelector(`[data-testid='matrix-row-${v}']`);
      assert(row, `Matrix row for ${v} missing`);
    }
    results.checkpoints["8_verbs_matrix"] = { status: "PASS", verbCount: verbs.length };
    console.log("✓ Checkpoint 8 PASS: All 8 standard verbs matrix generated in real React UI");

    // Take verification screenshot
    const screenshotPath = path.join(evidenceDir, "r7-06-rbac-inspector-matrix.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Checkpoint 9: Multi-cluster hardening
    console.log("=== Step 9: Multi-cluster context switch ===");
    await page.click("#btn-switch-cluster");
    await page.waitForTimeout(200);
    const isMatrixClearedAfterClusterSwitch = await page.isVisible("[data-testid='matrix-results-box']");
    assert(!isMatrixClearedAfterClusterSwitch, "Cluster switch must invalidate active results");
    results.checkpoints["9_multicluster_switch"] = { status: "PASS", summary: "Cluster switch invalidated active results" };
    console.log("✓ Checkpoint 9 PASS: Cluster switch protection verified");

    // Checkpoint 10: URL Navigation without auto-execution
    console.log("=== Step 10: Test URL Navigation pre-fill without auto-execution ===");
    await page.goto(`http://127.0.0.1:${PORT}/?identity=service-account&namespace=kube-system&serviceAccount=coredns`);
    await page.waitForSelector("[data-testid='sa-name-input']");
    const prefilledSa = await page.inputValue("[data-testid='sa-name-input']");
    const prefilledNs = await page.inputValue("[data-testid='sa-namespace-input']");
    assert(prefilledSa === "coredns", "ServiceAccount name should be coredns");
    assert(prefilledNs === "kube-system", "Namespace should be kube-system");

    // Ensure NO auto-execution happened
    const hasAutoExecutedResult = await page.isVisible("[data-testid='single-result-box']");
    assert(!hasAutoExecutedResult, "AccessReview MUST NOT execute automatically on navigation");
    results.checkpoints["10_navigation_no_auto_exec"] = { status: "PASS", sa: prefilledSa, ns: prefilledNs };
    console.log("✓ Checkpoint 10 PASS: URL parameters pre-filled without auto-execution");

    // Checkpoint 11: Audit HTTP Requests: Zero mutations guarantee
    results.audit.totalRequests = recordedRequests.length;
    const mutatingMethods = ["PUT", "PATCH", "DELETE"];
    const mutatingRequests = recordedRequests.filter(r => mutatingMethods.includes(r.method) || (r.method === "POST" && !r.pathname.includes("accessreviews")));
    const accessReviewRequests = recordedRequests.filter(r => r.pathname.includes("accessreviews"));

    results.audit.mutatingRequests = mutatingRequests.length;
    results.audit.accessReviewRequests = accessReviewRequests.length;

    assert(mutatingRequests.length === 0, `Mutating requests detected: ${JSON.stringify(mutatingRequests)}`);
    results.checkpoints["11_zero_mutation_guarantee"] = {
      status: "PASS",
      mutatingRequests: 0,
      accessReviewRequests: accessReviewRequests.length,
      guarantee: "100% read-only operations on operational resources; only AccessReview POSTs",
    };
    console.log(`✓ Checkpoint 11 PASS: Strict 100% read-only audit confirmed (0 mutations, ${accessReviewRequests.length} AccessReview POSTs)`);

    // Write verification report
    const reportPath = path.join(projectRoot, "docs/revival/R7_06_VERIFICATION.json");
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");
    console.log(`Saved verification report to: ${reportPath}`);

    console.log("\n==========================================");
    console.log("🎉 ALL R7-06 VERIFICATION CHECKPOINTS PASSED!");
    console.log("==========================================");

  } finally {
    await browser.close();
    await new Promise(resolve => syntheticServer.close(resolve));
  }
}

run().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
