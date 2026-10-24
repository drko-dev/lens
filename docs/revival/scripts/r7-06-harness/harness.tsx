/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { useState } from "react";
import ReactDOM from "react-dom";
import { computed, observable } from "mobx";
import { DiContextProvider, registerInjectableReact } from "@ogre-tools/injectable-react";
import { createContainer, getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { Role, ClusterRole, RoleBinding, ClusterRoleBinding } from "@openlens/kube-object";
import siblingTabsInjectable from "../../../../packages/core/src/renderer/routes/sibling-tabs.injectable";
import { NonInjectedRbacInspector } from "../../../../packages/core/src/renderer/components/user-management/rbac-inspector/rbac-inspector";
import { AccessReviewClient } from "../../../../packages/core/src/common/k8s-api/endpoints/rbac-evaluator/access-review-client";

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

di.register(siblingTabsInjectable);
di.override(siblingTabsInjectable, () => computed(() => []));

// Mock sample RBAC objects
const sampleRole = new Role({
  apiVersion: "rbac.authorization.k8s.io/v1",
  kind: "Role",
  metadata: {
    name: "pod-reader",
    namespace: "backend",
    uid: "role-1",
    resourceVersion: "1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    selfLink: "/apis/rbac.authorization.k8s.io/v1/namespaces/backend/roles/pod-reader",
  },
  rules: [
    { verbs: ["get", "list", "watch"], apiGroups: [""], resources: ["pods"] },
    { verbs: ["create"], apiGroups: [""], resources: ["pods/exec"] },
  ],
});

const sampleClusterRole = new ClusterRole({
  apiVersion: "rbac.authorization.k8s.io/v1",
  kind: "ClusterRole",
  metadata: {
    name: "cluster-admin",
    uid: "cr-1",
    resourceVersion: "1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    selfLink: "/apis/rbac.authorization.k8s.io/v1/clusterroles/cluster-admin",
  },
  rules: [
    { verbs: ["*"], apiGroups: ["*"], resources: ["*"] },
    { verbs: ["*"], nonResourceURLs: ["*"] },
  ],
});

const sampleRoleBinding = new RoleBinding({
  apiVersion: "rbac.authorization.k8s.io/v1",
  kind: "RoleBinding",
  metadata: {
    name: "backend-pod-reader-rb",
    namespace: "backend",
    uid: "rb-1",
    resourceVersion: "1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    selfLink: "/apis/rbac.authorization.k8s.io/v1/namespaces/backend/rolebindings/backend-pod-reader-rb",
  },
  roleRef: {
    apiGroup: "rbac.authorization.k8s.io",
    kind: "Role",
    name: "pod-reader",
  },
  subjects: [
    {
      kind: "ServiceAccount",
      name: "deployer",
      namespace: "default",
    },
    {
      kind: "ServiceAccount",
      name: "restricted-sa",
      namespace: "default",
    },
  ],
});

const sampleClusterRoleBinding = new ClusterRoleBinding({
  apiVersion: "rbac.authorization.k8s.io/v1",
  kind: "ClusterRoleBinding",
  metadata: {
    name: "cluster-admin-crb",
    uid: "crb-1",
    resourceVersion: "1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    selfLink: "/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/cluster-admin-crb",
  },
  roleRef: {
    apiGroup: "rbac.authorization.k8s.io",
    kind: "ClusterRole",
    name: "cluster-admin",
  },
  subjects: [
    {
      kind: "User",
      name: "admin-user",
    },
  ],
});

// App wrapper that coordinates state and real component
export const HarnessApp: React.FC = () => {
  const [activeClusterId, setActiveClusterId] = useState("production-k8s-us-east-1");
  const [isProd, setIsProd] = useState(true);
  const [simulateStoreError, setSimulateStoreError] = useState(false);

  // KubeJsonApi connecting to synthetic HTTP server
  const mockJsonApi: any = {
    post: async (endpoint: string, { data }: any) => {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!resp.ok) {
        const errorBody = await resp.text();
        let parsed: any;
        try {
          parsed = JSON.parse(errorBody);
        } catch {
          parsed = { message: errorBody };
        }
        const err: any = new Error(parsed?.message || `HTTP ${resp.status}`);
        err.status = resp.status;
        err.statusCode = resp.status;
        err.error = parsed?.error || { code: resp.status, message: parsed?.message };
        throw err;
      }

      return resp.json();
    },
  };

  const accessReviewClient = new AccessReviewClient({
    getJsonApi: () => mockJsonApi,
    getActiveClusterId: () => activeClusterId,
  });

  const roleStore: any = {
    items: [sampleRole],
    isLoaded: !simulateStoreError,
    failedLoading: simulateStoreError,
    error: simulateStoreError ? "403 Forbidden" : null,
  };

  const clusterRoleStore: any = {
    items: [sampleClusterRole],
    isLoaded: true,
    failedLoading: false,
  };

  const roleBindingStore: any = {
    items: [sampleRoleBinding],
    isLoaded: true,
    failedLoading: false,
  };

  const clusterRoleBindingStore: any = {
    items: [sampleClusterRoleBinding],
    isLoaded: true,
    failedLoading: false,
  };

  const serviceAccountStore: any = {
    items: [
      { getId: () => "sa-1", getName: () => "deployer", getNs: () => "default" },
      { getId: () => "sa-2", getName: () => "coredns", getNs: () => "kube-system" },
    ],
  };

  const namespaceStore: any = {
    items: [
      { getName: () => "default" },
      { getName: () => "backend" },
      { getName: () => "kube-system" },
    ],
  };

  const observableHistory: any = {
    searchParams: window.location.search,
  };

  const hostedCluster: any = {
    id: activeClusterId,
    name: activeClusterId === "production-k8s-us-east-1" ? "production-k8s-us-east" : "staging-cluster",
  };

  const isProductionCluster = computed(() => isProd);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Harness Control Bar */}
      <div
        id="harness-controls"
        style={{
          display: "flex",
          gap: 12,
          padding: "10px 16px",
          background: "#181b20",
          border: "1px solid #334155",
          borderRadius: 6,
          marginBottom: 20,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>HARNESS CONTROLS:</span>
        <button
          id="btn-switch-cluster"
          onClick={() => setActiveClusterId(prev => prev === "production-k8s-us-east-1" ? "staging-cluster-2" : "production-k8s-us-east-1")}
          style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
        >
          Toggle Cluster Context
        </button>
        <button
          id="btn-toggle-prod"
          onClick={() => setIsProd(p => !p)}
          style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
        >
          Toggle PROD Badge
        </button>
        <button
          id="btn-toggle-store-error"
          onClick={() => setSimulateStoreError(e => !e)}
          style={{ padding: "4px 10px", fontSize: 12, cursor: "pointer" }}
        >
          Toggle Store 403 Error
        </button>
        <span style={{ fontSize: 12, color: "#38bdf8", marginLeft: "auto" }}>
          Active: <strong>{activeClusterId}</strong>
        </span>
      </div>

      {/* Real React Component under test */}
      <DiContextProvider value={{ di }}>
        <NonInjectedRbacInspector
          roleStore={roleStore}
          clusterRoleStore={clusterRoleStore}
          roleBindingStore={roleBindingStore}
          clusterRoleBindingStore={clusterRoleBindingStore}
          serviceAccountStore={serviceAccountStore}
          namespaceStore={namespaceStore}
          isProductionCluster={isProductionCluster}
          hostedCluster={hostedCluster}
          accessReviewClient={accessReviewClient}
          observableHistory={observableHistory}
        />
      </DiContextProvider>
    </div>
  );
};

ReactDOM.render(<HarnessApp />, document.getElementById("root"));
