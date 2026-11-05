/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore, DEFAULT_SPLIT_RATIO, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO } from "../split-panel-store";

describe("SplitPanelStore", () => {
  let storageMap: Map<string, string>;
  let store: SplitPanelStore;

  beforeEach(() => {
    storageMap = new Map();
    store = new SplitPanelStore({
      initialClusterId: "cluster-alpha",
      getLocalStorageItem: (key) => storageMap.get(key) ?? null,
      setLocalStorageItem: (key, value) => storageMap.set(key, value),
    });
  });

  describe("Initialization & Default State", () => {
    it("initializes with default 58/42 split ratio and active split view", () => {
      expect(store.ratio).toBe(DEFAULT_SPLIT_RATIO);
      expect(store.effectiveLeftWidthPercent).toBe(58);
      expect(store.effectiveRightWidthPercent).toBe(42);
      expect(store.isSplitActive).toBe(true);
      expect(store.isSwapped).toBe(false);
      expect(store.isLeftClosed).toBe(false);
      expect(store.isRightClosed).toBe(false);
      expect(store.isClassicMode).toBe(false);
      expect(store.clusterId).toBe("cluster-alpha");
    });
  });

  describe("Resizing & Ratio Constraints", () => {
    it("updates ratio within valid bounds (0.20 to 0.80)", () => {
      store.setRatio(0.65);
      expect(store.ratio).toBe(0.65);
      expect(store.effectiveLeftWidthPercent).toBe(65);
      expect(store.effectiveRightWidthPercent).toBe(35);
    });

    it("clamps ratio to MIN_SPLIT_RATIO (0.20) when set below minimum", () => {
      store.setRatio(0.05);
      expect(store.ratio).toBe(MIN_SPLIT_RATIO);
      expect(store.effectiveLeftWidthPercent).toBe(20);
      expect(store.effectiveRightWidthPercent).toBe(80);
    });

    it("clamps ratio to MAX_SPLIT_RATIO (0.80) when set above maximum", () => {
      store.setRatio(0.95);
      expect(store.ratio).toBe(MAX_SPLIT_RATIO);
      expect(store.effectiveLeftWidthPercent).toBe(80);
      expect(store.effectiveRightWidthPercent).toBe(20);
    });

    it("ignores NaN or invalid ratio values", () => {
      store.setRatio(0.60);
      store.setRatio(NaN);
      expect(store.ratio).toBe(0.60);
    });
  });

  describe("Panel Swapping", () => {
    it("toggles swapped order between left and right", () => {
      expect(store.isSwapped).toBe(false);
      store.swapPanels();
      expect(store.isSwapped).toBe(true);
      store.swapPanels();
      expect(store.isSwapped).toBe(false);
    });
  });

  describe("Closing and Reopening Panels", () => {
    it("closing right panel expands left panel to 100% width", () => {
      store.closeRightPanel();
      expect(store.isRightClosed).toBe(true);
      expect(store.effectiveLeftWidthPercent).toBe(100);
      expect(store.effectiveRightWidthPercent).toBe(0);
      expect(store.isSplitActive).toBe(false);

      store.openRightPanel();
      expect(store.isRightClosed).toBe(false);
      expect(store.effectiveLeftWidthPercent).toBe(58);
      expect(store.effectiveRightWidthPercent).toBe(42);
      expect(store.isSplitActive).toBe(true);
    });

    it("closing left panel expands right panel to 100% width", () => {
      store.closeLeftPanel();
      expect(store.isLeftClosed).toBe(true);
      expect(store.effectiveLeftWidthPercent).toBe(0);
      expect(store.effectiveRightWidthPercent).toBe(100);
      expect(store.isSplitActive).toBe(false);

      store.openLeftPanel();
      expect(store.isLeftClosed).toBe(false);
      expect(store.effectiveLeftWidthPercent).toBe(58);
      expect(store.effectiveRightWidthPercent).toBe(42);
      expect(store.isSplitActive).toBe(true);
    });

    it("resetLayout restores default ratio and reopens both panels", () => {
      store.setRatio(0.75);
      store.swapPanels();
      store.closeRightPanel();
      store.setClassicMode(true);

      store.resetLayout();
      expect(store.ratio).toBe(DEFAULT_SPLIT_RATIO);
      expect(store.isSwapped).toBe(false);
      expect(store.isLeftClosed).toBe(false);
      expect(store.isRightClosed).toBe(false);
      expect(store.isClassicMode).toBe(false);
      expect(store.isSplitActive).toBe(true);
    });
  });

  describe("Classic Mode (Feature Toggle & Rollback)", () => {
    it("toggles classic mode on and off", () => {
      expect(store.isClassicMode).toBe(false);
      store.toggleClassicMode();
      expect(store.isClassicMode).toBe(true);
      expect(store.isSplitActive).toBe(false);
      store.toggleClassicMode();
      expect(store.isClassicMode).toBe(false);
      expect(store.isSplitActive).toBe(true);
    });
  });

  describe("Cluster Isolation & Resource Binding", () => {
    it("stores and clears resource binding", () => {
      store.setResourceBinding({
        kind: "Deployment",
        name: "frontend-gateway",
        namespace: "production",
      });

      expect(store.resourceBinding).toEqual({
        apiVersion: undefined,
        kind: "Deployment",
        name: "frontend-gateway",
        namespace: "production",
        uid: undefined,
      });

      store.setResourceBinding(undefined);
      expect(store.resourceBinding).toBeUndefined();
    });

    it("resets resource binding when clusterId changes to prevent cross-cluster leakage", () => {
      store.setResourceBinding({
        kind: "Deployment",
        name: "frontend-gateway",
        namespace: "production",
      });

      store.setClusterId("cluster-beta");
      expect(store.clusterId).toBe("cluster-beta");
      expect(store.resourceBinding).toBeUndefined();
    });
  });
});
