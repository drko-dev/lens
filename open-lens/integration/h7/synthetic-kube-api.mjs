// Minimal synthetic Kubernetes API for isolated UI QA. Localhost only, read-only, no real data.
// Counts watches that are still open (decremented when the socket closes) separately from
// watches started over time, so cancellations can be verified end to end.
import http from "node:http";

const coreResources = [
  ["pods", "Pod", true], ["namespaces", "Namespace", false], ["events", "Event", true],
  ["nodes", "Node", false], ["services", "Service", true], ["configmaps", "ConfigMap", true],
  ["secrets", "Secret", true], ["persistentvolumeclaims", "PersistentVolumeClaim", true],
];
const appsResources = [
  ["deployments", "Deployment", true], ["replicasets", "ReplicaSet", true],
  ["statefulsets", "StatefulSet", true], ["daemonsets", "DaemonSet", true],
];
const batchResources = [["jobs", "Job", true], ["cronjobs", "CronJob", true]];
const networkingResources = [["ingresses", "Ingress", true], ["ingressclasses", "IngressClass", false]];
const NAMESPACE = "h7-synthetic";

const resourceList = (gv, list) => ({
  kind: "APIResourceList", groupVersion: gv,
  resources: list.map(([name, kind, namespaced]) => ({
    name, singularName: "", namespaced, kind,
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"], // advertised only; mutations are refused below
  })),
});

// Equality-based label selectors only ("a=b,c=d"); anything else matches nothing, like an unknown label.
const matchesSelector = (item, selector) => !selector || selector.split(",").every((term) => {
  const [key, value] = term.split("=");

  return value !== undefined && item.metadata?.labels?.[key.trim()] === value.trim();
});

