/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R7-02 E2E verification: Server-Side Dry-Run validation of YAML drafts.
 *
 * Runs against a locally packaged build (experimental ARM64 stage) and synthetic
 * Kubernetes API fixtures listening on 127.0.0.1. No real cluster is touched.
 *
 * Usage:
 *   node docs/revival/scripts/verify-r7-02-dry-run.cjs
 *   OPENLENS_R7_02_OUTPUT=open-lens/dist-r7-02-stage node ...
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));

const outputDir = process.env.OPENLENS_R7_02_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r7-02-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-02");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const contexts = [
  {
    name: "dev-cluster",
    alias: "DEV Dry-Run",
    environment: "development",
    color: "#10B981",
    pinned: true,
  },
  {
    name: "prod-cluster",
    alias: "PROD Dry-Run",
    environment: "production",
    color: "#EF4444",
    pinned: true,
  },
];

const SECRET_BASE64_VALUE = Buffer.from("fake-password-value").toString("base64");
const SECRET_PLAINTEXT_VALUE = "fake-token-value";

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function statusError(code, reason, message, causes) {
  return {
    apiVersion: "v1",
    kind: "Status",
    status: "Failure",
    message,
    reason,
    code,
    ...(causes ? { details: { causes } } : {}),
  };
}

function createLocalApiFixture(context) {
  const requests = [];
  const activeWatches = new Set();

  const namespaces = [
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "default", resourceVersion: "1", selfLink: "/api/v1/namespaces/default" }, status: { phase: "Active" } },
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "finance", resourceVersion: "1", selfLink: "/api/v1/namespaces/finance" }, status: { phase: "Active" } },
  ];

  const nodes = [
    {
      apiVersion: "v1",
      kind: "Node",
      metadata: {
        name: `${context.name}-node`,
        uid: `uid-node-${context.name}`,
        resourceVersion: "100",
        selfLink: `/api/v1/nodes/${context.name}-node`,
        labels: { "kubernetes.io/hostname": `${context.name}-node`, "kubernetes.io/os": "linux" },
      },
      spec: { unschedulable: false },
      status: {
        nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
        conditions: [{ type: "Ready", status: "True" }],
      },
    },
  ];

  const configMap = (name, data, resourceVersion = "1") => ({
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name,
      namespace: "default",
      uid: `uid-${name}`,
      resourceVersion,
      selfLink: `/api/v1/namespaces/default/configmaps/${name}`,
    },
    data,
  });

  const configMaps = [
    configMap("app-config", { key: "value", port: "8080" }),
    configMap("invalid-config", { port: "not-a-port" }),
    configMap("forbidden-config", { key: "value" }),
    configMap("webhook-config", { image: "nginx:latest" }),
  ];

  const secrets = [
    {
      apiVersion: "v1",
      kind: "Secret",
      type: "Opaque",
      metadata: {
        name: "app-secret",
        namespace: "default",
        uid: "uid-app-secret",
        resourceVersion: "1",
        selfLink: "/api/v1/namespaces/default/secrets/app-secret",
      },
      data: { password: SECRET_BASE64_VALUE },
    },
  ];

  const deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: "web-deploy",
      namespace: "default",
      uid: "uid-web-deploy",
      resourceVersion: "10",
      selfLink: "/apis/apps/v1/namespaces/default/deployments/web-deploy",
    },
    spec: {
      replicas: 2,
      selector: { matchLabels: { app: "web" } },
      template: {
        metadata: { labels: { app: "web" } },
        spec: { containers: [{ name: "web", image: "nginx:1.25" }] },
      },
    },
  };

  const pods = [];
  const pdbs = [];

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://127.0.0.1`);
    const isWatch = request.method === "GET" && requestUrl.searchParams.get("watch") === "true";
    const isDryRun = requestUrl.searchParams.get("dryRun") === "All";

    let body = "";
    let parsedBody;

    request.on("data", chunk => body += chunk);
    request.on("end", () => {
      try {
        parsedBody = body ? JSON.parse(body) : undefined;
      } catch {
        parsedBody = undefined;
      }

      if (request.method !== "GET" || isDryRun) {
        requests.push({
          method: request.method,
          pathname: requestUrl.pathname,
          search: requestUrl.search,
          dryRun: isDryRun,
          body: parsedBody,
        });
      } else {
        requests.push({ method: request.method, pathname: requestUrl.pathname, search: requestUrl.search, body: undefined });
      }

      handleRequest();
    });

    function findResource(collection, pathname) {
      const match = pathname.match(/\/([^/]+)$/);
      const name = match ? decodeURIComponent(match[1]) : undefined;

      return { name, item: collection.find(candidate => candidate.metadata.name === name) };
    }

    function dryRunConfigMap(name, submitted) {
      if (name === "invalid-config") {
        return json(response, 422, statusError(
          422,
          "Invalid",
          "ConfigMap \"invalid-config\" is invalid: data.port: Invalid value: \"not-a-port\": must be a valid port",
          [{ field: "data.port", message: "must be a valid port value between 1 and 65535" }],
        ));
      }

      if (name === "forbidden-config") {
        return json(response, 403, statusError(
          403,
          "Forbidden",
          "configmaps \"forbidden-config\" is forbidden: User \"dev@example\" cannot patch resource \"configmaps\"",
        ));
      }

      if (name === "webhook-config") {
        return json(response, 400, statusError(
          400,
          "Invalid",
          "admission webhook \"policy.example.com\" denied the request: image tag \"latest\" is not allowed",
        ));
      }

      return json(response, 200, {
        ...submitted,
        metadata: { ...submitted.metadata, resourceVersion: "999-dry-run" },
      });
    }

    function dryRunSecret(submitted) {
      const values = Object.values(submitted.data || {});
      const echoed = values[0] || SECRET_BASE64_VALUE;

      return json(response, 422, statusError(
        422,
        "Invalid",
        `Secret "app-secret" is invalid: data.password: Invalid value: "${echoed}": rejected by policy`,
        [{ field: "data.password", message: `value ${echoed} is not allowed` }],
      ));
    }

    function handleRequest() {
      const { pathname, searchParams } = requestUrl;

      if (request.method === "POST" && /selfsubject(access|rules)review/i.test(pathname)) {
        if (/rules/i.test(pathname)) {
          return json(response, 200, {
            apiVersion: "authorization.k8s.io/v1",
            kind: "SelfSubjectRulesReview",
            status: {
              incomplete: false,
              resourceRules: [{ verbs: ["*"], apiGroups: ["*"], resources: ["*"] }],
              nonResourceRules: [{ verbs: ["*"], nonResourceURLs: ["*"] }],
            },
          });
        }

        return json(response, 200, {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          status: { allowed: true },
        });
      }

      if (pathname === "/version") {
        return json(response, 200, {
          major: "1",
          minor: "31",
          gitVersion: "v1.31.0",
          gitCommit: "synthetic",
          platform: "darwin/arm64",
        });
      }

      if (pathname === "/api" || pathname === "/apis") {
        return json(response, 200, {
          kind: "APIVersions",
          versions: ["v1"],
          serverAddressByClientCIDRs: [],
          groups: [
            { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }], preferredVersion: { groupVersion: "apps/v1", version: "v1" } },
          ],
        });
      }

      if (pathname === "/apis/apps") {
        return json(response, 200, {
          kind: "APIGroup",
          apiVersion: "v1",
          name: "apps",
          versions: [{ groupVersion: "apps/v1", version: "v1" }],
          preferredVersion: { groupVersion: "apps/v1", version: "v1" },
        });
      }

      if (pathname === "/api/v1") {
        return json(response, 200, {
          kind: "APIResourceList",
          groupVersion: "v1",
          resources: [
            { name: "namespaces", singularName: "namespace", namespaced: false, kind: "Namespace", verbs: ["get", "list", "watch"] },
            { name: "nodes", singularName: "node", namespaced: false, kind: "Node", verbs: ["get", "list", "watch"] },
            { name: "pods", singularName: "pod", namespaced: true, kind: "Pod", verbs: ["get", "list", "watch"] },
            { name: "configmaps", singularName: "configmap", namespaced: true, kind: "ConfigMap", verbs: ["get", "list", "watch", "create", "update", "patch", "delete"] },
            { name: "secrets", singularName: "secret", namespaced: true, kind: "Secret", verbs: ["get", "list", "watch", "create", "update", "patch", "delete"] },
            { name: "events", singularName: "event", namespaced: true, kind: "Event", verbs: ["get", "list", "watch"] },
            { name: "services", singularName: "service", namespaced: true, kind: "Service", verbs: ["get", "list", "watch"] },
          ],
        });
      }

      if (pathname === "/apis/apps/v1") {
        return json(response, 200, {
          kind: "APIResourceList",
          groupVersion: "apps/v1",
          resources: [
            { name: "deployments", singularName: "deployment", namespaced: true, kind: "Deployment", verbs: ["get", "list", "watch", "create", "update", "patch", "delete"] },
            { name: "replicasets", singularName: "replicaset", namespaced: true, kind: "ReplicaSet", verbs: ["get", "list", "watch"] },
          ],
        });
      }

      if (isWatch) {
        activeWatches.add(response);
        response.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });

        const initial = pathname.includes("/configmaps")
          ? configMaps
          : pathname.includes("/secrets")
            ? secrets
            : pathname.includes("/deployments")
              ? [deployment]
              : pathname.includes("/nodes")
                ? nodes
                : pathname.includes("/namespaces")
                  ? namespaces
                  : [];

        for (const item of initial) {
          response.write(`${JSON.stringify({ type: "ADDED", object: item })}\n`);
        }

        response.on("close", () => activeWatches.delete(response));

        return;
      }

      if (pathname.startsWith("/api/v1/configmaps") || /\/namespaces\/[^/]+\/configmaps/.test(pathname)) {
        if (request.method === "GET") {
          if (/configmaps\/[^/]+$/.test(pathname)) {
            const { item } = findResource(configMaps, pathname);

            return item
              ? json(response, 200, item)
              : json(response, 404, statusError(404, "NotFound", "configmaps not found"));
          }

          return json(response, 200, {
            apiVersion: "v1",
            kind: "ConfigMapList",
            metadata: { resourceVersion: "1" },
            items: configMaps,
          });
        }

        if (request.method === "PUT") {
          const { name } = findResource(configMaps, pathname);

          if (isDryRun) {
            return dryRunConfigMap(name, parsedBody);
          }

          const target = configMaps.find(cm => cm.metadata.name === name);

          if (!target) {
            return json(response, 404, statusError(404, "NotFound", `configmaps "${name}" not found`));
          }

          const nextVersion = String(Number(target.metadata.resourceVersion) + 1);

          Object.assign(target, parsedBody, { metadata: { ...parsedBody.metadata, resourceVersion: nextVersion } });

          return json(response, 200, target);
        }
      }

      if (pathname.startsWith("/api/v1/secrets") || /\/namespaces\/[^/]+\/secrets/.test(pathname)) {
        if (request.method === "GET") {
          if (/secrets\/[^/]+$/.test(pathname)) {
            const { item } = findResource(secrets, pathname);

            return item
              ? json(response, 200, item)
              : json(response, 404, statusError(404, "NotFound", "secrets not found"));
          }

          return json(response, 200, {
            apiVersion: "v1",
            kind: "SecretList",
            metadata: { resourceVersion: "1" },
            items: secrets,
          });
        }

        if (request.method === "PUT") {
          if (isDryRun) {
            return dryRunSecret(parsedBody);
          }

          const target = secrets[0];

          target.metadata.resourceVersion = String(Number(target.metadata.resourceVersion) + 1);
          Object.assign(target, parsedBody, { metadata: { ...parsedBody.metadata, resourceVersion: target.metadata.resourceVersion } });

          return json(response, 200, target);
        }
      }

      if (pathname.includes("/deployments")) {
        if (request.method === "GET") {
          if (/deployments\/[^/]+$/.test(pathname)) {
            return json(response, 200, deployment);
          }

          return json(response, 200, {
            apiVersion: "apps/v1",
            kind: "DeploymentList",
            metadata: { resourceVersion: "10" },
            items: [deployment],
          });
        }

        if (request.method === "PATCH") {
          const patch = Array.isArray(parsedBody) ? parsedBody : [];

          if (isDryRun) {
            const hasVersionTest = patch.some(op => op.op === "test" && op.path === "/metadata/resourceVersion");

            if (!hasVersionTest) {
              return json(response, 422, statusError(422, "Invalid", "dry-run patch missing resourceVersion precondition"));
            }

            return json(response, 200, { ...deployment, metadata: { ...deployment.metadata, resourceVersion: "999-dry-run" } });
          }

          deployment.metadata.resourceVersion = String(Number(deployment.metadata.resourceVersion) + 1);

          for (const op of patch) {
            if (op.op === "replace" && op.path === "/spec/replicas") {
              deployment.spec.replicas = op.value;
            }
          }

          return json(response, 200, deployment);
        }
      }

      if (pathname.includes("/api/v1/namespaces")) {
        if (request.method === "GET") {
          return json(response, 200, {
            apiVersion: "v1",
            kind: "NamespaceList",
            metadata: { resourceVersion: "1" },
            items: namespaces,
          });
        }
      }

      if (pathname.includes("/api/v1/nodes")) {
        if (request.method === "GET") {
          if (/nodes\/[^/]+$/.test(pathname)) {
            return json(response, 200, nodes[0]);
          }

          return json(response, 200, {
            apiVersion: "v1",
            kind: "NodeList",
            metadata: { resourceVersion: "100" },
            items: nodes,
          });
        }
      }

      if (pathname.includes("/pods")) {
        return json(response, 200, {
          apiVersion: "v1",
          kind: "PodList",
          metadata: { resourceVersion: "1" },
          items: pods,
        });
      }

      if (pathname.includes("/poddisruptionbudgets")) {
        return json(response, 200, {
          apiVersion: "policy/v1",
          kind: "PodDisruptionBudgetList",
          metadata: { resourceVersion: "1" },
          items: pdbs,
        });
      }

      return json(response, 200, { status: "ok" });
    }
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
        state: { configMaps, secrets, deployment },
        close: () => new Promise(cb => {
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
    `current-context: ${fixtures[0].context.name}`,
    "clusters:",
    ...fixtures.map((f, i) => `  - name: k8s-cluster-${i + 1}\n    cluster:\n      server: ${f.endpoint}\n      insecure-skip-tls-verify: true`),
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
      nodeShellEnabled: false,
    },
  }));

  fs.writeFileSync(path.join(userData, "lens-cluster-store.json"), JSON.stringify({
    clusters,
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  const pinnedClusterIds = clusters.map(c => c.id);

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

  return { home, appData, kubeConfigPath, clusters };
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

async function openSidebarRoute(page, frame, parentTestId, childTestId) {
  const child = frame.locator(`[data-testid="sidebar-item-link-for-${childTestId}"]`).first();

  if (await child.isVisible().catch(() => false)) {
    await child.click();

    return;
  }

  const parent = frame.locator(`[data-testid="sidebar-item-link-for-${parentTestId}"]`).first();

  await parent.waitFor({ state: "visible", timeout: 20_000 });
  await parent.click();
  await page.waitForTimeout(700);
  await child.waitFor({ state: "visible", timeout: 15_000 });
  await child.click();
}

async function screenshot(page, name, results) {
  const file = path.join(evidenceDir, name);

  await page.screenshot({ path: file });
  results.evidence.push(name);
  console.log(`  · evidence: ${name}`);
}

async function run() {
  console.log("=== OpenLens DevOps Revival — R7-02 E2E Verification ===");
  console.log(`Executable: ${executable}`);
  console.log(`Evidence:   ${evidenceDir}`);

  assert(fs.existsSync(executable), `Executable not found at ${executable}. Build the app stage first.`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r7-02-"));
  const fixtures = [];

  for (const c of contexts) {
    fixtures.push(await createLocalApiFixture(c));
  }

  const profile = createProfile(tempRoot, "r7-02-test", fixtures);

  const verificationResults = {
    milestone: "R7-02",
    timestamp: new Date().toISOString(),
    status: "PENDING",
    branch: execSync("git rev-parse --abbrev-ref HEAD", { cwd: projectRoot }).toString().trim(),
    headCommit: execSync("git rev-parse HEAD", { cwd: projectRoot }).toString().trim(),
    appExecutable: executable,
    checkpoints: {},
    evidence: [],
    dryRunRequests: [],
    realMutations: [],
  };

  const pass = (key, message) => {
    verificationResults.checkpoints[key] = true;
    console.log(`✓ ${message}`);
  };

  let electronApp = null;

  try {
    console.log("Launching OpenLens DevOps via Playwright...");
    electronApp = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profile),
      timeout: 90_000,
    });

    const page = await waitForMainRenderer(electronApp);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(2000);

    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    await screenshot(page, "01-catalog-view.png", verificationResults);
    pass("catalogLoaded", "Catalog loaded successfully.");

    // ---- DEV cluster: success path, editing, real save ----
    const devFixture = fixtures[0];
    const devRow = page.getByText("DEV Dry-Run", { exact: true });

    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(3000);

    const devClusterId = profile.clusters[0].id;

    await page.locator(`#cluster-frame-${devClusterId}`).waitFor({ state: "attached", timeout: 20_000 });
    const devFrame = page.frameLocator(`#cluster-frame-${devClusterId}`);

    await openSidebarRoute(page, devFrame, "config", "config-maps");
    await page.waitForTimeout(1500);

    const openEditorFor = async (frame, name) => {
      const row = frame.locator(`.TableRow:has-text("${name}")`).first();

      await row.waitFor({ state: "visible", timeout: 20_000 });
      await row.locator('.TableCell.menu i.Icon, .TableCell.menu [data-testid^="icon-for-menu-actions"]').first().click();
      await page.waitForTimeout(600);

      const editItem = frame.getByText("Edit", { exact: true }).first();

      await editItem.waitFor({ state: "visible", timeout: 10_000 });
      await editItem.click();
      await page.waitForTimeout(1500);
    };

    const editorValueText = async (frame) => (
      ((await frame.locator(".monaco-editor .view-lines").last().textContent()) ?? "")
        .replace(/\u00a0/g, " ")
    );

    const clickValidate = async (frame) => {
      const button = frame.locator('[data-testid^="validate-dry-run-for-"]').last();

      await button.waitFor({ state: "visible", timeout: 20_000 });
      await button.click();
    };

    const waitForNotice = async (frame, kind, timeout = 20_000) => {
      const notice = frame.locator(`[data-testid^="dry-run-${kind}-notice-for-"]`).last();

      await notice.waitFor({ state: "visible", timeout });

      return notice;
    };

    // 1. Open app-config in the editor.
    await openEditorFor(devFrame, "app-config");

    const validateButton = devFrame.locator('[data-testid^="validate-dry-run-for-"]').last();

    await validateButton.waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.locator('[data-testid^="dry-run-not-validated-status-for-"]').last().waitFor({ state: "visible", timeout: 10_000 });
    await screenshot(page, "02-editor-not-validated.png", verificationResults);
    pass("editorOpenedWithValidateAction", "Editor opened with Validate — Server Dry-Run action in Not Validated state.");

    // 2. Edit the draft (append a comment at the end of the document).
    const monaco = devFrame.locator(".monaco-editor").last();

    await monaco.click();
    await page.keyboard.press("Meta+ArrowDown");
    await page.keyboard.type("\n# r7-02-edit");
    await page.waitForTimeout(800);

    const beforeValidationText = await editorValueText(devFrame);

    assert(beforeValidationText.includes("# r7-02-edit"), "The draft edit must be visible in the editor before validation");

    const dryRunCountBefore = devFixture.requests.filter(r => r.dryRun).length;

    // 3. Validate against the server.
    await clickValidate(devFrame);

    const passedNotice = await waitForNotice(devFrame, "passed");

    assert(
      (await passedNotice.innerText()).includes("Server-side dry-run accepted by Kubernetes"),
      "The accepted banner must state the server-side dry-run acceptance",
    );
    pass("dryRunAcceptedBanner", "Server-side dry-run accepted banner shown.");

    await screenshot(page, "03-dry-run-accepted.png", verificationResults);

    const metaText = await devFrame.locator('[data-testid^="dry-run-notice-meta-for-"]').last().innerText();

    assert(metaText.includes("Cluster: DEV Dry-Run"), "The banner must identify the cluster");
    assert(metaText.includes("ConfigMap/app-config"), "The banner must identify the resource");
    assert(metaText.includes("PUT ?dryRun=All"), "The banner must state the dry-run HTTP method");
    assert(/Checked: /.test(metaText), "The banner must show when the check ran");
    pass("bannerIdentifiesClusterResourceTime", "Banner identifies cluster, resource, method and time.");

    const noticeText = await passedNotice.innerText();

    assert(/NOT saved/i.test(noticeText), "The banner must explicitly say the resource was NOT saved");
    assert(
      await devFrame.locator('[data-testid^="unsaved-status-for-"]').last().isVisible(),
      "The draft must remain dirty after validation",
    );
    pass("validationDoesNotClaimSaved", "Banner states NOT saved and the draft remains dirty.");

    // 4. Draft content and undo/redo history preserved.
    const afterValidationText = await editorValueText(devFrame);

    assert(afterValidationText.includes("# r7-02-edit"), "The edited content must survive validation");
    await screenshot(page, "04-draft-preserved-after-validation.png", verificationResults);

    await monaco.click();
    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(500);

    const afterUndoText = await editorValueText(devFrame);

    assert(!afterUndoText.includes("# r7-02-edit"), "Undo must still work after validation");

    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(500);

    const afterRedoText = await editorValueText(devFrame);

    assert(afterRedoText.includes("# r7-02-edit"), "Redo must still work after validation");
    pass("draftAndUndoPreserved", "Draft content, cursor workflow and undo/redo history preserved.");

    // 5. The dry-run request reached the API server correctly.
    const dryRunRequests = devFixture.requests.filter(r => r.dryRun);

    assert(dryRunRequests.length === dryRunCountBefore + 1, "Exactly one dry-run request must be sent");

    const configMapDryRun = dryRunRequests[dryRunRequests.length - 1];

    assert(configMapDryRun.method === "PUT", "ConfigMap dry-run must use PUT");
    assert(configMapDryRun.pathname === "/api/v1/namespaces/default/configmaps/app-config", "Dry-run must target the same resource path");
    assert(configMapDryRun.body.metadata.resourceVersion === "1", "Dry-run must preserve the originally loaded resourceVersion");
    pass("dryRunQueryAndPreconditions", "PUT ?dryRun=All sent with the original resourceVersion.");

    const nonDryRunMutations = devFixture.requests.filter(r => (
      ["PUT", "POST", "PATCH"].includes(r.method)
      && !r.dryRun
      && !/selfsubject(access|rules)review/i.test(r.pathname)
    ));

    assert(nonDryRunMutations.length === 0, "Validation must never perform a real mutation");
    pass("noRealMutationFromValidation", "No real mutation was performed as a consequence of validating.");

    // 6. Editing after validation invalidates the result.
    await monaco.click();
    await page.keyboard.press("Meta+ArrowDown");
    await page.keyboard.type("\n# r7-02-edit-2");
    await page.waitForTimeout(600);

    assert(
      await devFrame.locator('[data-testid^="dry-run-not-validated-status-for-"]').last().isVisible(),
      "Editing after validation must reset the status to Not Validated",
    );
    assert(
      await devFrame.locator('[data-testid^="dry-run-passed-notice-for-"]').last().isHidden().catch(() => true),
      "The previous accepted banner must disappear after editing",
    );
    await screenshot(page, "05-edit-resets-validation.png", verificationResults);
    pass("editInvalidatesValidation", "Editing the draft invalidates the previous validation.");

    // 7. 422 schema/immutability rejection with structured cause.
    await openEditorFor(devFrame, "invalid-config");
    await clickValidate(devFrame);

    const invalidNotice = await waitForNotice(devFrame, "failed");

    assert((await invalidNotice.innerText()).includes("Validation failed"), "422 must produce a failed banner");
    assert(
      (await devFrame.locator('[data-testid^="dry-run-notice-causes-for-"]').last().innerText()).includes("data.port"),
      "Structured causes must include the field pointer",
    );
    await screenshot(page, "06-validation-422-causes.png", verificationResults);
    pass("rejected422WithCauses", "422 rejection shown with structured field causes.");

    // 8. 403 RBAC rejection.
    await openEditorFor(devFrame, "forbidden-config");
    await clickValidate(devFrame);

    const forbiddenNotice = await waitForNotice(devFrame, "failed");

    assert((await forbiddenNotice.innerText()).includes("Forbidden (403)"), "403 must be classified as Forbidden");
    await screenshot(page, "07-forbidden-403.png", verificationResults);
    pass("rejected403", "403 RBAC rejection classified.");

    // 9. Admission webhook rejection.
    await openEditorFor(devFrame, "webhook-config");
    await clickValidate(devFrame);

    const webhookNotice = await waitForNotice(devFrame, "failed");
    const webhookText = await webhookNotice.innerText();

    assert(webhookText.includes("admission webhook"), "Admission webhook rejection must be identified");
    assert(webhookText.includes("image tag"), "The exact webhook message must be preserved");
    await screenshot(page, "08-admission-webhook.png", verificationResults);
    pass("rejectedByAdmissionWebhook", "Admission webhook rejection shown with its exact message.");

    // 10. Secret redaction (server echoes the submitted value back).
    await openSidebarRoute(page, devFrame, "config", "secrets");
    await page.waitForTimeout(1500);
    await openEditorFor(devFrame, "app-secret");
    await clickValidate(devFrame);

    const secretNotice = await waitForNotice(devFrame, "failed");
    const secretText = await secretNotice.innerText();

    assert(secretText.includes("<redacted>"), "Secret failure message must contain redaction markers");
    assert(!secretText.includes(SECRET_BASE64_VALUE), "Secret base64 values must never appear in the UI");
    assert(!secretText.includes(SECRET_PLAINTEXT_VALUE), "Secret plaintext values must never appear in the UI");
    await screenshot(page, "09-secret-redacted.png", verificationResults);
    pass("secretValuesRedacted", "Secret values are redacted from validation results.");

    // 11. Deployment PATCH dry-run with resourceVersion precondition.
    await openSidebarRoute(page, devFrame, "workloads", "deployments");
    await page.waitForTimeout(1500);
    await openEditorFor(devFrame, "web-deploy");

    const deploymentMonaco = devFrame.locator(".monaco-editor").last();

    await deploymentMonaco.click();
    await page.keyboard.press("Meta+ArrowDown");
    await page.keyboard.type("\n# r7-02-deployment-edit");
    await page.waitForTimeout(600);

    const deploymentDryRunsBefore = devFixture.requests.filter(r => r.dryRun).length;

    await clickValidate(devFrame);
    await waitForNotice(devFrame, "passed");
    await screenshot(page, "10-deployment-patch-dry-run.png", verificationResults);

    const deploymentDryRuns = devFixture.requests.filter(r => r.dryRun);

    assert(deploymentDryRuns.length === deploymentDryRunsBefore + 1, "Exactly one deployment dry-run must be sent");

    const patchDryRun = deploymentDryRuns[deploymentDryRuns.length - 1];

    assert(patchDryRun.method === "PATCH", "Deployment dry-run must use PATCH");
    assert(patchDryRun.pathname === "/apis/apps/v1/namespaces/default/deployments/web-deploy", "PATCH dry-run must target the deployment");
    assert(
      Array.isArray(patchDryRun.body) && patchDryRun.body.some(op => op.op === "test" && op.path === "/metadata/resourceVersion" && op.value === "10"),
      "PATCH dry-run must keep the resourceVersion test precondition",
    );
    pass("patchDryRunWithPreconditions", "Deployment PATCH ?dryRun=All sent with the resourceVersion precondition.");

    // 13. Explicit save after validation performs the real mutation and verifies it.
    const realMutationsBefore = devFixture.requests.filter(r => ["PUT", "PATCH"].includes(r.method) && !r.dryRun).length;

    await devFrame.locator('[data-testid^="save-edit-resource-from-tab-for-"]').last().click();
    await page.waitForTimeout(2500);

    const realMutations = devFixture.requests.filter(r => ["PUT", "PATCH"].includes(r.method) && !r.dryRun);

    assert(realMutations.length === realMutationsBefore + 1, "Explicit Save must perform exactly one real mutation");
    assert(realMutations[realMutations.length - 1].method === "PATCH", "Deployment real save must use PATCH without dryRun");
    assert(!realMutations[realMutations.length - 1].dryRun, "The explicit save must not be a dry-run");
    await screenshot(page, "11-real-save-after-validation.png", verificationResults);
    pass("explicitSaveAfterValidation", "Explicit Save performed the real PATCH (no dryRun) after validation.");

    // Wait for the read-back verification to settle.
    await page.waitForTimeout(1500);

    assert(Number(devFixture.state.deployment.metadata.resourceVersion) > 10, "The explicit save must persist and bump the resourceVersion");
    pass("savePersistedAndVerified", "Real save persisted; validation itself never persisted.");

    // 12. PROD cluster: red identification and explicit production labeling.
    await navigate(electronApp, "/catalog");
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });

    const prodRow = page.getByText("PROD Dry-Run", { exact: true });

    await prodRow.waitFor({ state: "visible", timeout: 10_000 });
    await prodRow.click();
    await page.waitForTimeout(3000);

    const prodClusterId = profile.clusters[1].id;

    await page.locator(`#cluster-frame-${prodClusterId}`).waitFor({ state: "attached", timeout: 20_000 });
    const prodFrame = page.frameLocator(`#cluster-frame-${prodClusterId}`);
    await openSidebarRoute(page, prodFrame, "config", "config-maps");
    await page.waitForTimeout(1500);

    const prodRowItem = prodFrame.locator('.TableRow:has-text("app-config")').first();

    await prodRowItem.waitFor({ state: "visible", timeout: 20_000 });
    await prodRowItem.locator('.TableCell.menu i.Icon, .TableCell.menu [data-testid^="icon-for-menu-actions"]').first().click();
    await page.waitForTimeout(600);
    await prodFrame.getByText("Edit", { exact: true }).first().click();
    await page.waitForTimeout(1500);

    const prodMonaco = prodFrame.locator(".monaco-editor").last();

    await prodMonaco.click();
    await page.keyboard.press("Meta+ArrowDown");
    await page.keyboard.type("\n# r7-02-prod-edit");
    await page.waitForTimeout(600);

    await prodFrame.locator('[data-testid^="validate-dry-run-for-"]').last().click();

    const prodPassed = prodFrame.locator('[data-testid^="dry-run-passed-notice-for-"]').last();

    await prodPassed.waitFor({ state: "visible", timeout: 20_000 });

    const prodNoticeText = await prodPassed.innerText();

    await screenshot(page, "12-prod-dry-run.png", verificationResults);
    pass("prodValidationIdentified", "PROD cluster validation executed with cluster identification.");

    assert(prodNoticeText.includes("NOT saved"), "PROD banner must also state the resource was NOT saved");
    assert(
      await prodFrame.locator('[data-testid^="edit-resource-prod-hazard-"]').last().isVisible(),
      "PROD hazard identification must remain visible",
    );
    pass("prodHazardPreserved", "PROD hazard identification (#EF4444) preserved.");


    verificationResults.dryRunRequests = fixtures.flatMap(f => f.requests
      .filter(r => r.dryRun)
      .map(r => `${r.method} ${r.pathname}${r.search ? "?dryRun=All" : ""}`));
    verificationResults.realMutations = fixtures.flatMap(f => f.requests
      .filter(r => (
        ["PUT", "POST", "PATCH", "DELETE"].includes(r.method)
        && !r.dryRun
        && !/selfsubject(access|rules)review/i.test(r.pathname)
      ))
      .map(r => `${r.method} ${r.pathname}`));

    verificationResults.status = "PASS";

    fs.writeFileSync(
      path.join(projectRoot, "docs/revival/R7_02_VERIFICATION.json"),
      JSON.stringify(verificationResults, null, 2),
    );

    console.log("\n>>> ALL R7-02 PLAYWRIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  } catch (error) {
    verificationResults.status = "FAIL";
    verificationResults.error = String(error && error.stack ? error.stack : error);

    fs.writeFileSync(
      path.join(projectRoot, "docs/revival/R7_02_VERIFICATION.json"),
      JSON.stringify(verificationResults, null, 2),
    );

    console.error("\nR7-02 E2E verification failed:", error);

    try {
      const page = electronApp?.windows()[0];

      if (page) {
        await page.screenshot({ path: path.join(evidenceDir, "failure.png") });
      }
    } catch {
      // ignore secondary failures
    }

    process.exitCode = 1;
  } finally {
    try {
      await electronApp?.close();
    } catch {
      // ignore
    }

    for (const fixture of fixtures) {
      await fixture.close().catch(() => undefined);
    }
  }
}

run();
