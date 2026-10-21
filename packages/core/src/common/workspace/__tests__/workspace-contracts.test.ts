/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { SessionSnapshotV1, WorkspaceTab } from "../workspace-types";
import {
  deserializeSessionSnapshot,
  safeDeserializeSessionSnapshot,
  sanitizeSafePath,
  sanitizeWorkspaceTab,
  serializeSessionSnapshot,
} from "../session-snapshot";
import {
  ClusterIsolationEngine,
  createScopedResourceKey,
  enforceClusterAuthorization,
  validateTabClusterContext,
} from "../cluster-isolation";

describe("OpenLens DevOps R4-01: Workspace Contracts & Cluster Isolation Suite", () => {
  describe("Cluster Isolation & Invariants", () => {
    const devCluster = {
      clusterId: "cluster-dev-01",
      name: "minikube-dev",
      environment: "development" as const,
      isProduction: false,
    };

    const prodCluster = {
      clusterId: "cluster-prod-99",
      name: "aws-k8s-prod",
      environment: "production" as const,
      isProduction: true,
    };

    it("generates distinct scoped resource keys for identical namespace/pod across DEV and PROD", () => {
      const devKey = createScopedResourceKey(devCluster.clusterId, "default", "Pod", "api");
      const prodKey = createScopedResourceKey(prodCluster.clusterId, "default", "Pod", "api");

      expect(devKey).toBe("k8s://cluster-dev-01/default/pod/api");
      expect(prodKey).toBe("k8s://cluster-prod-99/default/pod/api");
      expect(devKey).not.toBe(prodKey);
    });

    it("authorizes actions matching tab clusterId and strictly rejects cross-cluster operations", () => {
      const devTab: WorkspaceTab = {
        id: "tab-logs-dev",
        workspaceId: "ws-primary",
        clusterId: devCluster.clusterId,
        title: "DEV: api logs",
        kind: "logs",
        podName: "api",
        namespace: "default",
        createdAt: 1000,
      };

      expect(validateTabClusterContext(devTab, devCluster.clusterId)).toBe(true);
      expect(validateTabClusterContext(devTab, prodCluster.clusterId)).toBe(false);

      expect(() => {
        enforceClusterAuthorization(devTab, devCluster.clusterId, "fetchLogs");
      }).not.toThrow();

      expect(() => {
        enforceClusterAuthorization(devTab, prodCluster.clusterId, "fetchLogs");
      }).toThrow(/Cross-Cluster Security Violation/);
    });

    it("guarantees independent query responses from isolated cluster dispatch without state pollution", () => {
      const engine = new ClusterIsolationEngine();

      engine.registerCluster(devCluster);
      engine.registerCluster(prodCluster);

      const devRes = engine.executeScopedQuery({
        clusterId: devCluster.clusterId,
        namespace: "default",
        kind: "Pod",
        name: "api",
      });

      const prodRes = engine.executeScopedQuery({
        clusterId: prodCluster.clusterId,
        namespace: "default",
        kind: "Pod",
        name: "api",
      });

      expect(devRes.clusterContext.isProduction).toBe(false);
      expect(prodRes.clusterContext.isProduction).toBe(true);
      expect(devRes.resourceKey).toContain("cluster-dev-01");
      expect(prodRes.resourceKey).toContain("cluster-prod-99");
    });

    it("copies and freezes registered cluster context so caller mutation cannot retarget it", () => {
      const engine = new ClusterIsolationEngine();
      const mutableContext = { ...devCluster, accessibleNamespaces: ["default"] };

      engine.registerCluster(mutableContext);
      mutableContext.clusterId = "cluster-prod-99";
      mutableContext.accessibleNamespaces.push("kube-system");

      const registeredContext = engine.getCluster("cluster-dev-01");

      expect(registeredContext.clusterId).toBe("cluster-dev-01");
      expect(registeredContext.accessibleNamespaces).toEqual(["default"]);
      expect(Object.isFrozen(registeredContext)).toBe(true);
      expect(Object.isFrozen(registeredContext.accessibleNamespaces)).toBe(true);
      expect(() => engine.registerCluster(prodCluster)).not.toThrow();
      expect(() => engine.registerCluster(devCluster)).toThrow(/cannot be retargeted/);
    });
  });

  describe("SessionSnapshot Serialization & Deserialization", () => {
    const validSnapshot: SessionSnapshotV1 = {
      version: 1,
      timestamp: 1697800000000,
      activeWorkspaceId: "ws-devops",
      workspaces: [
        {
          id: "ws-devops",
          name: "DevOps Core",
          clusterIds: ["cluster-dev-01", "cluster-prod-99"],
          createdAt: 1697800000000,
          updatedAt: 1697800000000,
        },
      ],
      layouts: {
        "ws-devops": {
          tabs: [
            {
              id: "tab-1",
              workspaceId: "ws-devops",
              clusterId: "cluster-dev-01",
              title: "Deployments",
              kind: "resource",
              resourceKind: "Deployment",
              namespace: "default",
              createdAt: 1697800000000,
            },
            {
              id: "tab-2",
              workspaceId: "ws-devops",
              clusterId: "cluster-prod-99",
              title: "Prod ConfigMap",
              kind: "editor",
              resourceKind: "ConfigMap",
              namespace: "kube-system",
              resourceName: "coredns",
              mode: "view",
              createdAt: 1697800000000,
            },
          ],
          activeTabId: "tab-1",
          dockOpen: true,
          dockHeight: 350,
        },
      },
    };

    it("serializes and deserializes a clean snapshot preserving all allowlisted layout data", () => {
      const serialized = serializeSessionSnapshot(validSnapshot);

      expect(typeof serialized).toBe("string");

      const deserialized = deserializeSessionSnapshot(serialized);

      expect(deserialized.version).toBe(1);
      expect(deserialized.activeWorkspaceId).toBe("ws-devops");
      expect(deserialized.workspaces).toHaveLength(1);
      expect(deserialized.layouts["ws-devops"].tabs).toHaveLength(2);
      expect(deserialized.layouts["ws-devops"].tabs[0].kind).toBe("resource");
      expect(deserialized.layouts["ws-devops"].tabs[1].kind).toBe("editor");
      expect(Object.getOwnPropertyDescriptor(deserialized.layouts["ws-devops"].tabs[0], "clusterId")?.writable).toBe(false);
    });

    it("rejects a tab whose immutable cluster identity is outside its workspace scope", () => {
      const invalidSnapshot: any = JSON.parse(JSON.stringify(validSnapshot));

      invalidSnapshot.layouts["ws-devops"].tabs[0].clusterId = "cluster-unscoped";

      expect(() => serializeSessionSnapshot(invalidSnapshot)).toThrow(/does not match its workspace cluster scope/);
    });

    it("locks tab identity fields on sanitized tabs while leaving display metadata separate", () => {
      const tab = sanitizeWorkspaceTab({
        id: "tab-immutable",
        workspaceId: "ws-devops",
        clusterId: "cluster-dev-01",
        title: "DEV: api",
        kind: "resource",
        resourceKind: "Pod",
        createdAt: 1000,
      });

      expect(Object.getOwnPropertyDescriptor(tab, "clusterId")?.writable).toBe(false);
    });

    it("does not persist terminal commands or live port-forward process identifiers", () => {
      const snapshot: any = JSON.parse(JSON.stringify(validSnapshot));

      snapshot.layouts["ws-devops"].tabs.push({
        id: "tab-terminal",
        workspaceId: "ws-devops",
        clusterId: "cluster-dev-01",
        title: "Terminal",
        kind: "terminal",
        command: "kubectl delete pod api",
        createdAt: 1000,
      }, {
        id: "tab-forward",
        workspaceId: "ws-devops",
        clusterId: "cluster-prod-99",
        title: "Port Forward",
        kind: "port-forward",
        forwardId: "live-process-123",
        resourceKind: "pod",
        resourceName: "api",
        namespace: "default",
        createdAt: 1000,
      });

      const serialized = serializeSessionSnapshot(snapshot);

      expect(serialized).not.toContain("kubectl delete pod api");
      expect(serialized).not.toContain("live-process-123");
    });

    it("persists only allowlisted fields and preserves safe Unicode display text", () => {
      const snapshot: any = JSON.parse(JSON.stringify(validSnapshot));

      snapshot.layouts["ws-devops"].tabs[0].title = "Deployments 🚀";
      snapshot.layouts["ws-devops"].tabs[0].rendererState = {
        command: "kubectl delete pod api",
        opaqueValue: "must-not-persist",
      };

      const serialized = serializeSessionSnapshot(snapshot);
      const restored = deserializeSessionSnapshot(serialized);

      expect(restored.layouts["ws-devops"].tabs[0].title).toBe("Deployments 🚀");
      expect(serialized).not.toContain("rendererState");
      expect(serialized).not.toContain("kubectl delete pod api");
      expect(serialized).not.toContain("must-not-persist");
    });

    it("drops history entries whose tabId and clusterId identify different clusters", () => {
      const snapshot: any = JSON.parse(JSON.stringify(validSnapshot));

      snapshot.history = {
        "ws-devops": {
          workspaceId: "ws-devops",
          entries: [
            { tabId: "tab-1", workspaceId: "ws-devops", clusterId: "cluster-prod-99", path: "/pods" },
            { tabId: "tab-1", workspaceId: "ws-devops", clusterId: "cluster-dev-01", path: "/cluster/cluster-prod-99" },
            { tabId: "tab-2", workspaceId: "ws-devops", clusterId: "cluster-prod-99", path: "/pods" },
          ],
          currentIndex: 1,
        },
      };

      const restored = deserializeSessionSnapshot(JSON.stringify(snapshot));

      expect(restored.history?.["ws-devops"].entries).toEqual([
        expect.objectContaining({ tabId: "tab-2", clusterId: "cluster-prod-99" }),
      ]);
      expect(restored.history?.["ws-devops"].currentIndex).toBe(0);
    });

    it("rejects prototype-polluting workspace identifiers", () => {
      const layouts = Object.create(null);

      layouts["__proto__"] = { tabs: [] };

      const payload = JSON.stringify({
        version: 1,
        activeWorkspaceId: "__proto__",
        workspaces: [{ id: "__proto__", name: "invalid", clusterIds: [] }],
        layouts,
      });

      expect(() => deserializeSessionSnapshot(payload)).toThrow(/requires a valid activeWorkspaceId/);
    });

    it("migrates only allowlisted fields from an unversioned legacy snapshot", () => {
      const legacy = {
        activeClusterId: "cluster-dev-01",
        clusters: ["cluster-dev-01", "cluster-prod-99"],
        kubeconfig: "must-not-be-imported",
        unrecognizedState: { command: "kubectl apply -f secret.yaml" },
      };

      const { snapshot, isCorrupted } = safeDeserializeSessionSnapshot(JSON.stringify(legacy));
      const serialized = serializeSessionSnapshot(snapshot);

      expect(isCorrupted).toBe(false);
      expect(snapshot.layouts.default.tabs.map(tab => tab.clusterId)).toEqual(["cluster-dev-01", "cluster-prod-99"]);
      expect(serialized).not.toContain("kubeconfig");
      expect(serialized).not.toContain("kubectl apply -f secret.yaml");
    });

    it("rejects encoded sensitive query keys and obfuscated path traversal", () => {
      expect(sanitizeSafePath("/pods?%74oken=secret-value")).toBeUndefined();
      expect(sanitizeSafePath("/pods/%252e%252e/secrets")).toBeUndefined();
      expect(sanitizeSafePath("/pods?namespace=default")).toBe("/pods?namespace=default");
    });

    it("rejects serialization when sensitive fields (tokens, secrets, buffers, drafts) are present", () => {
      const contaminatedSnapshot: any = {
        ...validSnapshot,
        layouts: {
          "ws-devops": {
            ...validSnapshot.layouts["ws-devops"],
            tabs: [
              ...validSnapshot.layouts["ws-devops"].tabs,
              {
                id: "tab-bad",
                workspaceId: "ws-devops",
                clusterId: "cluster-dev-01",
                title: "Dirty Tab",
                kind: "editor",
                resourceKind: "Secret",
                draftYamlContent: "apiVersion: v1\nkind: Secret\ndata: { secret_token: 12345 }",
                createdAt: 1000,
              },
            ],
          },
        },
      };

      expect(() => {
        serializeSessionSnapshot(contaminatedSnapshot);
      }).toThrow(/Security Violation: forbidden field "draftYamlContent"/);
    });

    it("rejects deserialization of unsupported snapshot versions", () => {
      const invalidVersionJson = JSON.stringify({
        version: 99,
        workspaces: [],
        layouts: {},
      });

      expect(() => {
        deserializeSessionSnapshot(invalidVersionJson);
      }).toThrow(/Unsupported snapshot version "99"/);
    });

    it("rejects oversized snapshot payloads exceeding the 2MB safety threshold", () => {
      const hugeString = "a".repeat(2.5 * 1024 * 1024);

      expect(() => {
        deserializeSessionSnapshot(hugeString);
      }).toThrow(/exceeds size limit/);
    });
  });
});
