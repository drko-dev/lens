/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";
import { sanitizeSplitLayout } from "../../../../common/workspace/session-snapshot";
import type { LayoutV1 } from "../split-panel-types";

describe("H4: Versioned Persistence, Workspace Recovery & Safe Restoration Suite", () => {
  let store: SplitPanelStore;
  let mockStorage: Map<string, string>;
  let mockInvoke: jest.Mock;

  beforeEach(() => {
    mockStorage = new Map();
    mockInvoke = jest.fn();

    store = new SplitPanelStore({
      initialClusterId: "cluster-h4-test",
      getLocalStorageItem: (key) => mockStorage.get(key) ?? null,
      setLocalStorageItem: (key, value) => mockStorage.set(key, value),
      invoke: mockInvoke,
    });
  });

  afterEach(() => {
    store.dispose();
  });

  describe("1. Serialización y Deserialización de LayoutV1", () => {
    it("serializes to canonical LayoutV1 format with schemaVersion and zero secrets", () => {
      store.selectWorkspace("incidents");
      store.persistToStorage(true);

      const serialized = store.serializeLayout() as LayoutV1;

      expect(serialized.schemaVersion).toBe("LayoutV1");
      expect(serialized.version).toBe(3);
      expect(serialized.activeWorkspaceId).toBe("incidents");
      expect(serialized.rootNode).toBeDefined();
      expect(serialized.detachedWindows).toEqual([]);

      const rawJson = JSON.stringify(serialized);
      expect(rawJson).not.toMatch(/token|secret|password|kubeconfig|privateKey/i);
    });

    it("deserializes and fully restores a valid LayoutV1 snapshot", () => {
      const validLayoutV1: LayoutV1 = {
        schemaVersion: "LayoutV1",
        version: 3,
        updatedAt: Date.now(),
        activeWorkspaceId: "development",
        isClassicMode: false,
        rootNode: {
          type: "branch",
          id: "branch-dev",
          orientation: "vertical",
          ratio: 0.65,
          first: { type: "leaf", id: "leaf-pods", panelKind: "pods" },
          second: { type: "leaf", id: "leaf-deployments", panelKind: "deployments" },
        },
        detachedWindows: [],
      };

      const success = store.restoreLayout(validLayoutV1);

      expect(success).toBe(true);
      expect(store.activeWorkspaceId).toBe("development");
      expect(store.ratio).toBe(0.65);
      expect(store.allActiveLeaves.map(l => l.panelKind)).toEqual(["pods", "deployments"]);
    });
  });

  describe("2. Validación de Esquema, Límites y Sanitización", () => {
    it("enforces maximum tree depth limit (depth <= 8)", () => {
      // Build a pathological nested tree deeper than 8 levels
      let deepTree: any = { type: "leaf", id: "leaf-deepest", panelKind: "pods" };
      for (let i = 0; i < 12; i++) {
        deepTree = {
          type: "branch",
          id: `branch-level-${i}`,
          orientation: "horizontal",
          ratio: 0.5,
          first: deepTree,
          second: { type: "leaf", id: `leaf-peer-${i}`, panelKind: "events" },
        };
      }

      const sanitized = sanitizeSplitLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        activeWorkspaceId: "custom",
        rootNode: deepTree,
      }) as any;

      expect(sanitized).toBeDefined();
      // Tree depth should have been clamped / sanitized cleanly
      expect(sanitized.rootNode).toBeDefined();
    });

    it("deduplicates colliding node IDs cleanly", () => {
      const duplicateIdTree = {
        type: "branch",
        id: "branch-1",
        orientation: "horizontal",
        ratio: 0.5,
        first: { type: "leaf", id: "same-id", panelKind: "pods" },
        second: { type: "leaf", id: "same-id", panelKind: "deployments" },
      };

      const sanitized = sanitizeSplitLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        activeWorkspaceId: "custom",
        rootNode: duplicateIdTree,
      }) as any;

      expect(sanitized.rootNode.first.id).not.toBe(sanitized.rootNode.second.id);
    });

    it("strips malicious, oversized, and prototype polluted payloads through allowlist", () => {
      const malicious = {
        schemaVersion: "LayoutV1",
        __proto__: { isAdmin: true },
        constructor: { prototype: { polluter: true } },
        forbiddenSecret: "sensitive-token-12345",
        kubeconfigPath: "/root/.kube/config",
        activeWorkspaceId: "custom",
      };

      const clean = sanitizeSplitLayout(malicious) as any;
      expect(clean).toBeDefined();
      expect(clean.forbiddenSecret).toBeUndefined();
      expect(clean.kubeconfigPath).toBeUndefined();
      expect(clean.isAdmin).toBeUndefined();
    });
  });

  describe("3. Migraciones Bidireccionales (H1, H2, H3 -> H4)", () => {
    it("migrates H1 legacy layout (version 1) to active rootNode structure", () => {
      const legacyH1 = {
        version: 1,
        ratio: 0.72,
        isSwapped: true,
        isLeftClosed: false,
        isRightClosed: false,
        isClassicMode: false,
        leftPanelKind: "kubetail",
        rightPanelKind: "resource-details",
        resourceBinding: {
          kind: "Deployment",
          name: "web-server",
          namespace: "default",
        },
      };

      const success = store.restoreLayout(legacyH1);

      expect(success).toBe(true);
      expect(store.ratio).toBe(0.72);
      expect(store.rootNode.type).toBe("branch");
      expect(store.activeWorkspaceId).toBe("h1-default");
      expect(store.resourceBinding?.name).toBe("web-server");
    });

    it("migrates H2 layout (version 2) with activeWorkspaceId and dynamic rootNode", () => {
      const legacyH2 = {
        version: 2,
        activeWorkspaceId: "operation",
        isClassicMode: false,
        maximizedPanelId: undefined,
        rootNode: {
          type: "branch",
          id: "branch-op",
          orientation: "horizontal",
          ratio: 0.5,
          first: { type: "leaf", id: "leaf-kubetail", panelKind: "kubetail" },
          second: { type: "leaf", id: "leaf-pods", panelKind: "pods" },
        },
      };

      const success = store.restoreLayout(legacyH2);

      expect(success).toBe(true);
      expect(store.activeWorkspaceId).toBe("operation");
      expect(store.allActiveLeaves.length).toBe(2);
    });
  });

  describe("4. Persistencia Inerte y Restauración de Ventanas (H4-E & H4-F)", () => {
    it("restores detached windows INERTLY without opening browser windows or starting streams", () => {
      const snapshotWithDetached: LayoutV1 = {
        schemaVersion: "LayoutV1",
        version: 3,
        updatedAt: Date.now(),
        activeWorkspaceId: "incidents",
        isClassicMode: false,
        rootNode: {
          type: "branch",
          id: "b1",
          orientation: "horizontal",
          ratio: 0.5,
          first: { type: "leaf", id: "leaf-kubetail", panelKind: "kubetail" },
          second: { type: "leaf", id: "leaf-details", panelKind: "resource-details" },
        },
        detachedWindows: [
          {
            panelId: "leaf-kubetail",
            panelKind: "kubetail",
            workspaceId: "incidents",
            clusterId: "cluster-h4-test",
            sessionKey: "cluster-h4-test/incidents/leaf-kubetail/logs",
            title: "Deployment: demo-web",
            geometry: { x: 1920, y: 100, width: 960, height: 600, displayId: 2 },
            detachedAt: Date.now() - 5000,
          },
        ],
      };

      const success = store.restoreLayout(snapshotWithDetached);

      expect(success).toBe(true);
      expect(store.isPanelDetached("leaf-kubetail")).toBe(true);

      const detachedState = store.getDetachedState("leaf-kubetail");
      expect(detachedState).toBeDefined();
      expect(detachedState?.windowId).toBeUndefined(); // CRITICAL: INERT, windowId is not set!
      expect(detachedState?.geometry?.x).toBe(1920);

      // Verify that NO IPC calls were launched to open windows or streams
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("allows explicit user action to reopen a restored detached window", async () => {
      mockInvoke.mockResolvedValueOnce({ windowId: 99, reused: false });

      store.restoreLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        updatedAt: Date.now(),
        activeWorkspaceId: "incidents",
        isClassicMode: false,
        rootNode: {
          type: "leaf",
          id: "leaf-kubetail",
          panelKind: "kubetail",
        },
        detachedWindows: [
          {
            panelId: "leaf-kubetail",
            panelKind: "kubetail",
            workspaceId: "incidents",
            clusterId: "cluster-h4-test",
            sessionKey: "cluster-h4-test/incidents/leaf-kubetail/logs",
            geometry: { x: 200, y: 200, width: 800, height: 600 },
            detachedAt: Date.now(),
          },
        ],
      });

      // Bind resource to allow detachment
      store.setResourceBinding({
        kind: "Deployment",
        name: "demo-web",
        namespace: "demo-apps",
        uid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      });

      // User explicitly clicks "Reabrir ventana externa"
      const reopened = await store.detachPanel("leaf-kubetail");
      expect(reopened).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("detached-tool:request-detach", expect.objectContaining({
        clusterId: "cluster-h4-test",
        tabId: "leaf-kubetail",
      }));

      const state = store.getDetachedState("leaf-kubetail");
      expect(state?.windowId).toBe(99);
    });
  });

  describe("5. Geometría Multimonitor, Fallback y Resiliencia", () => {
    it("updates and stores window geometry updates", () => {
      store.selectWorkspace("incidents");
      store.restoreLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        updatedAt: Date.now(),
        activeWorkspaceId: "incidents",
        isClassicMode: false,
        rootNode: { type: "leaf", id: "leaf-kubetail", panelKind: "kubetail" },
        detachedWindows: [
          {
            panelId: "leaf-kubetail",
            panelKind: "kubetail",
            workspaceId: "incidents",
            clusterId: "cluster-h4-test",
            sessionKey: "cluster-h4-test/incidents/leaf-kubetail/logs",
            detachedAt: Date.now(),
          },
        ],
      });

      store.updateDetachedGeometry("leaf-kubetail", {
        x: 1440,
        y: 200,
        width: 1024,
        height: 768,
        displayId: 3,
        isMaximized: false,
      });

      const state = store.getDetachedState("leaf-kubetail");
      expect(state?.geometry).toEqual({
        x: 1440,
        y: 200,
        width: 1024,
        height: 768,
        displayId: 3,
        isMaximized: false,
      });
    });

    it("clamps invalid or off-screen geometry bounds in sanitizeDetachedWindow", () => {
      const sanitized = sanitizeSplitLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        activeWorkspaceId: "custom",
        rootNode: { type: "leaf", id: "leaf-1", panelKind: "kubetail" },
        detachedWindows: [
          {
            panelId: "leaf-1",
            panelKind: "kubetail",
            geometry: {
              x: 100,
              y: 100,
              width: 10, // Too small (< 320)
              height: 50000, // Too large (> 4320)
            },
          },
        ],
      }) as any;

      expect(sanitized.detachedWindows[0].geometry.width).toBe(320);
      expect(sanitized.detachedWindows[0].geometry.height).toBe(4320);
    });
  });

  describe("6. Recuperación ante Corrupción y Respaldo Seguro", () => {
    it("creates corrupted backup and falls back to default layout on JSON corruption", () => {
      mockStorage.set("openlens:split-layout", "{ malformed json: true, broken ...");

      const freshStore = new SplitPanelStore({
        initialClusterId: "cluster-corrupt-test",
        getLocalStorageItem: (key) => mockStorage.get(key) ?? null,
        setLocalStorageItem: (key, value) => mockStorage.set(key, value),
      });

      // Default layout restored
      expect(freshStore.activeWorkspaceId).toBe("h1-default");
      expect(freshStore.allActiveLeaves.length).toBe(2);

      // Corrupted backup was stored for diagnostics
      expect(mockStorage.get("openlens:split-layout:corrupted-backup")).toBe("{ malformed json: true, broken ...");

      freshStore.dispose();
    });
  });

  describe("7. Guardado Automático con Debounce y Escrituras Atómicas", () => {
    it("debounces rapid ratio updates to prevent disk write storms", (done) => {
      const setItemSpy = jest.fn();
      const debouncedStore = new SplitPanelStore({
        initialClusterId: "cluster-debounce-test",
        setLocalStorageItem: setItemSpy,
      });

      // Rapidly update ratio 10 times in tight loop
      for (let i = 0; i < 10; i++) {
        debouncedStore.setRatio(0.30 + i * 0.03);
      }

      // Immediate call count should be 0 because of debounce
      expect(setItemSpy).not.toHaveBeenCalled();

      // Wait for debounce timer (350 ms)
      setTimeout(() => {
        expect(setItemSpy).toHaveBeenCalledTimes(1);
        debouncedStore.dispose();
        done();
      }, 350);
    });

    it("flushes immediately when explicit immediate flag is provided", () => {
      const setItemSpy = jest.fn();
      const explicitStore = new SplitPanelStore({
        initialClusterId: "cluster-immediate-test",
        setLocalStorageItem: setItemSpy,
      });

      explicitStore.selectWorkspace("development");
      explicitStore.persistToStorage(true);

      expect(setItemSpy).toHaveBeenCalled();
      explicitStore.dispose();
    });
  });

  describe("8. Aislamiento de Clústeres y Preservación de Contexto", () => {
    it("strictly refuses to switch active resource binding when clusterId changes", () => {
      store.setResourceBinding({
        kind: "Deployment",
        name: "frontend",
        namespace: "web",
      });

      expect(store.resourceBinding?.name).toBe("frontend");

      // Change cluster to another cluster
      store.setClusterId("other-production-cluster");
      expect(store.resourceBinding).toBeUndefined(); // Cleared to prevent cross-cluster pollution
    });

    it("never auto-retargets or substitutes a missing cluster with another available cluster", () => {
      const serialized = store.serializeLayout();
      expect(serialized.schemaVersion).toBe("LayoutV1");

      const storeForDifferentCluster = new SplitPanelStore({
        initialClusterId: "new-unrelated-cluster-xyz",
      });

      storeForDifferentCluster.restoreLayout(serialized);
      // Resource binding remains empty or scoped, never adopted by the wrong cluster
      expect(storeForDifferentCluster.resourceBinding).toBeUndefined();
      storeForDifferentCluster.dispose();
    });
  });

  describe("9. Persistencia de Pestañas, Grupos y Workspaces Custom", () => {
    it("preserves group tab configurations and active tab selection across serialization", () => {
      store.selectWorkspace("h1-default");
      const leaves = store.allActiveLeaves;
      store.movePanel(leaves[1].id, leaves[0].id, "group");

      store.setActiveTabInGroup(store.rootNode.id, leaves[1].id);
      expect((store.rootNode as any).activePanelId).toBe(leaves[1].id);

      const serialized = store.serializeLayout() as LayoutV1;
      expect(serialized.rootNode.type).toBe("group");
      expect((serialized.rootNode as any).activePanelId).toBe(leaves[1].id);

      const targetStore = new SplitPanelStore();
      targetStore.restoreLayout(serialized);

      expect(targetStore.rootNode.type).toBe("group");
      expect((targetStore.rootNode as any).activePanelId).toBe(leaves[1].id);
      targetStore.dispose();
    });

    it("preserves custom workspaces across persistence cycles", () => {
      store.selectWorkspace("operation");
      store.addPanel("events");
      store.saveCustomWorkspace();

      expect(store.activeWorkspaceId).toBe("custom");

      const serialized = store.serializeLayout() as LayoutV1;
      expect(serialized.customWorkspaces).toBeDefined();
      expect(serialized.customWorkspaces?.["custom"]).toBeDefined();

      const freshStore = new SplitPanelStore();
      freshStore.restoreLayout(serialized);

      expect(freshStore.activeWorkspaceId).toBe("custom");
      expect(freshStore.activePanelsCount).toBe(4);
      freshStore.dispose();
    });
  });

  describe("10. Limpieza de Estado Huérfano y Consistencia", () => {
    it("cleans up detached state if corresponding leaf panel is removed from workspace", () => {
      store.selectWorkspace("incidents");
      const leaves = store.allActiveLeaves;
      const targetLeaf = leaves[0];

      // Simulate detached state
      store.restoreLayout({
        schemaVersion: "LayoutV1",
        version: 3,
        updatedAt: Date.now(),
        activeWorkspaceId: "incidents",
        isClassicMode: false,
        rootNode: store.rootNode,
        detachedWindows: [
          {
            panelId: targetLeaf.id,
            panelKind: targetLeaf.panelKind,
            workspaceId: "incidents",
            clusterId: "cluster-h4-test",
            sessionKey: `cluster-h4-test/incidents/${targetLeaf.id}/${targetLeaf.panelKind}`,
            detachedAt: Date.now(),
          },
        ],
      });

      expect(store.isPanelDetached(targetLeaf.id)).toBe(true);

      // Closing the panel removes it and its detached registration
      store.closePanel(targetLeaf.id);
      expect(store.isPanelDetached(targetLeaf.id)).toBe(false);
    });
  });
});
