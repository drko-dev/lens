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
const NAMESPACE = "h7-synthetic";

const resourceList = (gv, list) => ({
  kind: "APIResourceList", groupVersion: gv,
  resources: list.map(([name, kind, namespaced]) => ({
    name, singularName: "", namespaced, kind,
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"], // advertised only; mutations are refused below
  })),
});

function respond(pathname) {
  if (pathname === "/version") return { major: "1", minor: "30", gitVersion: "v1.30.0-h7-synthetic", platform: "linux/arm64" };
  if (pathname === "/api") return { kind: "APIVersions", versions: ["v1"], serverAddressByClientCIDRs: [] };
  if (pathname === "/apis") return {
    kind: "APIGroupList",
    groups: [
      { name: "apps", versions: [{ groupVersion: "apps/v1", version: "v1" }], preferredVersion: { groupVersion: "apps/v1", version: "v1" } },
      { name: "authorization.k8s.io", versions: [{ groupVersion: "authorization.k8s.io/v1", version: "v1" }], preferredVersion: { groupVersion: "authorization.k8s.io/v1", version: "v1" } },
    ],
  };
  if (pathname === "/api/v1") return resourceList("v1", coreResources);
  if (pathname === "/apis/apps/v1") return resourceList("apps/v1", appsResources);
  if (pathname === "/apis/authorization.k8s.io/v1") return resourceList("authorization.k8s.io/v1", [["selfsubjectaccessreviews", "SelfSubjectAccessReview", false], ["selfsubjectrulesreviews", "SelfSubjectRulesReview", false]]);
  if (pathname.includes("selfsubjectaccessreviews")) return { kind: "SelfSubjectAccessReview", apiVersion: "authorization.k8s.io/v1", status: { allowed: true } };
  if (pathname.includes("selfsubjectrulesreviews")) return {
    kind: "SelfSubjectRulesReview", apiVersion: "authorization.k8s.io/v1",
    status: { resourceRules: [{ verbs: ["*"], apiGroups: ["*"], resources: ["*"] }], nonResourceRules: [], incomplete: false },
  };
  if (pathname === `/api/v1/namespaces/${NAMESPACE}`) return { kind: "Namespace", apiVersion: "v1", ...namespace };

  const last = pathname.split("/").filter(Boolean).pop() || "";
  const kind = [...coreResources, ...appsResources].find(([name]) => name === last)?.[1];

  if (kind) {
    return { kind: `${kind}List`, apiVersion: pathname.startsWith("/apis/apps") ? "apps/v1" : "v1", metadata: { resourceVersion: "1" }, items: last === "namespaces" ? [namespace] : [] };
  }

  return null;
}

const namespace = { metadata: { name: NAMESPACE, uid: "ns-1", resourceVersion: "1", creationTimestamp: "2026-11-02T00:00:00Z" }, status: { phase: "Active" } };

/**
 * @param {number} port
 * @returns {Promise<{ port: number, stats: () => { open: Record<string, number>, started: Record<string, number>, lists: Record<string, number>, rejected: number }, close: () => Promise<void> }>}
 */
export function startSyntheticKubeApi(port) {
  const open = {};
  const started = {};
  const lists = {};
  const sockets = new Set();
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
      res.on("close", () => { open[key] -= 1; });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.flushHeaders();

      return; // held open with no events, like an idle watch
    }

    lists[url.pathname] = (lists[url.pathname] || 0) + 1;
    const payload = respond(url.pathname);

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
      stats: () => ({ open: { ...open }, started: { ...started }, lists: { ...lists }, rejected }),
      close: () => new Promise((done) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => done());
      }),
    }));
  });
}
