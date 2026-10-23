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
const { execSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));

const outputDir = process.env.OPENLENS_R7_01_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r7-01-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-01");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const contexts = [
  {
    name: "standalone-dev",
    alias: "DEV Single Node",
    environment: "development",
    color: "#10B981",
    pinned: true,
  },
  {
    name: "prod-cluster",
    alias: "PROD Operations",
    environment: "production",
    color: "#EF4444",
    pinned: true,
  },
];

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function createLocalApiFixture(context) {
  const requests = [];
  const activeWatches = new Set();

  const nodes = context.name === "standalone-dev"
    ? [
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "standalone-node",
            uid: "uid-standalone-node",
            resourceVersion: "100",
            selfLink: "/api/v1/nodes/standalone-node",
            labels: {
              "kubernetes.io/hostname": "standalone-node",
              "kubernetes.io/os": "linux",
            },
          },
          spec: {
            unschedulable: false,
          },
          status: {
            nodeInfo: {
              kubeletVersion: "v1.31.0",
              operatingSystem: "linux",
              architecture: "arm64",
            },
            conditions: [
              { type: "Ready", status: "True", reason: "KubeletReady", message: "kubelet is posting ready status" },
            ],
          },
        },
      ]
    : [
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "prod-controlplane",
            uid: "uid-prod-cp",
            resourceVersion: "100",
            selfLink: "/api/v1/nodes/prod-controlplane",
            labels: {
              "kubernetes.io/hostname": "prod-controlplane",
              "node-role.kubernetes.io/control-plane": "",
              "kubernetes.io/os": "linux",
            },
          },
          spec: { unschedulable: false },
          status: {
            nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "prod-worker-1",
            uid: "uid-prod-w1",
            resourceVersion: "101",
            selfLink: "/api/v1/nodes/prod-worker-1",
            labels: {
              "kubernetes.io/hostname": "prod-worker-1",
              "node-role.kubernetes.io/worker": "",
              "kubernetes.io/os": "linux",
            },
          },
          spec: { unschedulable: false },
          status: {
            nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "prod-worker-2",
            uid: "uid-prod-w2",
            resourceVersion: "102",
            selfLink: "/api/v1/nodes/prod-worker-2",
            labels: {
              "kubernetes.io/hostname": "prod-worker-2",
              "node-role.kubernetes.io/worker": "",
              "kubernetes.io/os": "linux",
            },
          },
          spec: { unschedulable: false },
          status: {
            nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "prod-worker-3",
            uid: "uid-prod-w3",
            resourceVersion: "103",
            selfLink: "/api/v1/nodes/prod-worker-3",
            labels: {
              "kubernetes.io/hostname": "prod-worker-3",
              "node-role.kubernetes.io/worker": "",
              "kubernetes.io/os": "linux",
            },
          },
          spec: { unschedulable: false },
          status: {
            nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
        {
          apiVersion: "v1",
          kind: "Node",
          metadata: {
            name: "prod-worker-4",
            uid: "uid-prod-w4",
            resourceVersion: "104",
            selfLink: "/api/v1/nodes/prod-worker-4",
            labels: {
              "kubernetes.io/hostname": "prod-worker-4",
              "node-role.kubernetes.io/worker": "",
              "kubernetes.io/os": "linux",
            },
          },
          spec: { unschedulable: false },
          status: {
            nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" },
            conditions: [{ type: "Ready", status: "True" }],
          },
        },
      ];

  const pods = context.name === "standalone-dev"
    ? [
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "demo-app-1",
            namespace: "default",
            uid: "uid-demo-1",
            resourceVersion: "1",
            selfLink: "/api/v1/namespaces/default/pods/demo-app-1",
            labels: { app: "demo" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "ReplicaSet", name: "demo-rs-123", uid: "rs-1" }],
          },
          spec: {
            nodeName: "standalone-node",
            containers: [{ name: "demo", image: "nginx:alpine" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
      ]
    : [
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "frontend-web-1",
            namespace: "default",
            uid: "uid-prod-p1",
            resourceVersion: "10",
            selfLink: "/api/v1/namespaces/default/pods/frontend-web-1",
            labels: { app: "frontend" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "ReplicaSet", name: "frontend-rs", uid: "rs-fe" }],
          },
          spec: {
            nodeName: "prod-worker-1",
            containers: [{ name: "web", image: "nginx:latest" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "payments-core-1",
            namespace: "default",
            uid: "uid-prod-p2",
            resourceVersion: "11",
            selfLink: "/api/v1/namespaces/default/pods/payments-core-1",
            labels: { app: "payments" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "ReplicaSet", name: "payments-rs", uid: "rs-pay" }],
          },
          spec: {
            nodeName: "prod-worker-1",
            containers: [{ name: "payments", image: "payments:v2" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "fluentd-logger-1",
            namespace: "kube-system",
            uid: "uid-prod-ds",
            resourceVersion: "12",
            selfLink: "/api/v1/namespaces/kube-system/pods/fluentd-logger-1",
            labels: { app: "fluentd" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "DaemonSet", name: "fluentd", uid: "ds-1" }],
          },
          spec: {
            nodeName: "prod-worker-1",
            containers: [{ name: "fluentd", image: "fluent/fluentd:v1" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "cache-redis-0",
            namespace: "database",
            uid: "uid-prod-cache",
            resourceVersion: "13",
            selfLink: "/api/v1/namespaces/database/pods/cache-redis-0",
            labels: { app: "redis" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "StatefulSet", name: "cache-redis", uid: "sts-1" }],
          },
          spec: {
            nodeName: "prod-worker-1",
            containers: [{ name: "redis", image: "redis:7-alpine" }],
            volumes: [{ name: "scratch-cache", emptyDir: {} }],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "oneoff-migration",
            namespace: "default",
            uid: "uid-prod-orphan",
            resourceVersion: "14",
            selfLink: "/api/v1/namespaces/default/pods/oneoff-migration",
            labels: { job: "migration" },
            ownerReferences: [],
          },
          spec: {
            nodeName: "prod-worker-1",
            containers: [{ name: "migrate", image: "migrate:1.0" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "solo-delete-pod",
            namespace: "default",
            uid: "uid-prod-solo-delete",
            resourceVersion: "15",
            selfLink: "/api/v1/namespaces/default/pods/solo-delete-pod",
            labels: { app: "frontend" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "ReplicaSet", name: "frontend-rs", uid: "rs-fe" }],
          },
          spec: {
            nodeName: "prod-worker-3",
            containers: [{ name: "web", image: "nginx:latest" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
        {
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "solo-migrate-pod",
            namespace: "default",
            uid: "uid-prod-solo-migrate",
            resourceVersion: "16",
            selfLink: "/api/v1/namespaces/default/pods/solo-migrate-pod",
            labels: { app: "frontend" },
            ownerReferences: [{ apiVersion: "apps/v1", kind: "ReplicaSet", name: "frontend-rs", uid: "rs-fe" }],
          },
          spec: {
            nodeName: "prod-worker-4",
            containers: [{ name: "web", image: "nginx:latest" }],
            volumes: [],
          },
          status: { phase: "Running", conditions: [{ type: "Ready", status: "True" }] },
        },
      ];

  const pdbs = context.name === "prod-cluster"
    ? [
        {
          apiVersion: "policy/v1",
          kind: "PodDisruptionBudget",
          metadata: {
            name: "frontend-pdb",
            namespace: "default",
            uid: "uid-pdb-1",
            resourceVersion: "1",
            selfLink: "/apis/policy/v1/namespaces/default/poddisruptionbudgets/frontend-pdb",
          },
          spec: {
            minAvailable: 1,
            selector: { matchLabels: { app: "frontend" } },
          },
          status: {
            currentHealthy: 2,
            desiredHealthy: 1,
            disruptionsAllowed: 1,
            expectedPods: 2,
          },
        },
        {
          apiVersion: "policy/v1",
          kind: "PodDisruptionBudget",
          metadata: {
            name: "payments-pdb",
            namespace: "default",
            uid: "uid-pdb-2",
            resourceVersion: "2",
            selfLink: "/apis/policy/v1/namespaces/default/poddisruptionbudgets/payments-pdb",
          },
          spec: {
            minAvailable: 1,
            selector: { matchLabels: { app: "payments" } },
          },
          status: {
            currentHealthy: 1,
            desiredHealthy: 1,
            disruptionsAllowed: 0,
            expectedPods: 1,
          },
        },
      ]
    : [];

  const fixtureFlags = { failPodsForNode: null };

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    const isWatch = request.method === "GET" && requestUrl.searchParams.get("watch") === "true";
    requests.push({ method: request.method, url: request.url, pathname: requestUrl.pathname, isWatch });

    if (request.method === "POST" && /selfsubject(access|rules)review/i.test(requestUrl.pathname)) {
      if (/rules/i.test(requestUrl.pathname)) {
        return json(response, 200, {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectRulesReview",
          status: {
            incomplete: false,
            resourceRules: [
              { verbs: ["*"], apiGroups: ["*"], resources: ["*"] },
            ],
            nonResourceRules: [
              { verbs: ["*"], nonResourceURLs: ["*"] },
            ],
          },
        });
      }
      return json(response, 200, {
        apiVersion: "authorization.k8s.io/v1",
        kind: "SelfSubjectAccessReview",
        status: { allowed: true },
      });
    }

    if (requestUrl.pathname === "/version") {
      return json(response, 200, { major: "1", minor: "31", gitVersion: "v1.31.0", platform: "darwin/arm64" });
    }

    if (requestUrl.pathname === "/api" || requestUrl.pathname === "/apis") {
      return json(response, 200, {
        kind: "APIVersions",
        versions: ["v1"],
        groups: [
          {
            name: "apps",
            versions: [{ groupVersion: "apps/v1", version: "v1" }],
            preferredVersion: { groupVersion: "apps/v1", version: "v1" },
          },
          {
            name: "policy",
            versions: [
              { groupVersion: "policy/v1", version: "v1" },
              { groupVersion: "policy/v1beta1", version: "v1beta1" },
            ],
            preferredVersion: { groupVersion: "policy/v1", version: "v1" },
          },
        ],
      });
    }

    if (requestUrl.pathname === "/apis/policy") {
      return json(response, 200, {
        kind: "APIGroup",
        apiVersion: "v1",
        name: "policy",
        versions: [
          { groupVersion: "policy/v1", version: "v1" },
          { groupVersion: "policy/v1beta1", version: "v1beta1" },
        ],
        preferredVersion: { groupVersion: "policy/v1", version: "v1" },
      });
    }

    if (requestUrl.pathname === "/api/v1") {
      return json(response, 200, {
        kind: "APIResourceList",
        apiVersion: "v1",
        resources: [
          { name: "namespaces", singularName: "namespace", namespaced: false, kind: "Namespace", verbs: ["get", "list", "watch"] },
          { name: "nodes", singularName: "node", namespaced: false, kind: "Node", verbs: ["get", "list", "watch", "patch"] },
          { name: "pods", singularName: "pod", namespaced: true, kind: "Pod", verbs: ["get", "list", "watch", "delete"] },
          { name: "pods/eviction", singularName: "eviction", namespaced: true, kind: "Eviction", verbs: ["create"] },
        ],
      });
    }

    if (requestUrl.pathname === "/apis/policy/v1" || requestUrl.pathname === "/apis/policy/v1beta1") {
      return json(response, 200, {
        kind: "APIResourceList",
        apiVersion: requestUrl.pathname.split("/").pop(),
        resources: [
          { name: "poddisruptionbudgets", singularName: "poddisruptionbudget", namespaced: true, kind: "PodDisruptionBudget", verbs: ["get", "list", "watch"] },
        ],
      });
    }

    if (isWatch) {
      activeWatches.add(response);
      response.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });
      if (requestUrl.pathname.includes("/nodes")) {
        for (const n of nodes) {
          response.write(`${JSON.stringify({ type: "ADDED", object: n })}\n`);
        }
      } else if (requestUrl.pathname.includes("/pods")) {
        for (const p of pods) {
          response.write(`${JSON.stringify({ type: "ADDED", object: p })}\n`);
        }
      } else if (requestUrl.pathname.includes("/poddisruptionbudgets")) {
        for (const pdb of pdbs) {
          response.write(`${JSON.stringify({ type: "ADDED", object: pdb })}\n`);
        }
      }
      response.on("close", () => activeWatches.delete(response));
      return;
    }

    if (requestUrl.pathname.includes("/poddisruptionbudgets") && request.method === "GET") {
      const nsMatch = requestUrl.pathname.match(/\/namespaces\/([^/]+)\/poddisruptionbudgets/);
      const ns = nsMatch ? nsMatch[1] : null;
      const filteredPdbs = ns ? pdbs.filter(p => p.metadata.namespace === ns) : pdbs;

      return json(response, 200, {
        apiVersion: "policy/v1",
        kind: "PodDisruptionBudgetList",
        metadata: { resourceVersion: "100" },
        items: filteredPdbs,
      });
    }

    if (requestUrl.pathname.includes("/api/v1/nodes")) {
      if (request.method === "PATCH") {
        let body = "";
        request.on("data", chunk => body += chunk);
        request.on("end", () => {
          const patchData = JSON.parse(body);
          const nodeName = requestUrl.pathname.split("/").pop();
          const targetNode = nodes.find(n => n.metadata.name === nodeName);
          if (targetNode && patchData.spec) {
            Object.assign(targetNode.spec, patchData.spec);
          }
          return json(response, 200, targetNode || { status: "patched" });
        });
        return;
      }

      const singleNodeMatch = requestUrl.pathname.match(/^\/api\/v1\/nodes\/([^/]+)$/);

      if (request.method === "GET" && singleNodeMatch) {
        const targetNode = nodes.find(n => n.metadata.name === singleNodeMatch[1]);

        if (!targetNode) {
          return json(response, 404, {
            apiVersion: "v1",
            kind: "Status",
            status: "Failure",
            reason: "NotFound",
            message: `nodes "${singleNodeMatch[1]}" not found`,
            code: 404,
          });
        }

        return json(response, 200, targetNode);
      }

      return json(response, 200, {
        apiVersion: "v1",
        kind: "NodeList",
        metadata: { resourceVersion: "100" },
        items: nodes,
      });
    }

    if (requestUrl.pathname.includes("/pods") && !requestUrl.pathname.includes("/eviction") && request.method === "GET") {
      const nsMatch = requestUrl.pathname.match(/\/namespaces\/([^/]+)\/pods/);
      const ns = nsMatch ? nsMatch[1] : null;
      const fieldSelector = requestUrl.searchParams.get("fieldSelector") || "";
      const nodeSelector = /spec\.nodeName=([^,&]+)/.exec(fieldSelector)?.[1];

      if (fixtureFlags.failPodsForNode && nodeSelector === fixtureFlags.failPodsForNode) {
        return json(response, 500, {
          apiVersion: "v1",
          kind: "Status",
          status: "Failure",
          message: "synthetic pod list failure (RBAC/timeout simulation)",
          code: 500,
        });
      }

      let filteredPods = ns ? pods.filter(p => p.metadata.namespace === ns) : pods;

      if (nodeSelector) {
        filteredPods = filteredPods.filter(p => p.spec?.nodeName === nodeSelector);
      }

      return json(response, 200, {
        apiVersion: "v1",
        kind: "PodList",
        metadata: { resourceVersion: "100" },
        items: filteredPods,
      });
    }

    if (requestUrl.pathname.includes("/eviction") && request.method === "POST") {
      return json(response, 201, {
        apiVersion: "policy/v1",
        kind: "Status",
        status: "Success",
        code: 201,
        message: "Evicted pod",
      });
    }

    if (requestUrl.pathname.includes("/api/v1/namespaces")) {
      return json(response, 200, {
        apiVersion: "v1",
        kind: "NamespaceList",
        metadata: { resourceVersion: "1" },
        items: [
          { apiVersion: "v1", kind: "Namespace", metadata: { name: "default" }, status: { phase: "Active" } },
          { apiVersion: "v1", kind: "Namespace", metadata: { name: "finance" }, status: { phase: "Active" } },
          { apiVersion: "v1", kind: "Namespace", metadata: { name: "database" }, status: { phase: "Active" } },
          { apiVersion: "v1", kind: "Namespace", metadata: { name: "kube-system" }, status: { phase: "Active" } },
        ],
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
        state: { nodes, pods, pdbs },
        flags: fixtureFlags,
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

async function run() {
  console.log("=== OpenLens DevOps Revival — R7-01 E2E Verification ===");
  console.log(`Executable: ${executable}`);
  console.log(`Evidence:   ${evidenceDir}`);

  assert(fs.existsSync(executable), `Executable not found at ${executable}. Build the app stage first.`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r7-01-"));
  const fixtures = [];
  for (const c of contexts) {
    fixtures.push(await createLocalApiFixture(c));
  }

  const profile = createProfile(tempRoot, "r7-01-test", fixtures);

  const verificationResults = {
    milestone: "R7-01",
    timestamp: new Date().toISOString(),
    status: "PENDING",
    branch: execSync("git rev-parse --abbrev-ref HEAD", { cwd: projectRoot }).toString().trim(),
    headCommit: execSync("git rev-parse HEAD", { cwd: projectRoot }).toString().trim(),
    appExecutable: executable,
    checkpoints: {},
    evidence: [],
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

    // The authorization handler must be registered by startup, before any renderer can request a
    // PROD Node Shell authorization. This is the failure mode that would make the feature dead.
    const authorizationHandlerRegistered = await electronApp.evaluate(({ ipcMain }) => {
      const internals = ipcMain;

      return internals instanceof Object
        && internals._invokeHandlers instanceof Map
        && internals._invokeHandlers.has("node-shell:request-authorization");
    });

    assert(
      authorizationHandlerRegistered,
      "The Node Shell authorization IPC handler must be registered at startup",
    );
    console.log("✓ Node Shell authorization handler registered at startup.");
    verificationResults.checkpoints.nodeShellAuthorizationHandlerRegistered = true;

    // Open Catalog
    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    // Capture initial catalog view
    const p1 = path.join(evidenceDir, "01-catalog-view.png");
    await page.screenshot({ path: p1 });
    verificationResults.evidence.push("01-catalog-view.png");
    console.log("✓ Catalog loaded successfully.");

    // Connect to standalone-dev cluster
    const devRow = page.getByText("DEV Single Node", { exact: true });
    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(3000);

    const devClusterId = profile.clusters[0].id;
    await page.locator(`#cluster-frame-${devClusterId}`).waitFor({ state: "attached", timeout: 20_000 });
    const devFrame = page.frameLocator(`#cluster-frame-${devClusterId}`);

    // Wait for sidebar item for Nodes to be visible
    console.log("Waiting for sidebar and navigating to Nodes in DEV Single Node cluster...");
    const nodesNavItem = devFrame.locator('[data-testid="sidebar-item-link-for-nodes"], a[href*="/nodes"]').first();
    await nodesNavItem.waitFor({ state: "visible", timeout: 30_000 });
    await nodesNavItem.click();
    await page.waitForTimeout(1500);

    // Capture Nodes view
    const p2 = path.join(evidenceDir, "02-nodes-view-dev.png");
    await page.screenshot({ path: p2 });
    verificationResults.evidence.push("02-nodes-view-dev.png");

    // Open Node Menu for standalone-node
    console.log("Testing Single-Node Drain dialog...");
    const nodeMenuBtn = devFrame.locator('.TableRow:has-text("standalone-node")').locator('.TableCell.menu i.Icon, [data-testid^="icon-for-menu-actions-for-kube-object-menu-for-"]').first();
    await nodeMenuBtn.waitFor({ state: "visible", timeout: 10_000 });
    await nodeMenuBtn.click();
    await page.waitForTimeout(500);

    // Drain option
    const drainItem = devFrame.locator('[data-testid="menu-action-drain-node"]').first();
    await drainItem.waitFor({ state: "visible", timeout: 5000 });
    await drainItem.click();
    await page.waitForTimeout(1000);

    // Verify Single-Node Total Outage Warning
    const singleNodeWarning = devFrame.locator('[data-testid="drain-single-node-warning"]');
    await singleNodeWarning.waitFor({ state: "visible", timeout: 5000 });
    const warningText = await singleNodeWarning.innerText();
    assert(warningText.includes("SINGLE-NODE CLUSTER DETECTED"), "Must display single node outage warning");
    console.log("✓ Single-node cluster outage warning certified.");
    verificationResults.checkpoints.singleNodeWarning = true;

    const p3 = path.join(evidenceDir, "03-single-node-outage-warning.png");
    await page.screenshot({ path: p3 });
    verificationResults.evidence.push("03-single-node-outage-warning.png");

    // Verify Typing Gate
    const confirmBtn = devFrame.locator('[data-testid="drain-node-confirm-btn"]');
    const input = devFrame.locator('[data-testid="drain-node-typing-gate-input"]');

    assert(await confirmBtn.isDisabled(), "Drain button must be disabled before typing node name");

    await input.fill("wrong-name");
    await page.waitForTimeout(300);
    assert(await confirmBtn.isDisabled(), "Drain button must remain disabled on mismatched node name");

    const p4 = path.join(evidenceDir, "04-drain-typing-gate-locked.png");
    await page.screenshot({ path: p4 });
    verificationResults.evidence.push("04-drain-typing-gate-locked.png");

    await input.fill("standalone-node");
    await page.waitForTimeout(300);
    assert(!(await confirmBtn.isDisabled()), "Drain button must unlock on exact node name match");
    console.log("✓ Typing gate protection certified.");
    verificationResults.checkpoints.typingGate = true;

    const p5 = path.join(evidenceDir, "05-drain-typing-gate-unlocked.png");
    await page.screenshot({ path: p5 });
    verificationResults.evidence.push("05-drain-typing-gate-unlocked.png");

    // Close drain dialog
    const cancelBtn = devFrame.locator('button.back-btn', { hasText: "Cancel" }).first();
    await cancelBtn.click();
    await page.waitForTimeout(500);

    // ==========================================
    // Switch to PROD cluster: Test PROD Drain Safeguards & Node Shell
    // ==========================================
    console.log("\nSwitching to PROD Operations cluster...");
    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);

    const prodRow = page.getByText("PROD Operations", { exact: true });
    await prodRow.waitFor({ state: "visible", timeout: 10_000 });
    await prodRow.click();
    await page.waitForTimeout(3000);

    const prodClusterId = profile.clusters[1].id;
    await page.locator(`#cluster-frame-${prodClusterId}`).waitFor({ state: "attached", timeout: 20_000 });
    const prodFrame = page.frameLocator(`#cluster-frame-${prodClusterId}`);

    const prodNodesNav = prodFrame.locator('[data-testid="sidebar-item-link-for-nodes"], a[href*="/nodes"]').first();
    await prodNodesNav.waitFor({ state: "visible", timeout: 30_000 });
    await prodNodesNav.click();
    await page.waitForTimeout(1500);

    // Check Node Shell disabled by default on worker-1
    console.log("Verifying Node Shell disabled by default in PROD...");
    const prodNodeMenuBtn = prodFrame.locator('.TableRow:has-text("prod-worker-1")').locator('.TableCell.menu i.Icon, [data-testid^="icon-for-menu-actions-for-kube-object-menu-for-"]').first();
    await prodNodeMenuBtn.waitFor({ state: "visible", timeout: 10_000 });
    await prodNodeMenuBtn.click();
    await page.waitForTimeout(500);

    const nodeShellItem = prodFrame.locator('[data-testid="menu-action-node-shell"]');
    await nodeShellItem.waitFor({ state: "visible", timeout: 5000 });
    const isShellDisabled = (await nodeShellItem.getAttribute("class") || "").includes("disabled");
    assert(isShellDisabled, "Node Shell must be disabled by default in cluster menu");
    console.log("✓ Node Shell disabled by default certified.");
    verificationResults.checkpoints.nodeShellDisabledByDefault = true;

    // Behavioural check (not just visual presence): clicking a disabled Node Shell control must not
    // create any privileged pod. Authorization bypass negatives live in the Jest suites because the
    // production approval is a native main-process dialog that Playwright must not auto-approve.
    const requestsBeforeShellClick = fixtures[1].requests.length;

    await nodeShellItem.click({ force: true }).catch(() => {});
    await page.waitForTimeout(750);

    const privilegedPodCreations = fixtures[1].requests
      .slice(requestsBeforeShellClick)
      .filter((entry) => entry.method === "POST" && /\/pods(\?|$)/.test(entry.pathname));

    assert.strictEqual(
      privilegedPodCreations.length,
      0,
      "Clicking a disabled Node Shell must not create any privileged pod",
    );
    console.log("✓ Disabled Node Shell produced no privileged pod creation.");
    verificationResults.checkpoints.nodeShellDisabledNoSideEffect = true;

    const p6 = path.join(evidenceDir, "06-node-shell-disabled-by-default.png");
    await page.screenshot({ path: p6 });
    verificationResults.evidence.push("06-node-shell-disabled-by-default.png");

    // Open Drain dialog in PROD
    console.log("Testing PROD Drain pre-flight inspection (PDB & emptyDir)...");
    const prodDrainItem = prodFrame.locator('[data-testid="menu-action-drain-node"]').first();

    if (!(await prodDrainItem.isVisible().catch(() => false))) {
      await prodNodeMenuBtn.click();
      await page.waitForTimeout(500);
    }

    await prodDrainItem.click();
    await page.waitForTimeout(1000);

    // Verify PROD hazard banner
    const prodHazardBanner = prodFrame.locator('[data-testid="drain-prod-hazard-banner"]');
    await prodHazardBanner.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ PROD hazard banner displayed.");
    verificationResults.checkpoints.prodHazardBanner = true;

    // Verify emptyDir consent required
    const emptyDirCheckbox = prodFrame.locator('[data-testid="drain-emptydir-checkbox"]');
    await emptyDirCheckbox.waitFor({ state: "attached", timeout: 5000 });
    console.log("✓ emptyDir consent checkbox detected.");
    verificationResults.checkpoints.emptyDirConsent = true;

    // Verify unmanaged pod consent required
    const unmanagedCheckbox = prodFrame.locator('[data-testid="drain-unmanaged-checkbox"]');
    await unmanagedCheckbox.waitFor({ state: "attached", timeout: 5000 });
    console.log("✓ Unmanaged pod consent checkbox detected.");
    verificationResults.checkpoints.unmanagedConsent = true;

    // Verify PDB disruption alert
    const pdbAlert = prodFrame.locator('text=PDB Disruption Alert:');
    await pdbAlert.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ PDB 0-allowed disruption warning detected.");
    verificationResults.checkpoints.pdbDisruptionAlert = true;

    // Verify Ready Status Badge
    const readyBadge = prodFrame.locator('[data-testid="drain-ready-badge"]');
    await readyBadge.waitFor({ state: "visible", timeout: 5000 });
    console.log("✓ Workload & PDB verified status badge detected.");
    verificationResults.checkpoints.dataReadyBadge = true;

    // Verify DaemonSets permanently excluded (no opt-in deletion checkbox)
    const dsCheckboxCount = await prodFrame.locator('[data-testid="drain-ignore-daemonsets-checkbox"]').count();
    assert.strictEqual(dsCheckboxCount, 0, "DaemonSets ignore checkbox must not exist (always excluded)");
    const dsCount = await prodFrame.locator('[data-testid="summary-daemonset-count"]').innerText();
    assert.strictEqual(dsCount.trim(), "1", "DaemonSets skipped count must be displayed");
    console.log("✓ DaemonSets permanently excluded certified.");
    verificationResults.checkpoints.daemonSetPermanentExclusion = true;

    const p7 = path.join(evidenceDir, "07-prod-drain-preflight-pdb-emptydir.png");
    await page.screenshot({ path: p7 });
    verificationResults.evidence.push("07-prod-drain-preflight-pdb-emptydir.png");

    const prodCancelBtn = prodFrame.locator('button.back-btn', { hasText: "Cancel" }).first();
    await prodCancelBtn.click();
    await page.waitForTimeout(500);

    // ==========================================
    // R7-01 final gate: directed behavioural checks for the three corrected defects
    // ==========================================
    const prodFixture = fixtures[1];
    const requests = prodFixture.requests;

    const waitFor = async (predicate, description, timeoutMs = 15_000) => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.error(`Timed out waiting for ${description}.`);
      console.error("dialog text:", await prodFrame.locator('.DrainDialog').innerText().catch((e) => String(e)));
      console.error("recent requests:", requests.slice(-15).map((entry) => `${entry.method} ${entry.pathname}`));
      await page.screenshot({ path: path.join(evidenceDir, "debug-timeout.png") });
      throw new Error(`Timed out waiting for ${description}`);
    };

    const requestIndex = () => requests.length;
    const directedStart = requests.length;

    const requestsSince = (index) => requests.slice(index);

    const cordonRequestedFor = (nodeName, sinceIndex = 0) => requestsSince(sinceIndex).some(
      (entry) => entry.method === "PATCH" && entry.pathname === `/api/v1/nodes/${nodeName}`,
    );

    const evictionRequestedFor = (podName, sinceIndex = 0) => requestsSince(sinceIndex).some(
      (entry) => entry.method === "POST" && entry.pathname.endsWith(`/pods/${podName}/eviction`),
    );

    const openNodeMenu = async (nodeName) => {
      const menuButton = prodFrame
        .locator(`.TableRow:has-text("${nodeName}")`)
        .locator('.TableCell.menu i.Icon, [data-testid^="icon-for-menu-actions-for-kube-object-menu-for-"]')
        .first();

      await menuButton.waitFor({ state: "visible", timeout: 10_000 });
      await menuButton.click();
      await page.waitForTimeout(400);
    };

    const openDrainFor = async (nodeName) => {
      await openNodeMenu(nodeName);

      const drainItem = prodFrame.locator('[data-testid="menu-action-drain-node"]').first();

      await drainItem.waitFor({ state: "visible", timeout: 5_000 });
      await drainItem.click();
      await prodFrame.locator('[data-testid="drain-ready-badge"]').waitFor({ state: "visible", timeout: 20_000 });
    };

    // The native checkbox input is display:none by design; the visible control is its label/box.
    const checkConsent = async (testId) => {
      const control = prodFrame.locator(`label.Checkbox:has([data-testid="${testId}"])`);

      await control.waitFor({ state: "visible", timeout: 10_000 });
      await control.click();
    };

    const prepareProdDrain = async (nodeName, { emptyDir = false, unmanaged = false } = {}) => {
      if (emptyDir) {
        await checkConsent("drain-emptydir-checkbox");
      }

      if (unmanaged) {
        await checkConsent("drain-unmanaged-checkbox");
      }

      await checkConsent("drain-prod-ack-checkbox");
      await prodFrame.locator('[data-testid="drain-node-typing-gate-input"]').fill(nodeName);

      assert(
        !(await prodFrame.locator('[data-testid="drain-node-confirm-btn"]').isDisabled()),
        `Drain must unlock after all consents for ${nodeName}`,
      );
    };

    const submitDrain = async () => {
      await prodFrame.locator('[data-testid="drain-node-confirm-btn"]').click();
    };

    const closeDrain = async () => {
      await prodFrame.locator('button.back-btn', { hasText: "Cancel" }).first().click();
      await page.waitForTimeout(400);
    };

    const podsState = prodFixture.state.pods;
    const nodesState = prodFixture.state.nodes;
    const pdbsState = prodFixture.state.pdbs;

    // 1. Fresh empty result is success, not a fallback to stale pods: cordon only, zero evictions.
    const zeroPodsIndex = requestIndex();

    await openDrainFor("prod-worker-2");
    await prepareProdDrain("prod-worker-2");
    await submitDrain();

    await waitFor(() => cordonRequestedFor("prod-worker-2", zeroPodsIndex), "cordon of prod-worker-2");

    const zeroPodsEvictions = requestsSince(zeroPodsIndex).filter(
      (entry) => entry.method === "POST" && entry.pathname.includes("/eviction"),
    );

    assert.strictEqual(zeroPodsEvictions.length, 0, "A fresh empty pod list must not produce eviction requests");
    console.log("✓ Fresh empty pod list completed as cordon-only drain (no stale eviction).");
    verificationResults.checkpoints.freshEmptyPodListCordonOnly = true;

    // 2. Pod deleted between preview and execution is not evicted from the stale snapshot.
    const deleteNode = nodesState.find((node) => node.metadata.name === "prod-worker-3");
    assert(deleteNode, "prod-worker-3 fixture must exist");
    await openDrainFor("prod-worker-3");
    await prepareProdDrain("prod-worker-3");

    const deleteIndex = requestIndex();
    const deleteCandidate = podsState.findIndex((pod) => pod.metadata.name === "solo-delete-pod");

    assert(deleteCandidate >= 0, "solo-delete-pod fixture must exist");
    podsState.splice(deleteCandidate, 1);

    await submitDrain();
    await waitFor(() => cordonRequestedFor("prod-worker-3", deleteIndex), "cordon of prod-worker-3");

    assert(!evictionRequestedFor("solo-delete-pod", deleteIndex), "A pod deleted during revalidation must not be evicted");
    console.log("✓ Pod deleted between preview and execution was not evicted.");
    verificationResults.checkpoints.deletedPodNotEvicted = true;

    // 3. Pod migrated to another node between preview and execution is not evicted.
    await openDrainFor("prod-worker-4");
    await prepareProdDrain("prod-worker-4");

    const migrateIndex = requestIndex();
    const migrateCandidate = podsState.find((pod) => pod.metadata.name === "solo-migrate-pod");

    assert(migrateCandidate, "solo-migrate-pod fixture must exist");
    migrateCandidate.spec.nodeName = "prod-worker-2";

    await submitDrain();
    await waitFor(() => cordonRequestedFor("prod-worker-4", migrateIndex), "cordon of prod-worker-4");

    assert(!evictionRequestedFor("solo-migrate-pod", migrateIndex), "A pod migrated to another node must not be evicted");
    console.log("✓ Pod migrated to another node was not evicted.");
    verificationResults.checkpoints.migratedPodNotEvicted = true;

    // 4. PDB state changed since preview -> abort before cordon and demand re-confirmation.
    await openDrainFor("prod-worker-1");
    await prepareProdDrain("prod-worker-1", { emptyDir: true, unmanaged: true });

    const pdbIndex = requestIndex();
    const frontendPdb = pdbsState.find((pdb) => pdb.metadata.name === "frontend-pdb");

    assert(frontendPdb, "frontend-pdb fixture must exist");
    assert.strictEqual(frontendPdb.status.disruptionsAllowed, 1, "frontend-pdb must start with one allowed disruption");
    frontendPdb.status.disruptionsAllowed = 0;

    await submitDrain();
    await prodFrame
      .locator('.drain-error-status', { hasText: /disruptionsAllowed decreased from 1 to 0/ })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    assert(!cordonRequestedFor("prod-worker-1", pdbIndex), "A changed PDB must cancel the drain before Cordon");
    console.log("✓ Changed PDB status aborted the drain before Cordon.");
    verificationResults.checkpoints.pdbChangeAbortsBeforeCordon = true;

    const p8 = path.join(evidenceDir, "08-pdb-change-aborts-before-cordon.png");
    await page.screenshot({ path: p8 });
    verificationResults.evidence.push("08-pdb-change-aborts-before-cordon.png");

    await closeDrain();

    // 5. Failed fresh pod query -> cancel before Cordon (never fall back to stale pods).
    await openDrainFor("prod-worker-1");
    await prepareProdDrain("prod-worker-1", { emptyDir: true, unmanaged: true });

    const failureIndex = requestIndex();

    prodFixture.flags.failPodsForNode = "prod-worker-1";
    await submitDrain();
    await prodFrame
      .locator('.drain-error-status', { hasText: /Failed to query fresh pod workloads/ })
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });

    assert(!cordonRequestedFor("prod-worker-1", failureIndex), "A failed fresh pod query must cancel before Cordon");

    const failedQueryEvictions = requestsSince(failureIndex).filter(
      (entry) => entry.method === "POST" && entry.pathname.includes("/eviction"),
    );

    assert.strictEqual(failedQueryEvictions.length, 0, "A failed fresh query must not evict anything");
    prodFixture.flags.failPodsForNode = null;
    console.log("✓ Failed fresh pod query aborted before Cordon with no eviction.");
    verificationResults.checkpoints.podQueryFailureAbortsBeforeCordon = true;

    const p9 = path.join(evidenceDir, "09-pod-query-failure-aborts-before-cordon.png");
    await page.screenshot({ path: p9 });
    verificationResults.evidence.push("09-pod-query-failure-aborts-before-cordon.png");

    await closeDrain();

    verificationResults.directedMutations = requests
      .slice(directedStart)
      .filter((entry) => entry.method === "PATCH" || entry.method === "POST")
      .map((entry) => `${entry.method} ${entry.pathname}`);

    verificationResults.status = "PASS";
    console.log("\n>>> ALL R7-01 PLAYWRIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<\n");
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
    for (const f of fixtures) {
      await f.close();
    }
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {}
  }

  const verJsonPath = path.join(projectRoot, "docs/revival/R7_01_VERIFICATION.json");
  fs.writeFileSync(verJsonPath, JSON.stringify(verificationResults, null, 2), "utf8");
  console.log(`Saved structured verification results to ${verJsonPath}`);
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
