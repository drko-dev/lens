/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R7-04 E2E verification: VolumeSnapshots, VolumeSnapshotClasses, VolumeSnapshotContents,
 * PVC expansion and snapshot creation.
 *
 * Runs against a locally packaged build (experimental ARM64 stage) and synthetic
 * Kubernetes API fixtures listening on 127.0.0.1. No real cluster is touched.
 *
 * Usage:
 *   node docs/revival/scripts/verify-r7-04-storage.cjs
 *   OPENLENS_R7_04_OUTPUT=open-lens/dist-r7-04-stage node ...
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

const outputDir = process.env.OPENLENS_R7_04_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r7-04-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-04");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const contexts = [
  {
    name: "dev-storage",
    alias: "DEV Storage",
    environment: "development",
    color: "#10B981",
    pinned: true,
    hasSnapshots: true,
  },
  {
    name: "prod-storage",
    alias: "PROD Storage",
    environment: "production",
    color: "#EF4444",
    pinned: true,
    hasSnapshots: true,
  },
  {
    name: "legacy-storage",
    alias: "Legacy Storage",
    environment: "development",
    color: "#3B82F6",
    pinned: true,
    hasSnapshots: false,
  },
];

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function statusError(code, reason, message) {
  return {
    apiVersion: "v1",
    kind: "Status",
    status: "Failure",
    message,
    reason,
    code,
  };
}

function list(kind, items, apiVersion, extra = {}) {
  return {
    apiVersion,
    kind,
    metadata: { resourceVersion: String(Date.now()) },
    items,
    ...extra,
  };
}

