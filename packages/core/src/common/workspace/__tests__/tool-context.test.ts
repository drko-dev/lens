/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  assertToolActionClusterContext,
  ClusterContextMismatchError,
  createToolContextFromCluster,
} from "../tool-context";
import { Cluster } from "../../cluster/cluster";

describe("ToolContext Contracts & Safety Guarantees", () => {
  describe("assertToolActionClusterContext", () => {
    it("passes when expected and actual clusterId match exactly", () => {
      expect(() => {
        assertToolActionClusterContext("cluster-dev", "cluster-dev", "save-configmap");
      }).not.toThrow();
    });

    it("throws ClusterContextMismatchError when actual clusterId differs from expected", () => {
      expect(() => {
        assertToolActionClusterContext("cluster-dev", "cluster-prod", "save-secret");
      }).toThrow(ClusterContextMismatchError);
    });

    it("throws ClusterContextMismatchError when either clusterId is undefined or empty", () => {
      expect(() => {
        assertToolActionClusterContext(undefined, "cluster-prod", "execute-command");
      }).toThrow(ClusterContextMismatchError);

      expect(() => {
        assertToolActionClusterContext("cluster-dev", "", "fetch-logs");
      }).toThrow(ClusterContextMismatchError);
    });

    it("includes informative action and cluster details in the error message", () => {
      try {
        assertToolActionClusterContext("dev-123", "prod-999", "delete-pod");
        fail("Should have thrown error");
      } catch (err: any) {
        expect(err.message).toContain('Action "delete-pod"');
        expect(err.message).toContain('"dev-123"');
        expect(err.message).toContain('"prod-999"');
      }
    });
  });

  describe("createToolContextFromCluster", () => {
    it("extracts authoritative metadata for development cluster", () => {
      const cluster = new Cluster({
        id: "c-dev-1",
        contextName: "minikube",
        kubeConfigPath: "/tmp/kubeconfig",
        preferences: {
          clusterAlias: "Minikube Local",
          clusterEnvironment: "development",
          clusterColor: "#00ff00",
        },
      });

      const context = createToolContextFromCluster(cluster, "tab-editor-1", "default", {
        kind: "ConfigMap",
        name: "app-config",
        namespace: "default",
      });

      expect(context.clusterId).toBe("c-dev-1");
      expect(context.clusterName).toBe("Minikube Local");
      expect(context.environment).toBe("development");
      expect(context.isProduction).toBe(false);
      expect(context.resource?.name).toBe("app-config");
    });

    it("correctly identifies production environment with hazard flag", () => {
      const cluster = new Cluster({
        id: "c-prod-1",
        contextName: "prod-eks",
        kubeConfigPath: "/tmp/kubeconfig",
        preferences: {
          clusterAlias: "Production EKS",
          clusterEnvironment: "production",
          clusterColor: "#ff0000",
        },
      });

      const context = createToolContextFromCluster(cluster, "tab-term-1", "default", undefined, {
        podUid: "pod-uid-xyz",
        containerName: "api-gateway",
      });

      expect(context.clusterId).toBe("c-prod-1");
      expect(context.clusterName).toBe("Production EKS");
      expect(context.environment).toBe("production");
      expect(context.isProduction).toBe(true);
      expect(context.podUid).toBe("pod-uid-xyz");
      expect(context.containerName).toBe("api-gateway");
    });

    it("provides safe fallback when cluster is undefined", () => {
      const context = createToolContextFromCluster(undefined, "tab-unknown", "default");

      expect(context.clusterId).toBe("unknown");
      expect(context.clusterName).toBe("Unknown Cluster");
      expect(context.environment).toBe("none");
      expect(context.isProduction).toBe(false);
    });
  });
});