function respond(pathname, labelSelector) {
  if (pathname === "/version") return { major: "1", minor: "30", gitVersion: "v1.30.0-h7-synthetic", platform: "linux/arm64" };
  if (pathname === "/api") return { kind: "APIVersions", versions: ["v1"], serverAddressByClientCIDRs: [] };
  if (pathname === "/apis") return {
    kind: "APIGroupList",
    groups: [
      { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }], preferredVersion: { groupVersion: "apps/v1", version: "v1" } },
      { name: "networking.k8s.io", versions: [{ groupVersion: "networking.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "networking.k8s.io/v1", version: "v1" } },
      { name: "batch", versions: [{ groupVersion: "batch/v1", version: "v1" }], preferredVersion: { groupVersion: "batch/v1", version: "v1" } },
      { name: "authorization.k8s.io", versions: [{ groupVersion: "authorization.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "authorization.k8s.io/v1", version: "v1" } },
    ],
  };
  // H7.6.1/H7.6.2: KubeApis with checkPreferredVersion or fallbackApiBases (Jobs, CronJobs, Ingresses) read the APIGroup before listing.
  const group = pathname.match(/^\/apis\/(apps|batch|networking\.k8s\.io)$/)?.[1];
  if (group) return { kind: "APIGroup", apiVersion: "v1", name: group, versions: [{ groupVersion: `${group}/v1`, version: "v1" }], preferredVersion: { groupVersion: `${group}/v1`, version: "v1" } };
  if (pathname === "/api/v1") return resourceList("v1", coreResources);
  if (pathname === "/apis/apps/v1") return resourceList("apps/v1", appsResources);
  if (pathname === "/apis/batch/v1") return resourceList("batch/v1", batchResources);
  if (pathname === "/apis/networking.k8s.io/v1") return resourceList("networking.k8s.io/v1", networkingResources);
  if (pathname === "/apis/authorization.k8s.io/v1") return resourceList("authorization.k8s.io/v1", [["selfsubjectaccessreviews", "SelfSubjectAccessReview", false], ["selfsubjectrulesreviews", "SelfSubjectRulesReview", false]]);
  if (pathname.includes("selfsubjectaccessreviews")) return { kind: "SelfSubjectAccessReview", apiVersion: "authorization.k8s.io/v1", status: { allowed: true } };
  if (pathname.includes("selfsubjectrulesreviews")) return {
    kind: "SelfSubjectRulesReview", apiVersion: "authorization.k8s.io/v1",
    status: { resourceRules: [{ verbs: ["*"], apiGroups: ["*"], resources: ["*"] }], nonResourceRules: [], incomplete: false },
  };
  if (pathname === `/api/v1/namespaces/${NAMESPACE}`) return { kind: "Namespace", apiVersion: "v1", ...namespace };

  const last = pathname.split("/").filter(Boolean).pop() || "";
  const kind = [...coreResources, ...appsResources, ...batchResources, ...networkingResources].find(([name]) => name === last)?.[1];

  if (kind) {
    const apiVersion = pathname.match(/^\/apis\/([^/]+\/v1)\//)?.[1] ?? "v1";

    return { kind: `${kind}List`, apiVersion, metadata: { resourceVersion: "1" }, items: itemsFor(last).filter((item) => matchesSelector(item, labelSelector)) };
  }

  return null;
}

const namespace = { metadata: { name: NAMESPACE, uid: "ns-1", resourceVersion: "1", creationTimestamp: "2026-11-02T00:00:00Z" }, status: { phase: "Active" } };

// H7.5: one synthetic Pod and Deployment so detached list windows have rows to show. Read-only data, no secrets.
export const syntheticPod = (name = "h7-pod-0", phase = "Running") => ({
  kind: "Pod", apiVersion: "v1",
  metadata: { name, namespace: NAMESPACE, uid: `uid-${name}`, resourceVersion: "1", creationTimestamp: "2026-11-02T00:00:00Z", labels: { app: "h7" } },
  spec: { nodeName: "h7-node", containers: [{ name: "app", image: "registry.invalid/h7:1" }] },
  status: { phase, conditions: [{ type: "Ready", status: "True" }], containerStatuses: [{ name: "app", ready: phase === "Running", restartCount: 0, state: { running: {} } }] },
});
const syntheticDeployment = {
  kind: "Deployment", apiVersion: "apps/v1",
  metadata: { name: "h7-deploy", namespace: NAMESPACE, uid: "uid-h7-deploy", resourceVersion: "1", creationTimestamp: "2026-11-02T00:00:00Z", labels: { app: "h7" } },
  spec: { replicas: 1, selector: { matchLabels: { app: "h7" } }, template: { metadata: { labels: { app: "h7" } }, spec: { containers: [{ name: "app", image: "registry.invalid/h7:1" }] } } },
  status: { replicas: 1, readyReplicas: 1, availableReplicas: 1, updatedReplicas: 1, conditions: [{ type: "Available", status: "True" }] },
};
// H7.6.1: one valid object per hosted workload kind so each docked list renders a row.
const meta = (name) => ({ name, namespace: NAMESPACE, uid: `uid-${name}`, resourceVersion: "1", creationTimestamp: "2026-11-02T00:00:00Z", labels: { app: "h7" } });
const podTemplate = { metadata: { labels: { app: "h7" } }, spec: { containers: [{ name: "app", image: "registry.invalid/h7:1" }] } };
const selector = { matchLabels: { app: "h7" } };
const syntheticWorkloads = {
  statefulsets: [{ kind: "StatefulSet", apiVersion: "apps/v1", metadata: meta("h7-sts"), spec: { replicas: 1, serviceName: "h7", selector, template: podTemplate }, status: { replicas: 1, readyReplicas: 1, currentReplicas: 1 } }],
  daemonsets: [{ kind: "DaemonSet", apiVersion: "apps/v1", metadata: meta("h7-ds"), spec: { selector, template: podTemplate }, status: { currentNumberScheduled: 1, desiredNumberScheduled: 1, numberReady: 1, numberMisscheduled: 0, updatedNumberScheduled: 1, numberAvailable: 1 } }],
  replicasets: [{ kind: "ReplicaSet", apiVersion: "apps/v1", metadata: meta("h7-rs"), spec: { replicas: 1, selector, template: podTemplate }, status: { replicas: 1, readyReplicas: 1, availableReplicas: 1, fullyLabeledReplicas: 1 } }],
  jobs: [{ kind: "Job", apiVersion: "batch/v1", metadata: meta("h7-job"), spec: { completions: 1, parallelism: 1, backoffLimit: 0, selector: { matchLabels: { "job-name": "h7-job" } }, template: { ...podTemplate, spec: { ...podTemplate.spec, restartPolicy: "Never" } } }, status: { succeeded: 1, startTime: "2026-11-02T00:00:00Z", completionTime: "2026-11-02T00:01:00Z", conditions: [{ type: "Complete", status: "True" }] } }],
  cronjobs: [{ kind: "CronJob", apiVersion: "batch/v1", metadata: meta("h7-cron"), spec: { schedule: "*/30 * * * *", suspend: false, jobTemplate: { spec: { template: { ...podTemplate, spec: { ...podTemplate.spec, restartPolicy: "Never" } } } } }, status: { lastScheduleTime: "2026-11-02T00:00:00Z" } }],
};
// H7.6.2: one valid object per hosted resource. Synthetic, harmless values only; Secrets stays empty.
const T = "2026-11-02T00:00:00Z";
const syntheticResources = {
  events: [{ kind: "Event", apiVersion: "v1", metadata: meta("h7-event.1"), type: "Normal", reason: "H7Synthetic", message: "h7 synthetic event", count: 1, firstTimestamp: T, lastTimestamp: T, source: { component: "h7-qa" }, involvedObject: { kind: "Pod", name: "h7-pod-0", namespace: NAMESPACE, uid: "uid-h7-pod-0", apiVersion: "v1" } }],
  configmaps: [{ kind: "ConfigMap", apiVersion: "v1", metadata: meta("h7-config"), data: { mode: "synthetic" } }],
  services: [{ kind: "Service", apiVersion: "v1", metadata: meta("h7-svc"), spec: { type: "ClusterIP", clusterIP: "10.0.0.10", clusterIPs: ["10.0.0.10"], ports: [{ name: "http", port: 80, targetPort: 8080, protocol: "TCP" }], selector: { app: "h7" }, sessionAffinity: "None" }, status: { loadBalancer: {} } }],
  ingresses: [{ kind: "Ingress", apiVersion: "networking.k8s.io/v1", metadata: meta("h7-ingress"), spec: { rules: [{ host: "h7.invalid", http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: "h7-svc", port: { number: 80 } } } }] } }] }, status: { loadBalancer: {} } }],
  persistentvolumeclaims: [{ kind: "PersistentVolumeClaim", apiVersion: "v1", metadata: meta("h7-pvc"), spec: { accessModes: ["ReadWriteOnce"], storageClassName: "h7-standard", resources: { requests: { storage: "1Gi" } }, volumeName: "h7-pv" }, status: { phase: "Bound", capacity: { storage: "1Gi" }, accessModes: ["ReadWriteOnce"] } }],
  nodes: [{ kind: "Node", apiVersion: "v1", metadata: { name: "h7-node", uid: "uid-h7-node", resourceVersion: "1", creationTimestamp: T, labels: { "kubernetes.io/hostname": "h7-node", "node-role.kubernetes.io/control-plane": "" } }, spec: {}, status: { capacity: { cpu: "4", memory: "8Gi", pods: "110" }, allocatable: { cpu: "4", memory: "8Gi", pods: "110" }, conditions: [{ type: "Ready", status: "True", lastTransitionTime: T }], nodeInfo: { kubeletVersion: "v1.30.0-h7", osImage: "synthetic", kernelVersion: "6.0", containerRuntimeVersion: "containerd://1.7", architecture: "arm64", operatingSystem: "linux" }, addresses: [{ type: "InternalIP", address: "10.0.0.1" }] } }],
};
const itemsFor = (resource) => ({ namespaces: [namespace], pods: [syntheticPod()], deployments: [syntheticDeployment], ...syntheticWorkloads, ...syntheticResources })[resource] ?? [];