function createLocalApiFixture(context) {
  const requests = [];
  const activeWatches = new Set();

  const namespaces = [
    { apiVersion: "v1", kind: "Namespace", metadata: { name: "default", uid: `uid-ns-default-${context.name}`, resourceVersion: "1" }, status: { phase: "Active" } },
  ];

  const nodes = [
    {
      apiVersion: "v1",
      kind: "Node",
      metadata: { name: `${context.name}-node`, uid: `uid-node-${context.name}`, resourceVersion: "100", labels: { "kubernetes.io/os": "linux" } },
      status: { nodeInfo: { kubeletVersion: "v1.31.0", operatingSystem: "linux", architecture: "arm64" }, conditions: [{ type: "Ready", status: "True" }] },
    },
  ];

  const storageClasses = [
    {
      apiVersion: "storage.k8s.io/v1",
      kind: "StorageClass",
      metadata: { name: "standard", uid: `uid-sc-standard-${context.name}`, resourceVersion: "1" },
      provisioner: "kubernetes.io/no-provisioner",
      reclaimPolicy: "Retain",
      volumeBindingMode: "WaitForFirstConsumer",
      allowVolumeExpansion: true,
    },
    {
      apiVersion: "storage.k8s.io/v1",
      kind: "StorageClass",
      metadata: { name: "csi-snap", uid: `uid-sc-csi-${context.name}`, resourceVersion: "1" },
      provisioner: "csi.example.com",
      reclaimPolicy: "Delete",
      volumeBindingMode: "Immediate",
    },
  ];

  const pvcs = [
    {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: { name: "data-pvc", namespace: "default", uid: `uid-pvc-data-${context.name}`, resourceVersion: "10" },
      spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "5Gi" } }, storageClassName: "standard", volumeName: "pv-data" },
      status: { phase: "Bound", capacity: { storage: "5Gi" }, conditions: [{ type: "FileSystemResizePending", status: "False" }] },
    },
    {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: { name: "small-pvc", namespace: "default", uid: `uid-pvc-small-${context.name}`, resourceVersion: "11" },
      spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } }, storageClassName: "standard", volumeName: "pv-small" },
      status: { phase: "Bound", capacity: { storage: "1Gi" } },
    },
  ];

  const pvs = [
    {
      apiVersion: "v1",
      kind: "PersistentVolume",
      metadata: { name: "pv-data", uid: `uid-pv-data-${context.name}`, resourceVersion: "20" },
      spec: { capacity: { storage: "5Gi" }, storageClassName: "standard", claimRef: { name: "data-pvc", namespace: "default" } },
      status: { phase: "Bound" },
    },
  ];

  const snapshotClasses = context.hasSnapshots
    ? [
      {
        apiVersion: "snapshot.storage.k8s.io/v1",
        kind: "VolumeSnapshotClass",
        metadata: { name: "csi-snapclass", uid: `uid-vsc-${context.name}`, resourceVersion: "1" },
        driver: "csi.example.com",
        deletionPolicy: "Delete",
      },
    ]
    : [];

  const volumeSnapshots = context.hasSnapshots
    ? [
      {
        apiVersion: "snapshot.storage.k8s.io/v1",
        kind: "VolumeSnapshot",
        metadata: { name: "snap-1", namespace: "default", uid: `uid-vs-1-${context.name}`, resourceVersion: "1" },
        spec: { volumeSnapshotClassName: "csi-snapclass", source: { persistentVolumeClaimName: "data-pvc" } },
        status: { readyToUse: true, restoreSize: "5Gi", snapshotHandle: "snap-handle-1" },
      },
      {
        apiVersion: "snapshot.storage.k8s.io/v1",
        kind: "VolumeSnapshot",
        metadata: { name: "snap-pending", namespace: "default", uid: `uid-vs-pending-${context.name}`, resourceVersion: "1" },
        spec: { volumeSnapshotClassName: "csi-snapclass", source: { persistentVolumeClaimName: "small-pvc" } },
        status: { readyToUse: false },
      },
      {
        apiVersion: "snapshot.storage.k8s.io/v1",
        kind: "VolumeSnapshot",
        metadata: { name: "snap-error", namespace: "default", uid: `uid-vs-error-${context.name}`, resourceVersion: "1" },
        spec: { volumeSnapshotClassName: "csi-snapclass", source: { persistentVolumeClaimName: "data-pvc" } },
        status: { readyToUse: false, error: { message: "snapshot creation failed", time: "2024-01-01T00:00:00Z" } },
      },
    ]
    : [];

  const volumeSnapshotContents = context.hasSnapshots
    ? [
      {
        apiVersion: "snapshot.storage.k8s.io/v1",
        kind: "VolumeSnapshotContent",
        metadata: { name: "content-1", uid: `uid-vsc-1-${context.name}`, resourceVersion: "1" },
        spec: {
          driver: "csi.test.io",
          deletionPolicy: "Delete",
          volumeSnapshotRef: { name: "snap-1", namespace: "default" },
          source: { snapshotHandle: "snap-handle-1" },
          volumeSnapshotClassName: "csi-snapclass",
        },
        status: { snapshotHandle: "snap-handle-1", readyToUse: true },
      },
    ]
    : [];

  function findResource(collection, pathname) {
    const match = pathname.match(/\/([^/]+)$/);
    const name = match ? decodeURIComponent(match[1]) : undefined;

    return { name, item: collection.find(candidate => candidate.metadata.name === name) };
  }

  function broadcast(type, object, resourcePath) {
    for (const watcher of activeWatches) {
      if (watcher.__watchPath?.includes(resourcePath)) {
        watcher.write(`${JSON.stringify({ type, object }) }\n`);
      }
    }
  }

  function apiResource(name, kind, namespaced = true, verbs = ["create", "delete", "get", "list", "patch", "update", "watch"]) {
    return { name, singularName: name, namespaced, kind, verbs, shortNames: [] };
  }

  function coreResourceList() {
    return {
      kind: "APIResourceList",
      apiVersion: "v1",
      groupVersion: "v1",
      resources: [
        apiResource("namespaces", "Namespace", false),
        apiResource("nodes", "Node", false),
        apiResource("persistentvolumeclaims", "PersistentVolumeClaim"),
        apiResource("persistentvolumes", "PersistentVolume", false),
        apiResource("events", "Event"),
        apiResource("pods", "Pod"),
        apiResource("configmaps", "ConfigMap"),
        apiResource("secrets", "Secret"),
        apiResource("services", "Service"),
      ],
    };
  }

  function snapshotResourceList() {
    return {
      kind: "APIResourceList",
      apiVersion: "v1",
      groupVersion: "snapshot.storage.k8s.io/v1",
      resources: [
        apiResource("volumesnapshots", "VolumeSnapshot"),
        apiResource("volumesnapshotclasses", "VolumeSnapshotClass", false),
        apiResource("volumesnapshotcontents", "VolumeSnapshotContent", false),
      ],
    };
  }

  function storageResourceList() {
    return {
      kind: "APIResourceList",
      apiVersion: "v1",
      groupVersion: "storage.k8s.io/v1",
      resources: [apiResource("storageclasses", "StorageClass", false)],
    };
  }

  function emptyResourceList(groupVersion) {
    return { kind: "APIResourceList", apiVersion: "v1", groupVersion, resources: [] };
  }

  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
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

      requests.push({
        method: request.method,
        pathname: requestUrl.pathname,
        search: requestUrl.search,
        dryRun: isDryRun,
        body: parsedBody,
      });

      handleRequest();
    });

    function handleWatch(items, resourcePath) {
      response.writeHead(200, { "content-type": "application/json" });
      response.__watchPath = resourcePath;
      activeWatches.add(response);

      // Keep the watch stream alive. The store already has items from the initial
      // list load; sending synthetic ADDED events here can race with retries and
      // produce malformed objects in some Lens versions.
      request.on("close", () => activeWatches.delete(response));
    }

    function listOrWatch(items, listKind, apiVersion, resourcePath) {
      if (isWatch) {
        return handleWatch(items, resourcePath);
      }

      return json(response, 200, list(listKind, items, apiVersion));
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

      if (pathname === "/api") {
        return json(response, 200, { kind: "APIVersions", versions: ["v1"] });
      }

      if (pathname === "/api/v1") {
        return json(response, 200, coreResourceList());
      }

      if (pathname === "/apis") {
        const groups = [
          { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }] },
          { name: "storage.k8s.io", versions: [{ groupVersion: "storage.k8s.io/v1", version: "v1" }] },
          { name: "rbac.authorization.k8s.io", versions: [{ groupVersion: "rbac.authorization.k8s.io/v1", version: "v1" }] },
        ];

        if (context.hasSnapshots) {
          groups.push({ name: "snapshot.storage.k8s.io", versions: [{ groupVersion: "snapshot.storage.k8s.io/v1", version: "v1" }] });
        }

        return json(response, 200, { kind: "APIGroupList", apiVersion: "v1", groups });
      }

      if (pathname === "/apis/storage.k8s.io/v1") {
        return json(response, 200, storageResourceList());
      }

      if (pathname === "/apis/snapshot.storage.k8s.io/v1") {
        return json(response, 200, snapshotResourceList());
      }

      if (/^\/apis\/[^/]+\/[^/]+$/.test(pathname)) {
        return json(response, 200, emptyResourceList(pathname.replace("/apis/", "")));
      }

      if (pathname.startsWith("/api/v1/nodes")) {
        if (/nodes\/[^/]+$/.test(pathname)) {
          return json(response, 200, nodes[0]);
        }

        return listOrWatch(nodes, "NodeList", "v1", "/nodes");
      }

      if (pathname.includes("/persistentvolumeclaims")) {
        if (/persistentvolumeclaims\/[^/]+$/.test(pathname)) {
          if (request.method === "PATCH") {
            const { item } = findResource(pvcs, pathname);

            if (!item) {
              return json(response, 404, statusError(404, "NotFound", "pvc not found"));
            }

            const patch = Array.isArray(parsedBody) ? parsedBody : [];
            const newSize = patch.find(op => op.op === "replace" && op.path === "/spec/resources/requests/storage")?.value ?? item.spec.resources.requests.storage;

            const result = {
              ...item,
              spec: { ...item.spec, resources: { requests: { storage: newSize } } },
              metadata: { ...item.metadata, resourceVersion: isDryRun ? "999-dry-run" : String(Number(item.metadata.resourceVersion) + 1) },
            };

            if (!isDryRun) {
              Object.assign(item, result);
              broadcast("MODIFIED", item, "/persistentvolumeclaims");
            }

            return json(response, 200, result);
          }

          const { item } = findResource(pvcs, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "pvc not found"));
        }

        return listOrWatch(pvcs, "PersistentVolumeClaimList", "v1", "/persistentvolumeclaims");
      }

      if (pathname.includes("/persistentvolumes")) {
        if (/persistentvolumes\/[^/]+$/.test(pathname)) {
          const { item } = findResource(pvs, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "pv not found"));
        }

        return listOrWatch(pvs, "PersistentVolumeList", "v1", "/persistentvolumes");
      }

      if (pathname.includes("/storageclasses")) {
        if (/storageclasses\/[^/]+$/.test(pathname)) {
          const { item } = findResource(storageClasses, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "storageclass not found"));
        }

        return listOrWatch(storageClasses, "StorageClassList", "storage.k8s.io/v1", "/storageclasses");
      }

      if (pathname.includes("/volumesnapshotclasses")) {
        if (!context.hasSnapshots) {
          return json(response, 404, statusError(404, "NotFound", "resource not found"));
        }

        if (/volumesnapshotclasses\/[^/]+$/.test(pathname)) {
          const { item } = findResource(snapshotClasses, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "volumesnapshotclass not found"));
        }

        return listOrWatch(snapshotClasses, "VolumeSnapshotClassList", "snapshot.storage.k8s.io/v1", "/volumesnapshotclasses");
      }

      if (pathname.includes("/volumesnapshotcontents")) {
        if (!context.hasSnapshots) {
          return json(response, 404, statusError(404, "NotFound", "resource not found"));
        }

        if (/volumesnapshotcontents\/[^/]+$/.test(pathname)) {
          const { item } = findResource(volumeSnapshotContents, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "volumesnapshotcontent not found"));
        }

        return listOrWatch(volumeSnapshotContents, "VolumeSnapshotContentList", "snapshot.storage.k8s.io/v1", "/volumesnapshotcontents");
      }

      if (pathname.includes("/volumesnapshots")) {
        if (!context.hasSnapshots) {
          return json(response, 404, statusError(404, "NotFound", "resource not found"));
        }

        if (request.method === "POST" && /namespaces\/[^/]+\/volumesnapshots$/.test(pathname)) {
          const submitted = parsedBody ?? {};
          const name = submitted.metadata?.name ?? "new-snapshot";

          if (isDryRun) {
            return json(response, 200, {
              ...submitted,
              metadata: { ...submitted.metadata, uid: `uid-${name}-dry-run`, resourceVersion: "dry-run" },
            });
          }

          const newSnapshot = {
            ...submitted,
            metadata: { ...submitted.metadata, uid: `uid-${name}-${Date.now()}`, resourceVersion: "1" },
            status: { readyToUse: false },
          };

          volumeSnapshots.push(newSnapshot);
          broadcast("ADDED", newSnapshot, "/volumesnapshots");

          return json(response, 201, newSnapshot);
        }

        if (/volumesnapshots\/[^/]+$/.test(pathname)) {
          const { item } = findResource(volumeSnapshots, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "volumesnapshot not found"));
        }

        return listOrWatch(volumeSnapshots, "VolumeSnapshotList", "snapshot.storage.k8s.io/v1", "/volumesnapshots");
      }

      if (pathname.includes("/events")) {
        if (isWatch) {
          return handleWatch([], "/events");
        }

        return json(response, 200, list("EventList", [], "v1"));
      }

      if (pathname.includes("/pods")) {
        if (isWatch) {
          return handleWatch([], "/pods");
        }

        return json(response, 200, list("PodList", [], "v1"));
      }

      if (pathname === "/api/v1/namespaces" || /^\/api\/v1\/namespaces\/[^/]+$/.test(pathname)) {
        if (isWatch) {
          return handleWatch(namespaces, "/namespaces");
        }

        if (/namespaces\/[^/]+$/.test(pathname)) {
          const { item } = findResource(namespaces, pathname);

          return item ? json(response, 200, item) : json(response, 404, statusError(404, "NotFound", "namespace not found"));
        }

        return json(response, 200, list("NamespaceList", namespaces, "v1"));
      }

      if (isWatch) {
        return handleWatch([], pathname);
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
        close: () => new Promise(cb => {
          server.close(cb);
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
    hotbars: [{ id: "default-hotbar", name: "default", items: pinnedClusterIds.map((uid) => ({ entity: { uid } })) }],
    __internal__: { migrations: { version: "6.5.0" } },
  }, null, 2), { mode: 0o600 });

  fs.writeFileSync(path.join(userData, "lens-user-store.json"), JSON.stringify({
    preferences: { colorTheme: "Midnight Graphite", tableDensity: "compact", environmentColors: {} },
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

async function openPvcMenu(frame, pvcName) {
  const row = frame.locator(`.TableRow:has-text("${pvcName}")`).first();

  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.locator('.TableCell.menu i.Icon, .TableCell.menu [data-testid^="icon-for-menu-actions"]').first().click();
}

async function run() {
  console.log("=== OpenLens DevOps Revival — R7-04 E2E Verification ===");
  console.log(`Executable: ${executable}`);
  console.log(`Evidence:   ${evidenceDir}`);

  assert(fs.existsSync(executable), `Executable not found at ${executable}. Build the app stage first.`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r7-04-"));
  const fixtures = [];

  for (const c of contexts) {
    fixtures.push(await createLocalApiFixture(c));
  }

  const profile = createProfile(tempRoot, "r7-04-test", fixtures);

  const results = {
    milestone: "R7-04",
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
    results.checkpoints[key] = true;
    console.log(`✓ ${message}`);
  };

  let electronApp = null;
  let page = null;

  const getFixtureRequests = (fixture) => ({
    dryRuns: fixture.requests.filter(r => r.dryRun),
    real: fixture.requests.filter(r => !r.dryRun && ["POST", "PUT", "PATCH", "DELETE"].includes(r.method)),
  });

  try {
    console.log("Launching OpenLens DevOps via Playwright...");
    electronApp = await _electron.launch({
      executablePath: executable,
      args: ["--integration-testing", "--enable-workspace-tabs"],
      env: appEnvironment(profile),
      timeout: 90_000,
    });

    page = await waitForMainRenderer(electronApp);

    page.on("console", (msg) => console.log(`[renderer] ${msg.type()}: ${msg.text()}`));
    electronApp.process().stderr?.on("data", (data) => console.log(`[electron stderr] ${data.toString().trim()}`));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(2000);

    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(1000);
    await screenshot(page, "01-catalog-view.png", results);
    pass("catalogLoaded", "Catalog loaded successfully.");

    // ---- DEV cluster: snapshot resources visible and listable ----
    const devFixture = fixtures[0];
    const devClusterId = profile.clusters[0].id;
    const devRow = page.getByText("DEV Storage", { exact: true });

    await devRow.waitFor({ state: "visible", timeout: 10_000 });
    await devRow.click();
    await page.waitForTimeout(3000);
    await page.locator(`#cluster-frame-${devClusterId}`).waitFor({ state: "attached", timeout: 20_000 });

    const devFrame = page.frameLocator(`#cluster-frame-${devClusterId}`);

    await openSidebarRoute(page, devFrame, "storage", "persistent-volume-claims");
    await page.waitForTimeout(1500);
    await screenshot(page, "02-dev-pvc-list.png", results);
    pass("devPvcListLoaded", "DEV PVC list loaded.");

    // Allow non-core API discovery to settle.
    await page.waitForTimeout(5000);

    // ---- DEV cluster: expand PVC with dry-run then real patch ----
    await openPvcMenu(devFrame, "data-pvc");

    const expandItem = devFrame.locator('[data-testid="volume-claim-menu-expand"]').first();

    await expandItem.waitFor({ state: "visible", timeout: 10_000 });
    await expandItem.click();
    await page.waitForTimeout(1000);

    await devFrame.locator('[data-testid="pvc-expand-input-step"]').waitFor({ state: "visible", timeout: 15_000 });
    await screenshot(page, "03-dev-expand-dialog.png", results);

    const sizeInput = devFrame.locator('[data-testid="pvc-expand-size-input"]').first();

    await sizeInput.fill("10Gi");
    await page.waitForTimeout(500);

    const expandDryRunBefore = getFixtureRequests(devFixture).dryRuns.length;

    await devFrame.locator('[data-testid="pvc-expand-run-dry-run"]').first().click();
    await page.waitForTimeout(1500);

    await devFrame.locator('[data-testid="pvc-expand-dry-run-passed"]').first().waitFor({ state: "visible", timeout: 15_000 });
    await screenshot(page, "04-dev-expand-dry-run-passed.png", results);

    const expandDryRunAfter = getFixtureRequests(devFixture).dryRuns.length;

    assert(expandDryRunAfter > expandDryRunBefore, "Expand dry-run request must have been sent");
    pass("devExpandPvcDryRun", "Expand PVC dry-run request accepted.");

    await devFrame.locator('[data-testid="pvc-expand-continue-to-confirm"]').first().click();
    await devFrame.locator('[data-testid="pvc-expand-confirm-step"]').waitFor({ state: "visible", timeout: 10_000 });

    await devFrame.getByText("I understand this will increase the requested storage for this PVC.").first().click();
    await page.waitForTimeout(300);

    await devFrame.locator('[data-testid="pvc-expand-execute"]').first().click();
    await page.waitForTimeout(1500);

    const expandReal = getFixtureRequests(devFixture).real.filter(r => r.pathname.includes("/persistentvolumeclaims") && r.method === "PATCH");

    assert(expandReal.length > 0, "A real PVC patch must have been sent");
    assert(!expandReal[expandReal.length - 1].dryRun, "Real patch must not be a dry-run");
    pass("devExpandPvcReal", "Expand PVC real PATCH sent without dry-run.");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ---- DEV cluster: create snapshot from PVC menu ----
    await openPvcMenu(devFrame, "data-pvc");

    const snapshotItem = devFrame.locator('[data-testid="volume-claim-menu-create-snapshot"]').first();

    await snapshotItem.waitFor({ state: "visible", timeout: 10_000 });
    await snapshotItem.click();
    await page.waitForTimeout(1000);

    await devFrame.locator('[data-testid="create-snapshot-input-step"]').waitFor({ state: "visible", timeout: 15_000 });
    await screenshot(page, "05-dev-create-snapshot-dialog.png", results);

    const nameInput = devFrame.locator('[data-testid="create-snapshot-name-input"]').first();

    await nameInput.fill("dev-snapshot-2");

    const classSelect = devFrame.locator('[data-testid="create-snapshot-class-select"]').first();

    await classSelect.selectOption("csi-snapclass");
    await page.waitForTimeout(500);

    const snapshotDryRunBefore = getFixtureRequests(devFixture).dryRuns.length;

    await devFrame.locator('[data-testid="create-snapshot-run-dry-run"]').first().click();
    await page.waitForTimeout(1500);

    await devFrame.locator('[data-testid="create-snapshot-dry-run-passed"]').first().waitFor({ state: "visible", timeout: 15_000 });
    await screenshot(page, "06-dev-create-snapshot-dry-run-passed.png", results);

    const snapshotDryRunAfter = getFixtureRequests(devFixture).dryRuns.length;

    assert(snapshotDryRunAfter > snapshotDryRunBefore, "Create snapshot dry-run request must have been sent");
    pass("devCreateSnapshotDryRun", "Create VolumeSnapshot dry-run request accepted.");

    await devFrame.locator('[data-testid="create-snapshot-continue-to-confirm"]').first().click();
    await devFrame.locator('[data-testid="create-snapshot-confirm-step"]').waitFor({ state: "visible", timeout: 10_000 });

    await devFrame.getByText("I understand this will create a new VolumeSnapshot from the selected PVC.").first().click();
    await page.waitForTimeout(300);

    await devFrame.locator('[data-testid="create-snapshot-execute"]').first().click();
    await page.waitForTimeout(1500);

    const snapshotReal = getFixtureRequests(devFixture).real.filter(r => r.pathname.includes("/volumesnapshots") && r.method === "POST");

    assert(snapshotReal.length > 0, "A real POST to create VolumeSnapshot must have been sent");
    assert(!snapshotReal[snapshotReal.length - 1].dryRun, "Real snapshot creation must not be a dry-run");
    pass("devCreateSnapshotReal", "Create VolumeSnapshot real POST sent without dry-run.");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ---- DEV cluster: snapshot resources visible and listable ----
    await openSidebarRoute(page, devFrame, "storage", "volume-snapshots");
    await page.waitForTimeout(1500);
    await screenshot(page, "07-dev-volume-snapshots.png", results);

    const snapRow = devFrame.locator('.TableRow:has-text("snap-1")').first();

    await snapRow.waitFor({ state: "visible", timeout: 15_000 });
    pass("devVolumeSnapshotsVisible", "Volume Snapshots sidebar and list visible on DEV cluster with CSI.");

    await snapRow.click();
    await page.waitForTimeout(1500);
    await screenshot(page, "08-dev-snapshot-drawer.png", results);

    const drawerTitle = await devFrame.locator('.drawer-title-text').first().innerText({ timeout: 10_000 }).catch(() => "");

    console.log("Snapshot drawer title:", JSON.stringify(drawerTitle));
    assert(drawerTitle.includes("snap-1"), "Snapshot drawer title should show snap-1");
    pass("devSnapshotDrawerOpens", "Snapshot drawer opens from list.");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);

    await openSidebarRoute(page, devFrame, "storage", "volume-snapshot-classes");
    await page.waitForTimeout(1500);
    await screenshot(page, "09-dev-snapshot-classes.png", results);

    const classRow = devFrame.locator('.TableRow:has-text("csi-snapclass")').first();

    await classRow.waitFor({ state: "visible", timeout: 15_000 });
    pass("devSnapshotClassesVisible", "Volume Snapshot Classes list visible on DEV cluster.");

    await openSidebarRoute(page, devFrame, "storage", "volume-snapshot-contents");
    await page.waitForTimeout(1500);
    await screenshot(page, "10-dev-snapshot-contents.png", results);

    const contentRow = devFrame.locator('.TableRow:has-text("content-1")').first();

    await contentRow.waitFor({ state: "visible", timeout: 15_000 });
    pass("devSnapshotContentsVisible", "Volume Snapshot Contents list visible on DEV cluster.");

    // ---- PROD cluster: production guard visible before real mutation ----
    const prodFixture = fixtures[1];
    const prodClusterId = profile.clusters[1].id;

    await navigate(electronApp, "/catalog");
    await page.waitForTimeout(1500);

    const prodRow = page.getByText("PROD Storage", { exact: true });

    await prodRow.waitFor({ state: "visible", timeout: 10_000 });
    await prodRow.click();
    await page.waitForTimeout(3000);
    await page.locator(`#cluster-frame-${prodClusterId}`).waitFor({ state: "attached", timeout: 20_000 });

    const prodFrame = page.frameLocator(`#cluster-frame-${prodClusterId}`);

    await openSidebarRoute(page, prodFrame, "storage", "persistent-volume-claims");
    await page.waitForTimeout(1500);
    await screenshot(page, "11-prod-pvc-list.png", results);
    pass("prodPvcListLoaded", "PROD PVC list loaded.");

    await openPvcMenu(prodFrame, "data-pvc");

    const prodExpandItem = prodFrame.locator('[data-testid="volume-claim-menu-expand"]').first();

    await prodExpandItem.waitFor({ state: "visible", timeout: 10_000 });
    await prodExpandItem.click();
    await page.waitForTimeout(1000);

    const prodSizeInput = prodFrame.locator('[data-testid="pvc-expand-size-input"]').first();

    await prodSizeInput.fill("10Gi");
    await page.waitForTimeout(500);

    await prodFrame.locator('[data-testid="pvc-expand-run-dry-run"]').first().click();
    await page.waitForTimeout(1500);

    await prodFrame.locator('[data-testid="pvc-expand-dry-run-passed"]').first().waitFor({ state: "visible", timeout: 15_000 });

    await prodFrame.locator('[data-testid="pvc-expand-continue-to-confirm"]').first().click();
    await prodFrame.locator('[data-testid="pvc-expand-confirm-step"]').waitFor({ state: "visible", timeout: 10_000 });

    const prodWarning = prodFrame.locator('[data-testid="pvc-expand-production-warning"]').first();

    await prodWarning.waitFor({ state: "visible", timeout: 10_000 });
    await screenshot(page, "12-prod-expand-guard.png", results);
    pass("prodExpandGuardVisible", "PROD guard banner visible before PVC expansion.");

    await prodFrame.getByText("I understand this will increase the requested storage for this PVC.").first().click();
    await page.waitForTimeout(300);

    await prodFrame.locator('[data-testid="pvc-expand-production-confirmation"]').first().fill("data-pvc");
    await page.waitForTimeout(300);

    await prodFrame.locator('[data-testid="pvc-expand-execute"]').first().click();
    await page.waitForTimeout(1500);

    const prodReal = getFixtureRequests(prodFixture).real.filter(r => r.pathname.includes("/persistentvolumeclaims") && r.method === "PATCH");
    const prodTotalDryRuns = getFixtureRequests(prodFixture).dryRuns.length;

    assert(prodReal.length > 0, "PROD real PVC patch must have been sent after confirmation");
    assert(prodTotalDryRuns === 1, `Only one dry-run must precede PROD real mutation (got ${prodTotalDryRuns})`);
    pass("prodExpandConfirmed", "PROD PVC expansion sent only after explicit confirmation and one dry-run.");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // ---- Legacy cluster: snapshot routes hidden when CRD absent ----
    const legacyClusterId = profile.clusters[2].id;

    await navigate(electronApp, "/catalog");
    await page.waitForTimeout(1500);

    const legacyRow = page.getByText("Legacy Storage", { exact: true });

    await legacyRow.waitFor({ state: "visible", timeout: 10_000 });
    await legacyRow.click();
    await page.waitForTimeout(3000);
    await page.locator(`#cluster-frame-${legacyClusterId}`).waitFor({ state: "attached", timeout: 20_000 });

    const legacyFrame = page.frameLocator(`#cluster-frame-${legacyClusterId}`);

    await openSidebarRoute(page, legacyFrame, "storage", "persistent-volume-claims");
    await page.waitForTimeout(1500);

    const legacySnapshotItem = legacyFrame.locator('[data-testid="sidebar-item-link-for-volume-snapshots"]').first();

    await screenshot(page, "13-legacy-snapshot-hidden.png", results);
    assert(!(await legacySnapshotItem.isVisible().catch(() => false)), "Volume Snapshots sidebar item must be hidden on legacy cluster");
    pass("legacySnapshotsHidden", "Volume Snapshots sidebar hidden when snapshot CRDs are absent.");

    results.status = "PASSED";
  } catch (error) {
    results.status = "FAILED";
    results.error = error.message;
    console.error("\n✗ R7-04 E2E verification failed:", error.message);
    console.error(error.stack);

    try {
      await screenshot(page, "99-failure.png", results);
    } catch {
      // ignore
    }

    throw error;
  } finally {
    if (electronApp) {
      try {
        await electronApp.close();
      } catch {
        // ignore
      }
    }

    for (const f of fixtures) {
      try {
        await f.close();
      } catch {
        // ignore
      }
    }

    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }

    results.fixtureRequests = fixtures.map((f, i) => ({
      context: f.context.name,
      requests: f.requests.slice(-200),
    }));

    const reportPath = path.join(evidenceDir, "r7-04-verification-report.json");

    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nReport written to ${reportPath}`);
  }

  console.log("\n=== R7-04 E2E Verification PASSED ===");
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
