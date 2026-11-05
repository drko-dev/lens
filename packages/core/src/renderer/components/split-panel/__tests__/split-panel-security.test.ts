/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";

describe("SplitPanel Security & Context Isolation Suite", () => {
  let store: SplitPanelStore;

  beforeEach(() => {
    store = new SplitPanelStore({
      initialClusterId: "cluster-primary-dev",
    });
  });

  describe("Cluster Context Scoping", () => {
    it("strictly isolates resource bindings to the active clusterId", () => {
      store.setResourceBinding({
        kind: "Deployment",
        name: "core-api",
        namespace: "staging",
      });

      expect(store.clusterId).toBe("cluster-primary-dev");
      expect(store.resourceBinding?.name).toBe("core-api");

      // User switches cluster context in workspace
      store.setClusterId("cluster-secondary-prod");

      // Verify that previously selected resource is cleared immediately
      expect(store.clusterId).toBe("cluster-secondary-prod");
      expect(store.resourceBinding).toBeUndefined();
    });

    it("does not clear resource binding if setClusterId is called with the current clusterId", () => {
      store.setResourceBinding({
        kind: "StatefulSet",
        name: "database",
        namespace: "db",
      });

      store.setClusterId("cluster-primary-dev");
      expect(store.resourceBinding?.name).toBe("database");
    });
  });

  describe("Credential & Secret Prohibitions", () => {
    it("never stores token, kubeconfig, secret, or certificates in serialized layout", () => {
      store.setResourceBinding({
        kind: "Secret",
        name: "app-tls-secret",
        namespace: "production",
      });

      const serialized = store.serializeLayout();

      const json = JSON.stringify(serialized);

      expect(json).not.toMatch(/token/i);
      expect(json).not.toMatch(/password/i);
      expect(json).not.toMatch(/certificate/i);
      expect(json).not.toMatch(/kubeconfig/i);
      expect(json).not.toMatch(/data/i);
    });

    it("sanitizes bound resource identifiers to bounded lengths preventing memory denial-of-service", () => {
      const hugeName = "a".repeat(1000);
      const hugeNamespace = "b".repeat(1000);

      store.restoreLayout({
        version: 1,
        ratio: 0.5,
        isSwapped: false,
        isLeftClosed: false,
        isRightClosed: false,
        isClassicMode: false,
        resourceBinding: {
          kind: "Deployment",
          name: hugeName,
          namespace: hugeNamespace,
        },
      });

      expect(store.resourceBinding?.name.length).toBeLessThanOrEqual(253);
      expect(store.resourceBinding?.namespace?.length).toBeLessThanOrEqual(253);
    });
  });
});