// Requests that only exist while something polls metrics (Prometheus discovery/queries through the API proxy).
// Each Lens metrics poll first runs Prometheus discovery against the cluster (service lookups by
// name or label selector), so these requests count one metrics poll each round.
const isPollingRequest = (pathAndQuery) => /\/proxy\/|prometheus|metrics/i.test(pathAndQuery);

/**
 * @param {number} port
 * @returns {Promise<{ port: number, stats: () => { open: Record<string, number>, started: Record<string, number>, lists: Record<string, number>, rejected: number }, close: () => Promise<void> }>}
 */
export function startSyntheticKubeApi(port) {
  const open = {};
  const started = {};
  const lists = {};
  const polling = {};
  let cancelled = 0;
  const sockets = new Set();
  const watchers = new Map(); // pathname -> Set<response>, to push watch events on demand
  let rejected = 0;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://synthetic");

    // Read-only: anything that would mutate the cluster is refused. Self-subject reviews are
    // POSTed by Lens but only ask "what am I allowed to do", so they are answered.
    const isPermissionQuery = req.method === "POST" && /selfsubject(access|rules)reviews$/.test(url.pathname);

    if (req.method !== "GET" && !isPermissionQuery) {
      rejected += 1;
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ kind: "Status", apiVersion: "v1", status: "Failure", code: 405, reason: "MethodNotAllowed" }));

      return;
    }

    if (url.searchParams.get("watch")) {
      const key = url.pathname;

      open[key] = (open[key] || 0) + 1;
      started[key] = (started[key] || 0) + 1;
      if (!watchers.has(key)) watchers.set(key, new Set());
      watchers.get(key).add(res);
      res.on("close", () => { open[key] -= 1; cancelled += 1; watchers.get(key)?.delete(res); });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.flushHeaders();

      return; // held open with no events, like an idle watch
    }

    lists[url.pathname] = (lists[url.pathname] || 0) + 1;
    if (isPollingRequest(url.pathname + url.search)) polling[url.pathname] = (polling[url.pathname] || 0) + 1;
    const payload = respond(url.pathname, url.searchParams.get("labelSelector"));

    res.writeHead(payload ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload ?? { kind: "Status", apiVersion: "v1", status: "Failure", code: 404, reason: "NotFound" }));
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({
      port,
      // rejected = refused write attempts; cancelled = watches closed by the client.
      stats: () => ({ open: { ...open }, started: { ...started }, lists: { ...lists }, polling: { ...polling }, cancelled, rejected }),
      /** H7.5: pushes one watch event to every open watch on that path; returns how many received it. */
      emit: (pathname, event) => {
        const targets = [...(watchers.get(pathname) ?? [])];

        for (const res of targets) res.write(`${JSON.stringify(event)}\n`);

        return targets.length;
      },
      close: () => new Promise((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
    }));
  });
}
