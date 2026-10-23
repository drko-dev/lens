/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * R7-03 E2E verification: Deployment revision history, diff, safe rollback and pause/resume.
 *
 * Runs against a locally packaged build (experimental ARM64 stage) and synthetic
 * Kubernetes API fixtures listening on 127.0.0.1. No real cluster is touched.
 *
 * Usage:
 *   node docs/revival/scripts/verify-r7-03-rollouts.cjs
 *   OPENLENS_R7_03_OUTPUT=open-lens/dist-r7-03-stage node ...
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

const outputDir = process.env.OPENLENS_R7_03_OUTPUT
  || path.join(projectRoot, "open-lens/dist-r7-03-stage");
const executable = path.join(outputDir, "mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r7-03");

if (!fs.existsSync(evidenceDir)) {
  fs.mkdirSync(evidenceDir, { recursive: true });
}

const contexts = [
  {
    name: "dev-cluster",
    alias: "DEV Rollout",
    environment: "development",
    color: "#10B981",
    pinned: true,
  },
  {
    name: "prod-cluster",
    alias: "PROD Rollout",
    environment: "production",
    color: "#EF4444",
    pinned: true,
  },
];


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
  const rolloutFaults = {
    replicaSetReplacement: undefined,
    replicaSetDeletion: undefined,
    dryRunDelayMs: 0,
    pollErrorsAfterRollback: 0,
    pollErrorsRemaining: 0,
    pauseConflictNext: false,
  };

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

  const makeTemplate = (image, extra = {}) => ({
    metadata: { labels: { app: "web" } },
    spec: { containers: [{ name: "web", image, ...extra }] },
  });

  const deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: "web",
      namespace: "default",
      uid: `uid-deployment-${context.name}`,
      resourceVersion: "10",
      generation: 3,
      selfLink: "/apis/apps/v1/namespaces/default/deployments/web",
      annotations: { "deployment.kubernetes.io/revision": "3" },
    },
    spec: {
      replicas: 2,
      revisionHistoryLimit: 10,
      strategy: { type: "RollingUpdate", rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } },
      selector: { matchLabels: { app: "web" } },
      template: makeTemplate("nginx:1.29", { env: [{ name: "MODE", value: "prod" }] }),
    },
    status: { observedGeneration: 3, replicas: 2, updatedReplicas: 2, readyReplicas: 2, availableReplicas: 2, conditions: [] },
  };

  const replicaSets = [1, 2, 3].map((revision) => ({
    apiVersion: "apps/v1",
    kind: "ReplicaSet",
    metadata: {
      name: `web-${revision}`,
      namespace: "default",
      uid: `uid-rs-${revision}-${context.name}`,
      resourceVersion: "20",
      creationTimestamp: `2024-01-0${revision}T00:00:00Z`,
      selfLink: `/apis/apps/v1/namespaces/default/replicasets/web-${revision}`,
      annotations: {
        "deployment.kubernetes.io/revision": String(revision),
        ...(revision === 1 ? { "kubernetes.io/change-cause": "initial rollout" } : { "kubernetes.io/change-cause": `release ${revision}` }),
      },
      ownerReferences: [{ apiVersion: "apps/v1", kind: "Deployment", name: "web", uid: deployment.metadata.uid, controller: true }],
    },
    spec: {
      replicas: revision === 3 ? 2 : 0,
      selector: { matchLabels: { app: "web" } },
      template: makeTemplate(revision === 1 ? "nginx:1.27" : revision === 2 ? "nginx:1.28" : "nginx:1.29", revision === 3 ? { env: [{ name: "MODE", value: "prod" }] } : {}),
    },
  }));

  const daemonSet = {
    apiVersion: "apps/v1",
    kind: "DaemonSet",
    metadata: {
      name: "agent",
      namespace: "default",
      uid: `uid-ds-${context.name}`,
      resourceVersion: "30",
      selfLink: "/apis/apps/v1/namespaces/default/daemonsets/agent",
    },
    spec: {
      selector: { matchLabels: { app: "agent" } },
      updateStrategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: 1 } },
      template: { metadata: { labels: { app: "agent" } }, spec: { containers: [{ name: "agent", image: "agent:2" }] } },
    },
    status: { currentRevision: "agent-1", updateRevision: "agent-2", desiredNumberScheduled: 1, numberReady: 1 },
  };

  const statefulSet = {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    metadata: {
      name: "db",
      namespace: "default",
      uid: `uid-sts-${context.name}`,
      resourceVersion: "40",
      selfLink: "/apis/apps/v1/namespaces/default/statefulsets/db",
    },
    spec: {
      serviceName: "db",
      replicas: 1,
      selector: { matchLabels: { app: "db" } },
      template: { metadata: { labels: { app: "db" } }, spec: { containers: [{ name: "db", image: "postgres:16" }] } },
    },
  };

  const makeControllerRevision = (name, revision, ownerUid, ownerKind, image) => ({
    apiVersion: "apps/v1",
    kind: "ControllerRevision",
    metadata: {
      name,
      namespace: "default",
      uid: `uid-${name}`,
      resourceVersion: "1",
      selfLink: `/apis/apps/v1/namespaces/default/controllerrevisions/${name}`,
      creationTimestamp: "2024-01-01T00:00:00Z",
      ownerReferences: [{ apiVersion: "apps/v1", kind: ownerKind, name: "owner", uid: ownerUid, controller: true }],
      annotations: { "kubernetes.io/change-cause": `change ${revision}` },
    },
    revision,
    data: {
      spec: {
        template: {
          metadata: { labels: { app: "agent" }, "$patch": "replace" },
          spec: { containers: [{ name: "agent", image }] },
        },
        selector: { matchLabels: { app: "agent" } },
      },
    },
  });

  const controllerRevisions = [
    makeControllerRevision("agent-1", 1, daemonSet.metadata.uid, "DaemonSet", "agent:1"),
    makeControllerRevision("agent-2", 2, daemonSet.metadata.uid, "DaemonSet", "agent:2"),
    {
      ...makeControllerRevision("agent-0", 0, daemonSet.metadata.uid, "DaemonSet", "agent:0"),
      data: { historicalPayload: "controller-specific and unsupported" },
    },
    makeControllerRevision("db-1", 1, statefulSet.metadata.uid, "StatefulSet", "postgres:16"),
  ];

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

    function broadcast(type, object, resourcePath) {
      for (const watcher of activeWatches) {
        if (watcher.__watchPath?.includes(resourcePath)) {
          watcher.write(`${JSON.stringify({ type, object })}\n`);
        }
      }
    }

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
            { name: "daemonsets", singularName: "daemonset", namespaced: true, kind: "DaemonSet", verbs: ["get", "list", "watch"] },
            { name: "statefulsets", singularName: "statefulset", namespaced: true, kind: "StatefulSet", verbs: ["get", "list", "watch"] },
            { name: "controllerrevisions", singularName: "controllerrevision", namespaced: true, kind: "ControllerRevision", verbs: ["get", "list", "watch"] },
          ],
        });
      }

      if (isWatch) {
        response.__watchPath = pathname;
        activeWatches.add(response);
        response.writeHead(200, { "content-type": "application/json", connection: "keep-alive" });

        const initial = pathname.includes("/configmaps")
          ? configMaps
          : pathname.includes("/replicasets")
            ? replicaSets
            : pathname.includes("/controllerrevisions")
              ? controllerRevisions
              : pathname.includes("/daemonsets")
                ? [daemonSet]
                : pathname.includes("/statefulsets")
                  ? [statefulSet]
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

      if (pathname.includes("/replicasets")) {
        const { name, item } = findResource(replicaSets, pathname);

        if (request.method === "GET") {
          if (name === rolloutFaults.replicaSetDeletion) {
            return json(response, 404, statusError(404, "NotFound", "replicaset not found"));
          }

          if (name === rolloutFaults.replicaSetReplacement && item) {
            return json(response, 200, { ...item, metadata: { ...item.metadata, uid: "uid-rs-recreated" } });
          }

          return item
            ? json(response, 200, item)
            : json(response, 200, { apiVersion: "apps/v1", kind: "ReplicaSetList", metadata: { resourceVersion: "20" }, items: replicaSets });
        }

        return json(response, 404, statusError(404, "NotFound", `replicasets "${name}" not found`));
      }

      if (pathname.includes("/controllerrevisions")) {
        return json(response, 200, { apiVersion: "apps/v1", kind: "ControllerRevisionList", metadata: { resourceVersion: "1" }, items: controllerRevisions });
      }

      if (pathname.includes("/daemonsets")) {
        const { item } = findResource([daemonSet], pathname);

        return request.method === "GET"
          ? json(response, 200, item || { apiVersion: "apps/v1", kind: "DaemonSetList", metadata: { resourceVersion: "30" }, items: [daemonSet] })
          : json(response, 405, statusError(405, "MethodNotAllowed", "read-only fixture"));
      }

      if (pathname.includes("/statefulsets")) {
        const { item } = findResource([statefulSet], pathname);

        return request.method === "GET"
          ? json(response, 200, item || { apiVersion: "apps/v1", kind: "StatefulSetList", metadata: { resourceVersion: "40" }, items: [statefulSet] })
          : json(response, 405, statusError(405, "MethodNotAllowed", "read-only fixture"));
      }

      if (pathname.includes("/deployments")) {
        if (request.method === "GET") {
          if (/deployments\/[^/]+$/.test(pathname) && rolloutFaults.pollErrorsRemaining > 0) {
            rolloutFaults.pollErrorsRemaining--;

            return json(response, 503, statusError(503, "ServiceUnavailable", "synthetic polling failure"));
          }

          return json(response, 200, /deployments\/[^/]+$/.test(pathname)
            ? deployment
            : { apiVersion: "apps/v1", kind: "DeploymentList", metadata: { resourceVersion: "10" }, items: [deployment] });
        }

        if (request.method === "PATCH") {
          if (Array.isArray(parsedBody)) {
            const pauseOperation = parsedBody.find(operation => operation.path === "/spec/paused" && operation.op === "add");

            if (pauseOperation) {
              if (rolloutFaults.pauseConflictNext) {
                rolloutFaults.pauseConflictNext = false;
                deployment.metadata.resourceVersion = String(Number(deployment.metadata.resourceVersion) + 1);

                return json(response, 409, statusError(409, "Conflict", "Deployment changed concurrently"));
              }

              const expectedUid = parsedBody.find(operation => operation.op === "test" && operation.path === "/metadata/uid")?.value;
              const expectedResourceVersion = parsedBody.find(operation => operation.op === "test" && operation.path === "/metadata/resourceVersion")?.value;

              if (expectedUid !== deployment.metadata.uid || expectedResourceVersion !== deployment.metadata.resourceVersion) {
                return json(response, 409, statusError(409, "Conflict", "Deployment changed concurrently"));
              }

              deployment.spec.paused = pauseOperation.value;
              deployment.metadata.resourceVersion = String(Number(deployment.metadata.resourceVersion) + 1);
              broadcast("MODIFIED", deployment, "/deployments");

              return json(response, 200, deployment);
            }

            const hasVersionTest = parsedBody.some(op => op.op === "test" && op.path === "/metadata/resourceVersion");

            if (isDryRun) {
              const delayMs = rolloutFaults.dryRunDelayMs;

              rolloutFaults.dryRunDelayMs = 0;

              if (delayMs > 0) {
                return setTimeout(() => json(response, 200, { ...deployment, metadata: { ...deployment.metadata, resourceVersion: "999-dry-run" } }), delayMs);
              }

              return hasVersionTest
                ? json(response, 200, { ...deployment, metadata: { ...deployment.metadata, resourceVersion: "999-dry-run" } })
                : json(response, 422, statusError(422, "Invalid", "dry-run patch missing resourceVersion precondition"));
            }

            if (hasVersionTest) {
              const target = deployment.spec.template;

              for (const op of parsedBody.filter(operation => operation.op !== "test")) {
                const segments = op.path.replace(/^\//, "").split("/").slice(2);

                if (op.op === "replace" || op.op === "add") {
                  let cursor = target;

                  for (const segment of segments.slice(0, -1)) {
                    cursor = cursor[segment];
                  }

                  cursor[segments[segments.length - 1]] = op.value;
                }
              }

              deployment.metadata.resourceVersion = String(Number(deployment.metadata.resourceVersion) + 1);
              deployment.metadata.generation += 1;
              deployment.metadata.annotations["deployment.kubernetes.io/revision"] = "4";
              deployment.status = { observedGeneration: deployment.metadata.generation, replicas: 2, updatedReplicas: 2, readyReplicas: 2, availableReplicas: 2, conditions: [] };
              rolloutFaults.pollErrorsRemaining = rolloutFaults.pollErrorsAfterRollback;
              rolloutFaults.pollErrorsAfterRollback = 0;
              broadcast("MODIFIED", deployment, "/deployments");
            }

            return json(response, 200, deployment);
          }

          if (isDryRun) {
            return json(response, 200, { ...deployment, metadata: { ...deployment.metadata, resourceVersion: "999-dry-run" } });
          }

          if (parsedBody?.spec && "paused" in parsedBody.spec) {
            deployment.spec.paused = parsedBody.spec.paused;
            deployment.metadata.resourceVersion = String(Number(deployment.metadata.resourceVersion) + 1);
            broadcast("MODIFIED", deployment, "/deployments");
          }

          return json(response, 200, deployment);
        }
      }

      if (pathname.includes("/events")) {
        return json(response, 200, { apiVersion: "v1", kind: "EventList", metadata: { resourceVersion: "1" }, items: [] });
      }

      if (pathname.includes("/pods")) {
        return json(response, 200, {
          apiVersion: "v1",
          kind: "PodList",
          metadata: { resourceVersion: "1" },
          items: pods,
        });
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
        state: { deployment, replicaSets, controllerRevisions, daemonSet, statefulSet, rolloutFaults },
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
  console.log("=== OpenLens DevOps Revival — R7-03 E2E Verification ===");
  console.log(`Executable: ${executable}`);
  console.log(`Evidence:   ${evidenceDir}`);

  assert(fs.existsSync(executable), `Executable not found at ${executable}. Build the app stage first.`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r7-03-"));
  const fixtures = [];

  for (const c of contexts) {
    fixtures.push(await createLocalApiFixture(c));
  }

  const profile = createProfile(tempRoot, "r7-03-test", fixtures);

  const results = {
    milestone: "R7-03",
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
    await page.waitForTimeout(800);
    await screenshot(page, "01-catalog-view.png", results);
    pass("catalogLoaded", "Catalog loaded successfully.");

    const enterCluster = async (alias, index) => {
      const row = page.getByTestId("catalog-list-for-browse-all").getByText(alias, { exact: true });

      await row.waitFor({ state: "visible", timeout: 10_000 });
      await row.click();
      await page.waitForTimeout(3000);

      const clusterId = profile.clusters[index].id;

      await page.locator(`#cluster-frame-${clusterId}`).waitFor({ state: "attached", timeout: 20_000 });

      return page.frameLocator(`#cluster-frame-${clusterId}`);
    };

    const openDeploymentDetails = async (frame) => {
      await openSidebarRoute(page, frame, "workloads", "deployments");
      await page.waitForTimeout(1200);

      const row = frame.locator('.TableRow:has-text("web")').first();

      await row.waitFor({ state: "visible", timeout: 20_000 });
      await row.locator(".TableCell.name").first().click();
      await frame.getByTestId("deployment-revisions").waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(800);
    };

    const closeDialog = async (frame, className) => {
      await page.keyboard.press("Escape");
      await frame.locator(`.${className}`).waitFor({ state: "detached", timeout: 5_000 });
    };

    // ---- DEV cluster: history, diff, dry-run and rollback ----
    const devFixture = fixtures[0];
    let devFrame = await enterCluster("DEV Rollout", 0);

    await openDeploymentDetails(devFrame);

    const historyText = await devFrame.getByTestId("deployment-revisions").textContent();

    for (const expected of ["Revision", "Images", "Change Cause", "initial rollout", "release 2", "nginx:1.27", "Current"]) {
      assert(historyText.includes(expected), `History table must include "${expected}"`);
    }

    await screenshot(page, "02-deployment-revision-history.png", results);
    pass("revisionHistoryRendered", "Deployment revision history shows revisions, images, change causes and current marker.");

    const templateBefore = JSON.stringify(devFixture.state.deployment.spec.template);
    const resourceVersionBefore = devFixture.state.deployment.metadata.resourceVersion;

    await devFrame.getByTestId("revision-diff-1").click();
    await devFrame.getByTestId("revision-diff").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800);

    const diffText = await devFrame.getByTestId("revision-diff").textContent();

    assert(diffText.includes("Images"), "Diff dialog must identify image changes");
    assert(diffText.includes("#3") && diffText.includes("#1"), "Diff dialog must identify both revisions");
    await page.locator(".RevisionDiffDialog").first().screenshot({ path: path.join(evidenceDir, "03-revision-diff.png") }).catch(() => undefined);
    await screenshot(page, "03-revision-diff.png", results);
    pass("revisionDiffReadOnly", "Read-only revision diff shows the template changes.");
    await closeDialog(devFrame, "RevisionDiffDialog");

    const deploymentRollbackPatchCount = () => devFixture.requests.filter(request => (
      request.method === "PATCH"
      && request.pathname === "/apis/apps/v1/namespaces/default/deployments/web"
    )).length;
    const patchCountBeforeIdentityChecks = deploymentRollbackPatchCount();

    await devFrame.getByTestId("revision-rollback-1").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    devFixture.state.rolloutFaults.replicaSetReplacement = "web-1";
    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-preparation-error").waitFor({ state: "visible", timeout: 20_000 });
    assert((await devFrame.getByTestId("rollback-preparation-error").textContent()).includes("replaced"), "A recreated ReplicaSet must block rollback preparation");
    assert(deploymentRollbackPatchCount() === patchCountBeforeIdentityChecks, "A replaced ReplicaSet must not send a Deployment PATCH");
    devFixture.state.rolloutFaults.replicaSetReplacement = undefined;
    await devFrame.getByText("Cancel", { exact: true }).click();

    await devFrame.getByTestId("revision-rollback-1").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    devFixture.state.rolloutFaults.replicaSetDeletion = "web-1";
    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-preparation-error").waitFor({ state: "visible", timeout: 20_000 });
    assert((await devFrame.getByTestId("rollback-preparation-error").textContent()).includes("no longer exists"), "A deleted revision must block rollback preparation");
    assert(deploymentRollbackPatchCount() === patchCountBeforeIdentityChecks, "A deleted revision must not send a Deployment PATCH");
    devFixture.state.rolloutFaults.replicaSetDeletion = undefined;
    await devFrame.getByText("Cancel", { exact: true }).click();
    pass("replicaSetIdentityGuards", "Recreated and deleted ReplicaSets block rollback before any Deployment PATCH.");

    // Keep one Dry-Run response in flight while switching to a different cluster context.
    await devFrame.getByTestId("revision-rollback-2").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-diff-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-step").waitFor({ state: "visible", timeout: 20_000 });
    devFixture.state.rolloutFaults.dryRunDelayMs = 2500;
    const delayedDryRunsBefore = devFixture.requests.filter(request => request.dryRun && request.method === "PATCH").length;
    await devFrame.getByTestId("rollback-run-dry-run").click();
    await page.waitForTimeout(200);
    assert(devFixture.requests.filter(request => request.dryRun && request.method === "PATCH").length === delayedDryRunsBefore + 1, "Delayed Dry-Run request must reach the API fixture");
    await devFrame.getByText("Cancel", { exact: true }).click();

    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    await enterCluster("PROD Rollout", 1);
    await page.waitForTimeout(3000);
    await navigate(electronApp, "/catalog");
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });
    devFrame = await enterCluster("DEV Rollout", 0);
    await openDeploymentDetails(devFrame);
    await devFrame.getByTestId("revision-rollback-1").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-diff-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-step").waitFor({ state: "visible", timeout: 20_000 });
    assert(!(await devFrame.getByTestId("rollback-dry-run-passed").isVisible()), "A late Dry-Run must not leak into a fresh operation after closing and switching clusters");
    await devFrame.getByText("Cancel", { exact: true }).click();
    pass("lateDryRunDiscardedOnContextChange", "A late Dry-Run is discarded after close; a fresh operation after switching clusters starts clean.");

    await devFrame.getByTestId("revision-rollback-1").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(600);
    await screenshot(page, "04-rollback-history.png", results);

    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-diff-step").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(800);
    await screenshot(page, "05-rollback-diff.png", results);
    pass("rollbackDiffBeforeExecuting", "Rollback requires reviewing the template diff before execution.");

    await devFrame.getByTestId("rollback-continue-to-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-step").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(500);
    const dryRunCountBeforeSafeRollback = devFixture.requests.filter(request => request.dryRun && request.method === "PATCH").length;
    await devFrame.getByTestId("rollback-run-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-passed").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(500);
    await screenshot(page, "06-rollback-dry-run-passed.png", results);

    const dryRunRequests = devFixture.requests.filter(request => request.dryRun && request.method === "PATCH");

    assert(dryRunRequests.length === dryRunCountBeforeSafeRollback + 1, "The safe rollback must send exactly one new dry-run PATCH");
    assert(dryRunRequests[0].search.includes("dryRun=All"), "Dry-run must use ?dryRun=All");
    assert(dryRunRequests[0].pathname === "/apis/apps/v1/namespaces/default/deployments/web", "Dry-run must target the Deployment");
    assert(
      Array.isArray(dryRunRequests[0].body) && dryRunRequests[0].body.some(op => op.op === "test" && op.path === "/metadata/resourceVersion"),
      "Dry-run must include the resourceVersion precondition",
    );
    results.dryRunRequests.push(`${dryRunRequests[0].method} ${dryRunRequests[0].pathname}${dryRunRequests[0].search}`);

    assert(JSON.stringify(devFixture.state.deployment.spec.template) === templateBefore, "Dry-run must not mutate the Pod template");
    assert(devFixture.state.deployment.metadata.resourceVersion === resourceVersionBefore, "Dry-run must not bump the resourceVersion");
    pass("serverDryRunNonMutating", "Server-side dry-run was sent with preconditions and changed nothing.");

    await devFrame.getByTestId("rollback-continue-to-confirm").click();
    await devFrame.getByTestId("rollback-confirm-step").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(400);
    await screenshot(page, "07-rollback-confirm.png", results);

    await devFrame.getByText("I understand this will trigger a new rollout", { exact: true }).click();
    await page.waitForTimeout(300);
    await devFrame.getByTestId("rollback-execute").click();
    await devFrame.getByTestId("rollback-result-step").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1000);
    await screenshot(page, "08-rollback-result.png", results);

    const realPatches = devFixture.requests.filter(request => request.method === "PATCH" && !request.dryRun && Array.isArray(request.body));

    assert(realPatches.length === 1, "Exactly one real rollback PATCH must be sent");
    results.realMutations.push(`${realPatches[0].method} ${realPatches[0].pathname}`);
    assert(devFixture.state.deployment.spec.template.spec.containers[0].image === "nginx:1.27", "Rollback must restore the selected image");
    assert(devFixture.state.deployment.metadata.annotations["deployment.kubernetes.io/revision"] === "4", "Rollback must create a new revision");
    pass("rollbackExecutedSafely", "Rollback executed after dry-run and confirmation, restoring the selected template.");
    pass("rollbackObserved", "Rollout observation reached a terminal state in the dialog.");

    await devFrame.locator(".RolloutRollbackDialog .rollout-secondary-button").last().click();
    await page.waitForTimeout(700);

    // Re-run rollback with persistent API errors to prove observation terminates visibly as unverified.
    await devFrame.getByTestId("revision-rollback-2").click();
    await devFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-diff").click();
    await devFrame.getByTestId("rollback-diff-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-run-dry-run").click();
    await devFrame.getByTestId("rollback-dry-run-passed").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByTestId("rollback-continue-to-confirm").click();
    await devFrame.getByTestId("rollback-confirm-step").waitFor({ state: "visible", timeout: 20_000 });
    await devFrame.getByText("I understand this will trigger a new rollout", { exact: true }).click();
    devFixture.state.rolloutFaults.pollErrorsAfterRollback = 3;
    await devFrame.getByTestId("rollback-execute").click();
    await devFrame.getByTestId("rollback-result-step").waitFor({ state: "visible", timeout: 30_000 });
    await devFrame.getByTestId("rollback-observation").waitFor({ state: "visible", timeout: 15_000 });
    const persistentPollingText = await devFrame.getByTestId("rollback-observation").textContent();

    assert(persistentPollingText.includes("unverified"), "Persistent API errors must end in an unverified terminal state");
    await devFrame.locator(".RolloutRollbackDialog .rollout-secondary-button").last().click();
    pass("persistentPollingErrorsVisible", "Repeated API polling errors terminate visibly as unverified, not rollback failure.");

    // ---- Pause / resume ----
    await openSidebarRoute(page, devFrame, "workloads", "deployments");
    await page.waitForTimeout(1000);

    const openDeploymentMenu = async (frame, label) => {
      const row = frame.locator('.TableRow:has-text("web")').first();

      await row.waitFor({ state: "visible", timeout: 20_000 });
      await row.locator('.TableCell.menu i.Icon, .TableCell.menu [data-testid^="icon-for-menu-actions"]').first().click();
      await page.waitForTimeout(500);

      const item = frame.getByText(label, { exact: true }).first();

      await item.waitFor({ state: "visible", timeout: 10_000 });
      await item.click();
      await page.waitForTimeout(1200);
    };

    devFixture.state.rolloutFaults.pauseConflictNext = true;
    await openDeploymentMenu(devFrame, "Pause rollout");

    assert(devFixture.state.deployment.spec.paused !== true, "A concurrent pause conflict must not change the local fixture state");

    await openDeploymentMenu(devFrame, "Pause rollout");

    assert(devFixture.state.deployment.spec.paused === true, "Pause rollout must set spec.paused=true");

    await openSidebarRoute(page, devFrame, "workloads", "pods");
    await page.waitForTimeout(800);
    await openSidebarRoute(page, devFrame, "workloads", "deployments");
    await page.waitForTimeout(1500);

    devFixture.state.rolloutFaults.pauseConflictNext = true;
    await openDeploymentMenu(devFrame, "Resume rollout");
    assert(devFixture.state.deployment.spec.paused === true, "A concurrent resume conflict must not unpause the Deployment");

    await openDeploymentMenu(devFrame, "Resume rollout");
    assert(devFixture.state.deployment.spec.paused === false, "Resume rollout must set spec.paused=false");
    pass("pauseResume", "Pause and resume use fresh preconditions, survive concurrent conflicts, and verify returned state.");

    // ---- Read-only ControllerRevision history ----
    await openSidebarRoute(page, devFrame, "workloads", "daemon-sets");
    await page.waitForTimeout(1000);
    await devFrame.locator('.TableRow:has-text("agent")').first().locator(".TableCell.name").first().click();
    await devFrame.getByTestId("controller-revision-history-daemonset").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(600);

    const daemonSetHistory = await devFrame.getByTestId("controller-revision-history-daemonset").textContent();

    assert(daemonSetHistory.includes("agent:1"), "DaemonSet history must show historical image");
    assert(daemonSetHistory.includes("Revision") && daemonSetHistory.includes("2"), "DaemonSet history must show the root ControllerRevision number");
    assert(daemonSetHistory.includes("Not available"), "Unsupported historical ControllerRevision data must not invent images");
    assert(daemonSetHistory.includes("read-only"), "DaemonSet history must be marked read-only");
    await screenshot(page, "09-daemonset-revision-history.png", results);

    await openSidebarRoute(page, devFrame, "workloads", "stateful-sets");
    await page.waitForTimeout(1000);
    await devFrame.locator('.TableRow:has-text("db")').first().locator(".TableCell.name").first().click();
    await devFrame.getByTestId("controller-revision-history-statefulset").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(600);

    assert((await devFrame.getByTestId("controller-revision-history-statefulset").textContent()).includes("postgres:16"), "StatefulSet history must show its ControllerRevision");
    await screenshot(page, "10-statefulset-revision-history.png", results);
    pass("controllerRevisionHistory", "DaemonSet and StatefulSet ControllerRevision history is visible and read-only.");

    // ---- PROD: explicit protection ----
    await navigate(electronApp, "/catalog");
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="catalog-filters"]').waitFor({ state: "visible", timeout: 20_000 });

    const prodFixture = fixtures[1];
    const prodFrame = await enterCluster("PROD Rollout", 1);

    await openSidebarRoute(page, prodFrame, "workloads", "deployments");
    await page.waitForTimeout(1000);
    await openDeploymentMenu(prodFrame, "Pause rollout");
    const productionPauseConfirmation = await prodFrame.locator("body").innerText();

    assert(productionPauseConfirmation.includes("PRODUCTION CLUSTER"), "PROD pause must require an explicit production confirmation");
    assert(productionPauseConfirmation.includes(profile.clusters[1].id), "PROD pause confirmation must identify the actual cluster");
    assert(productionPauseConfirmation.includes("default/web"), "PROD pause confirmation must identify the actual namespace and Deployment");
    await prodFrame.getByText("Cancel", { exact: true }).click();
    assert(prodFixture.requests.filter(request => request.method === "PATCH" && !request.dryRun).length === 0, "Declining the PROD pause confirmation must not PATCH");
    pass("prodPauseContext", "PROD pause confirmation names the real cluster, namespace and Deployment before mutation.");

    await openDeploymentDetails(prodFrame);
    await prodFrame.getByTestId("revision-rollback-1").click();
    await prodFrame.getByTestId("rollback-history-step").waitFor({ state: "visible", timeout: 20_000 });
    await prodFrame.getByTestId("rollback-continue-to-diff").click();
    await prodFrame.getByTestId("rollback-diff-step").waitFor({ state: "visible", timeout: 20_000 });
    await prodFrame.getByTestId("rollback-continue-to-dry-run").click();
    await prodFrame.getByTestId("rollback-dry-run-step").waitFor({ state: "visible", timeout: 20_000 });
    await prodFrame.getByTestId("rollback-run-dry-run").click();
    await prodFrame.getByTestId("rollback-dry-run-passed").waitFor({ state: "visible", timeout: 20_000 });
    await prodFrame.getByTestId("rollback-continue-to-confirm").click();
    await prodFrame.getByTestId("rollback-confirm-step").waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(500);

    assert(await prodFrame.getByTestId("rollback-production-warning").isVisible(), "PROD must show a red production warning");
    assert(await prodFrame.getByTestId("rollback-execute").isDisabled(), "PROD execute must be disabled before acknowledgement");

    await prodFrame.getByText("I understand this will trigger a new rollout", { exact: true }).click();
    await page.waitForTimeout(300);
    assert(await prodFrame.getByTestId("rollback-execute").isDisabled(), "PROD execute must require the Deployment name");

    await prodFrame.getByTestId("rollback-production-confirmation").fill("web");
    await page.waitForTimeout(400);
    assert(!(await prodFrame.getByTestId("rollback-execute").isDisabled()), "PROD execute must enable after ack and exact name");
    await screenshot(page, "11-prod-rollback-guard.png", results);

    const prodMutationsBefore = prodFixture.requests.filter(request => ["PUT", "PATCH"].includes(request.method) && !request.dryRun).length;

    assert(prodMutationsBefore === 0, "PROD fixture must not have received mutations while guards were verified");
    pass("prodGuards", "PROD rollback requires acknowledgement and exact Deployment name; no mutation before confirmation.");

    await prodFrame.getByText("Cancel", { exact: true }).click();

    results.status = "PASS";
    console.log("\n>>> ALL R7-03 PLAYWRIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<");
  } catch (error) {
    results.status = "FAIL";
    results.error = error instanceof Error ? error.stack : String(error);
    console.error("\n>>> R7-03 PLAYWRIGHT VERIFICATION FAILED <<<");
    console.error(error);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(evidenceDir, "R7_03_VERIFICATION.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(evidenceDir, "R7_03_VERIFICATION.log"), `${results.status}\n${JSON.stringify(results, null, 2)}\n`);

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
