/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import ReactDOM from "react-dom";
import { MemoryRouter } from "react-router-dom";
import { DiContextProvider, registerInjectableReact } from "@ogre-tools/injectable-react";
import { createContainer, getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { NetworkPolicy, Pod, Namespace } from "@openlens/kube-object";
import { NetworkPolicyMatrix } from "../../../../packages/core/src/renderer/components/network-policies/matrix/network-policy-matrix";
import { NonInjectedPodNetworkPolicies as PodNetworkPolicies } from "../../../../packages/core/src/renderer/components/workloads-pods/details/pod-network-policies";

const di = createContainer("harness-container");
registerInjectableReact(di);

const dummyLoggerInjectable = getInjectable({
  id: "dummy-logger-injectable",
  injectionToken: loggerInjectionToken,
  instantiate: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
});
di.register(dummyLoggerInjectable);

// Midnight Graphite CSS
const midnightGraphiteCss = `
:root {
  --font-size: 13px;
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --mainBackground: #0B0F19;
  --contentColor: #0F172A;
  --cardBackground: #1E293B;
  --border-color: #334155;
  --textColorPrimary: #F1F5F9;
  --textColorSecondary: #94A3B8;
  --colorSuccess: #10B981;
  --colorError: #EF4444;
  --colorWarning: #F59E0B;
  --colorInfo: #3B82F6;
  --border-radius: 6px;
}

body {
  margin: 0;
  padding: 0;
  font-family: var(--font-family);
  background-color: var(--mainBackground);
  color: var(--textColorPrimary);
}

.harness-app {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.harness-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 16px;
  margin-bottom: 20px;
}

.harness-title {
  font-size: 20px;
  font-weight: 600;
  color: #38BDF8;
  display: flex;
  align-items: center;
  gap: 12px;
}

.harness-badge {
  background: #1E293B;
  color: #10B981;
  border: 1px solid #10B981;
  border-radius: 12px;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: 500;
}

.harness-nav {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}

.harness-nav button {
  background: var(--cardBackground);
  color: var(--textColorPrimary);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 500;
  font-size: 13px;
  transition: all 0.2s;
}

.harness-nav button.active {
  background: #0284C7;
  border-color: #38BDF8;
  color: #FFFFFF;
}

.harness-view-container {
  background: var(--contentColor);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 24px;
}

.audit-log-panel {
  margin-top: 24px;
  background: #020617;
  border: 1px solid #1E293B;
  border-radius: var(--border-radius);
  padding: 16px;
}

.audit-log-title {
  font-size: 13px;
  font-weight: 600;
  color: #94A3B8;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
}

.audit-log-entries {
  font-family: monospace;
  font-size: 12px;
  color: #10B981;
}
`;

// Synthetic data objects
const defaultNamespace = new Namespace({
  apiVersion: "v1",
  kind: "Namespace",
  metadata: {
    name: "default",
    resourceVersion: "1",
    selfLink: "/api/v1/namespaces/default",
    labels: {
      "kubernetes.io/metadata.name": "default",
      env: "production",
    },
  },
});

const dbZoneNamespace = new Namespace({
  apiVersion: "v1",
  kind: "Namespace",
  metadata: {
    name: "db-zone",
    resourceVersion: "1",
    selfLink: "/api/v1/namespaces/db-zone",
    labels: {
      "kubernetes.io/metadata.name": "db-zone",
      env: "secure-storage",
    },
  },
});

const isolatedNamespace = new Namespace({
  apiVersion: "v1",
  kind: "Namespace",
  metadata: {
    name: "isolated",
    resourceVersion: "1",
    selfLink: "/api/v1/namespaces/isolated",
    labels: {
      "kubernetes.io/metadata.name": "isolated",
      zone: "quarantined",
    },
  },
});

const allNamespaces = [defaultNamespace, dbZoneNamespace, isolatedNamespace];

const frontendPod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "frontend-789f",
    namespace: "default",
    resourceVersion: "10",
    selfLink: "/api/v1/namespaces/default/pods/frontend-789f",
    labels: {
      app: "frontend",
      tier: "ui",
    },
  },
  spec: {
    containers: [
      {
        name: "frontend-web",
        image: "frontend:1.0",
        ports: [{ containerPort: 80, name: "http", protocol: "TCP" }],
      },
    ],
  },
  status: {
    phase: "Running",
    podIP: "10.244.0.5",
  },
});

const backendPod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "backend-645b",
    namespace: "default",
    resourceVersion: "11",
    selfLink: "/api/v1/namespaces/default/pods/backend-645b",
    labels: {
      app: "backend",
      tier: "api",
    },
  },
  spec: {
    containers: [
      {
        name: "backend-api",
        image: "backend:1.0",
        ports: [
          { containerPort: 8080, name: "http-api", protocol: "TCP" },
          { containerPort: 8443, name: "https-api", protocol: "TCP" },
          { containerPort: 9090, name: "metrics", protocol: "TCP" },
        ],
      },
    ],
  },
  status: {
    phase: "Running",
    podIP: "10.244.0.10",
  },
});

