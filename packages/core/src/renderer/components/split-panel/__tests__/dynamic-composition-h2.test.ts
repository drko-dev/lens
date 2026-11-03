/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";
import { PANEL_CATALOG, getCatalogItem } from "../panel-catalog";
import { sanitizeSplitLayout } from "../../../../common/workspace/session-snapshot";
import { isBranchNode } from "../split-panel-types";

describe("H2: Dynamic Composition Engine, Catalog & Workspaces Suite", () => {
  let mockStorage: Record<string, string>;
  let store: SplitPanelStore;

  beforeEach(() => {
    mockStorage = {};
    store = new SplitPanelStore({
      getLocalStorageItem: (key) => mockStorage[key] || null,
      setLocalStorageItem: (key, val) => {
        mockStorage[key] = val;
      },
    });
  });

  describe("Panel Catalog Specification", () => {
    it("contains all registered components with metadata", () => {
      // H7.6.1 added five policy-only workload kinds (StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs). H7.6.2 added five more (ConfigMaps, Services, Ingresses, PVCs, Nodes).
      expect(PANEL_CATALOG.length).toBe(17);

      const kubetail = getCatalogItem("kubetail");
      expect(kubetail?.name).toContain("Kubetail");
      expect(kubetail?.available).toBe(true);
      expect(kubetail?.icon).toBe("subject");

      const pods = getCatalogItem("pods");
      expect(pods?.available).toBe(true);
      expect(pods?.category).toBe("workloads");

      const deployments = getCatalogItem("deployments");
      expect(deployments?.available).toBe(true);

      const events = getCatalogItem("events");
      expect(events?.available).toBe(true);

      const terminal = getCatalogItem("terminal");
      expect(terminal?.available).toBe(false);
      expect(terminal?.unavailableReason).toContain("H3");

      const editor = getCatalogItem("resource-editor");
      expect(editor?.available).toBe(false);
      expect(editor?.unavailableReason).toContain("Diferido para H3");
    });
  });

  describe("Dynamic Tree Composition (3+ Panels, Splits & Pruning)", () => {
    it("starts with default 2 panels and expands dynamically to 3 and 4 panels", () => {
      expect(store.activePanelsCount).toBe(2);

      // Add 3rd panel: Pods
      store.addPanel("pods");
      expect(store.activePanelsCount).toBe(3);
      expect(store.allActiveLeaves.some(l => l.panelKind === "pods")).toBe(true);

      // Add 4th panel: Events
      store.addPanel("events");
      expect(store.activePanelsCount).toBe(4);
      expect(store.allActiveLeaves.some(l => l.panelKind === "events")).toBe(true);
    });

    it("closes a panel and cleanly prunes the branch tree without orphans", () => {
      store.addPanel("pods");
      expect(store.activePanelsCount).toBe(3);

      const podsLeaf = store.allActiveLeaves.find(l => l.panelKind === "pods");
      expect(podsLeaf).toBeDefined();

      store.closePanel(podsLeaf!.id);
      expect(store.activePanelsCount).toBe(2);
      expect(store.allActiveLeaves.some(l => l.panelKind === "pods")).toBe(false);
    });

    it("handles maximize and restore cleanly", () => {
      const leaves = store.allActiveLeaves;
      const targetId = leaves[0].id;

      expect(store.maximizedPanelId).toBeUndefined();

      store.toggleMaximizePanel(targetId);
      expect(store.maximizedPanelId).toBe(targetId);

      store.toggleMaximizePanel(targetId);
      expect(store.maximizedPanelId).toBeUndefined();
    });

    it("supports branch ratio updates and bounds clamping", () => {
      expect(isBranchNode(store.rootNode)).toBe(true);
      const rootBranch = store.rootNode;

      store.setBranchRatio(rootBranch.id, 0.35);
      expect((store.rootNode as any).ratio).toBe(0.35);

      // Clamping
      store.setBranchRatio(rootBranch.id, 0.05);
      expect((store.rootNode as any).ratio).toBe(0.20); // MIN_SPLIT_RATIO

      store.setBranchRatio(rootBranch.id, 0.95);
      expect((store.rootNode as any).ratio).toBe(0.80); // MAX_SPLIT_RATIO
    });
  });

  describe("Configurable Workspaces Templates", () => {
    it("loads Operation template with Pods, Deployments and Kubetail", () => {
      store.selectWorkspace("operation");
      expect(store.activeWorkspaceId).toBe("operation");
      expect(store.activePanelsCount).toBe(3);

      const kinds = store.allActiveLeaves.map(l => l.panelKind);
      expect(kinds).toContain("pods");
      expect(kinds).toContain("deployments");
      expect(kinds).toContain("kubetail");
    });

    it("loads Incidents template with Kubetail, Events and Resource Details", () => {
      store.selectWorkspace("incidents");
      expect(store.activeWorkspaceId).toBe("incidents");
      expect(store.activePanelsCount).toBe(3);

      const kinds = store.allActiveLeaves.map(l => l.panelKind);
      expect(kinds).toContain("kubetail");
      expect(kinds).toContain("events");
      expect(kinds).toContain("resource-details");
    });

    it("loads Development template with Pods, Deployments and Resource Details", () => {
      store.selectWorkspace("development");
      expect(store.activeWorkspaceId).toBe("development");
      expect(store.activePanelsCount).toBe(3);

      const kinds = store.allActiveLeaves.map(l => l.panelKind);
      expect(kinds).toContain("pods");
      expect(kinds).toContain("deployments");
      expect(kinds).toContain("resource-details");
    });

    it("moves and regroups panels preserving panel identities", () => {
      store.selectWorkspace("h1-default");
      const leaves = store.allActiveLeaves;
      expect(leaves.length).toBe(2);

      const leaf1 = leaves[0];
      const leaf2 = leaves[1];

      // Group leaf2 into leaf1
      store.movePanel(leaf2.id, leaf1.id, "group");
      expect(store.rootNode.type).toBe("group");
      expect((store.rootNode as any).panels.length).toBe(2);
      expect((store.rootNode as any).activePanelId).toBe(leaf2.id);

      // Tab switching
      store.setActiveTabInGroup(store.rootNode.id, leaf1.id);
      expect((store.rootNode as any).activePanelId).toBe(leaf1.id);

      // Extract tab back to split
      store.extractTabFromGroup(store.rootNode.id, leaf2.id);
      expect(store.rootNode.type).toBe("branch");
      expect(store.activePanelsCount).toBe(2);

      // Swap leaves
      const updatedLeaves = store.allActiveLeaves;
      store.swapLeaves(updatedLeaves[0].id, updatedLeaves[1].id);
      const afterSwap = store.allActiveLeaves;
      expect(afterSwap[0].panelKind).toBe(updatedLeaves[1].panelKind);
      expect(afterSwap[1].panelKind).toBe(updatedLeaves[0].panelKind);
    });

    it("saves custom workspace and persists to storage", () => {
      store.selectWorkspace("operation");
      store.addPanel("events");
      expect(store.activePanelsCount).toBe(4);

      store.saveCustomWorkspace();
      expect(store.activeWorkspaceId).toBe("custom");
      expect(mockStorage["openlens:split-layout"]).toContain('"activeWorkspaceId":"custom"');
    });
  });

  describe("Inert Persistence & Zero-Secret Guarantee (Version 2)", () => {
    it("serializes V2 schema with zero credentials or tokens", () => {
      store.selectWorkspace("incidents");
      const serialized = store.serializeLayout(2) as any;

      expect(serialized.version).toBe(2);
      expect(serialized.activeWorkspaceId).toBe("incidents");
      expect(serialized.rootNode).toBeDefined();

      const jsonStr = JSON.stringify(serialized);
      expect(jsonStr).not.toContain("password");
      expect(jsonStr).not.toContain("token");
      expect(jsonStr).not.toContain("secret");
      expect(jsonStr).not.toContain("kubeconfig");
    });

    it("sanitizes V2 payload through sanitizeSplitLayout allowlist", () => {
      const untrustedV2 = {
        version: 2,
        activeWorkspaceId: "development",
        isClassicMode: false,
        maliciousToken: "eyJhbGciOi...",
        kubeconfigPath: "/etc/kubernetes/admin.conf",
        rootNode: {
          type: "branch",
          id: "branch-safe",
          orientation: "horizontal",
          ratio: 0.5,
          injectedScript: "<script>alert(1)</script>",
          first: { type: "leaf", id: "leaf-1", panelKind: "pods" },
          second: { type: "leaf", id: "leaf-2", panelKind: "terminal" },
        },
      };

      const clean = sanitizeSplitLayout(untrustedV2) as any;
      expect(clean).toBeDefined();
      expect(clean.version).toBe(2);
      expect(clean.activeWorkspaceId).toBe("development");
      expect(clean.maliciousToken).toBeUndefined();
      expect(clean.kubeconfigPath).toBeUndefined();
      expect(clean.rootNode.injectedScript).toBeUndefined();
    });

    it("restores V1 legacy snapshot by converting it seamlessly to V2", () => {
      const v1Payload = {
        version: 1,
        ratio: 0.60,
        isSwapped: false,
        isLeftClosed: false,
        isRightClosed: false,
        isClassicMode: false,
      };

      const restored = store.restoreLayout(v1Payload);
      expect(restored).toBe(true);
      expect(store.activePanelsCount).toBe(2);
      expect(store.allActiveLeaves.map(l => l.panelKind)).toEqual(["kubetail", "resource-details"]);
    });
  });
});