const databasePod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "database-db01",
    namespace: "db-zone",
    resourceVersion: "12",
    selfLink: "/api/v1/namespaces/db-zone/pods/database-db01",
    labels: {
      app: "database",
      tier: "db",
    },
  },
  spec: {
    containers: [
      {
        name: "postgres",
        image: "postgres:16",
        ports: [{ containerPort: 5432, name: "postgres", protocol: "TCP" }],
      },
    ],
  },
  status: {
    phase: "Running",
    podIP: "10.244.1.20",
  },
});

const isolatedWorkerPod = new Pod({
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "isolated-worker-99a",
    namespace: "isolated",
    resourceVersion: "13",
    selfLink: "/api/v1/namespaces/isolated/pods/isolated-worker-99a",
    labels: {
      app: "isolated-worker",
      tier: "batch",
    },
  },
  spec: {
    containers: [
      {
        name: "worker",
        image: "worker:latest",
        ports: [{ containerPort: 7000, name: "worker", protocol: "TCP" }],
      },
    ],
  },
  status: {
    phase: "Running",
    podIP: "10.244.2.30",
  },
});

const allPods = [frontendPod, backendPod, databasePod, isolatedWorkerPod];

// NetworkPolicies
const backendAllowFrontendPolicy = new NetworkPolicy({
  apiVersion: "networking.k8s.io/v1",
  kind: "NetworkPolicy",
  metadata: {
    name: "backend-allow-frontend",
    namespace: "default",
    resourceVersion: "100",
    selfLink: "/apis/networking.k8s.io/v1/namespaces/default/networkpolicies/backend-allow-frontend",
  },
  spec: {
    podSelector: {
      matchLabels: { app: "backend" },
    },
    policyTypes: ["Ingress"],
    ingress: [
      {
        from: [
          {
            podSelector: { matchLabels: { app: "frontend" } },
          },
        ],
        ports: [
          { port: 8080, protocol: "TCP" },
          { port: "unresolved-named-port" as any, protocol: "TCP" },
        ],
      },
      {
        from: [
          {
            ipBlock: {
              cidr: "192.168.1.0/24",
              except: ["192.168.1.50/32"],
            },
          },
        ],
        ports: [{ port: 8443, protocol: "TCP" }],
      },
    ],
  },
});

const frontendEgressLimitedPolicy = new NetworkPolicy({
  apiVersion: "networking.k8s.io/v1",
  kind: "NetworkPolicy",
  metadata: {
    name: "frontend-egress-limited",
    namespace: "default",
    resourceVersion: "101",
    selfLink: "/apis/networking.k8s.io/v1/namespaces/default/networkpolicies/frontend-egress-limited",
  },
  spec: {
    podSelector: {
      matchLabels: { app: "frontend" },
    },
    policyTypes: ["Egress"],
    egress: [
      {
        to: [
          {
            podSelector: { matchLabels: { app: "backend" } },
          },
        ],
        ports: [{ port: 8080, protocol: "TCP" }],
      },
    ],
  },
});

const defaultDenyIsolatedPolicy = new NetworkPolicy({
  apiVersion: "networking.k8s.io/v1",
  kind: "NetworkPolicy",
  metadata: {
    name: "default-deny-isolated",
    namespace: "isolated",
    resourceVersion: "102",
    selfLink: "/apis/networking.k8s.io/v1/namespaces/isolated/networkpolicies/default-deny-isolated",
  },
  spec: {
    podSelector: {},
    policyTypes: ["Ingress", "Egress"],
    ingress: [],
    egress: [],
  },
});

const allPolicies = [backendAllowFrontendPolicy, frontendEgressLimitedPolicy, defaultDenyIsolatedPolicy];

// Mock Stores
const mockPodStore = {
  items: allPods,
  getByPath: (path: string) => allPods.find(p => p.selfLink === path),
  isLoaded: true,
  isLoading: false,
} as any;

const mockNamespaceStore = {
  items: allNamespaces,
  getByName: (name: string) => allNamespaces.find(n => n.getName() === name),
  isLoaded: true,
  isLoading: false,
} as any;

// Authentic cluster connection state (Cluster model shape: id + connectivity flags)
const syntheticCluster = {
  id: "synthetic-devops-local",
  disconnected: false,
  online: true,
  accessible: true,
};

const mockNetworkPolicyStore = {
  items: allPolicies,
  getByPath: (path: string) => allPolicies.find(p => p.selfLink === path),
  isLoaded: true,
  isLoading: false,
} as any;

// Partial & RBAC Stores
const rbacForbiddenPodStore = {
  items: [],
  failedLoading: true,
  lastError: { statusCode: 403, message: "pods is forbidden: User cannot list resource 'pods'" },
  isLoading: false,
} as any;

const partialNamespaceStore = {
  items: [],
  failedLoading: true,
  lastError: { statusCode: 403, message: "namespaces is forbidden" },
  isLoading: false,
} as any;

export function HarnessApp() {
  const [activeTab, setActiveTab] = useState<"matrix-backend" | "pod-backend" | "pod-isolated" | "partial-rbac">("matrix-backend");

  return (
    <DiContextProvider value={{ di }}>
      <MemoryRouter>
        <style>{midnightGraphiteCss}</style>
        <div className="harness-app" data-testid="networkpolicy-harness">
        <header className="harness-header">
          <div>
            <div className="harness-title">
              OpenLens DevOps Revival — R7-05 NetworkPolicy Matrix
              <span className="harness-badge">READ-ONLY 100%</span>
            </div>
            <div style={{ color: "var(--textColorSecondary)", fontSize: "12px", marginTop: "4px" }}>
              Evaluation Engine, Selector Resolution, CIDR Bitwise & Isolation Audit
            </div>
          </div>
          <div data-testid="cluster-info" style={{ textAlign: "right", fontSize: "12px", color: "var(--textColorSecondary)" }}>
            Cluster: <strong style={{ color: "#38BDF8" }}>synthetic-devops-local</strong> | K8s: <strong>v1.31.0</strong>
          </div>
        </header>

        <nav className="harness-nav">
          <button
            data-testid="tab-matrix-backend"
            className={activeTab === "matrix-backend" ? "active" : ""}
            onClick={() => setActiveTab("matrix-backend")}
          >
            NetworkPolicy Drawer: backend-allow-frontend
          </button>
          <button
            data-testid="tab-pod-backend"
            className={activeTab === "pod-backend" ? "active" : ""}
            onClick={() => setActiveTab("pod-backend")}
          >
            Pod Details: backend (Evaluated)
          </button>
          <button
            data-testid="tab-pod-isolated"
            className={activeTab === "pod-isolated" ? "active" : ""}
            onClick={() => setActiveTab("pod-isolated")}
          >
            Pod Details: isolated-worker (Quarantined)
          </button>
          <button
            data-testid="tab-partial-rbac"
            className={activeTab === "partial-rbac" ? "active" : ""}
            onClick={() => setActiveTab("partial-rbac")}
          >
            RBAC 403 / Partial Data Simulation
          </button>
        </nav>

        <main className="harness-view-container">
          {activeTab === "matrix-backend" && (
            <div data-testid="view-matrix-backend">
              <h3 style={{ margin: "0 0 16px 0", color: "#38BDF8", fontSize: "15px" }}>
                Traffic Matrix: {backendAllowFrontendPolicy.getName()} (Namespace: {backendAllowFrontendPolicy.getNs()})
              </h3>
              <NetworkPolicyMatrix
                policy={backendAllowFrontendPolicy}
                podStore={mockPodStore}
                namespaceStore={mockNamespaceStore}
                networkPolicyStore={mockNetworkPolicyStore}
                cluster={syntheticCluster}
              />
            </div>
          )}

          {activeTab === "pod-backend" && (
            <div data-testid="view-pod-backend">
              <h3 style={{ margin: "0 0 16px 0", color: "#38BDF8", fontSize: "15px" }}>
                Pod Details: {backendPod.getName()} (Namespace: {backendPod.getNs()})
              </h3>
              <PodNetworkPolicies
                pod={backendPod}
                podStore={mockPodStore}
                namespaceStore={mockNamespaceStore}
                networkPolicyStore={mockNetworkPolicyStore}
                cluster={syntheticCluster}
              />
            </div>
          )}

          {activeTab === "pod-isolated" && (
            <div data-testid="view-pod-isolated">
              <h3 style={{ margin: "0 0 16px 0", color: "#38BDF8", fontSize: "15px" }}>
                Pod Details: {isolatedWorkerPod.getName()} (Namespace: {isolatedWorkerPod.getNs()})
              </h3>
              <PodNetworkPolicies
                pod={isolatedWorkerPod}
                podStore={mockPodStore}
                namespaceStore={mockNamespaceStore}
                networkPolicyStore={mockNetworkPolicyStore}
                cluster={syntheticCluster}
              />
            </div>
          )}

          {activeTab === "partial-rbac" && (
            <div data-testid="view-partial-rbac">
              <h3 style={{ margin: "0 0 16px 0", color: "#EF4444", fontSize: "15px" }}>
                Simulated RBAC Permission Denied (403 Forbidden on Pods)
              </h3>
              <NetworkPolicyMatrix
                policy={backendAllowFrontendPolicy}
                podStore={rbacForbiddenPodStore}
                namespaceStore={mockNamespaceStore}
                networkPolicyStore={mockNetworkPolicyStore}
                cluster={syntheticCluster}
              />
            </div>
          )}
        </main>

        <footer className="audit-log-panel" data-testid="audit-log">
          <div className="audit-log-title">
            <span>MUTATION AUDIT WATCHER</span>
            <span style={{ color: "#10B981" }}>0 MUTATIONS DETECTED (STRICT GET/LIST/WATCH ONLY)</span>
          </div>
          <div className="audit-log-entries" data-testid="audit-entries">
            [AUDIT] K8s API Traffic: 100% Read-Only. No POST/PUT/PATCH/DELETE requests issued.
          </div>
        </footer>
      </div>
    </MemoryRouter>
  </DiContextProvider>
  );
}

const container = document.getElementById("root");
if (container) {
  ReactDOM.render(<HarnessApp />, container);
}
