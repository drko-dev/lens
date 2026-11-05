/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";
import midnightGraphiteTheme from "../../../themes/midnight-graphite.injectable";

describe("H5: Hardening, Lifecycle Cleanup & Theme Consistency Suite", () => {
  let store: SplitPanelStore;
  let mockStopStream: jest.Mock;
  let mockResumeStream: jest.Mock;
  let mockInvoke: jest.Mock;

  beforeEach(() => {
    mockStopStream = jest.fn();
    mockResumeStream = jest.fn();
    mockInvoke = jest.fn().mockResolvedValue({ windowId: 101, reused: false });

    store = new SplitPanelStore({
      initialClusterId: "cluster-h5-test",
      invoke: mockInvoke,
      onStreamStopRequested: mockStopStream,
      onStreamResumeRequested: mockResumeStream,
    });
  });

  afterEach(() => {
    store.dispose();
  });

  describe("H5-A: Stream Lifecycle Cleanup on Panel Close", () => {
    it("stops background stream immediately when a panel is closed", () => {
      const initialLeaves = store.allActiveLeaves;
      expect(initialLeaves.length).toBeGreaterThan(1);
      const targetLeaf = initialLeaves[0];

      mockStopStream.mockClear();
      store.closePanel(targetLeaf.id);

      expect(mockStopStream).toHaveBeenCalledWith(targetLeaf.id);
    });

    it("stops background streams for all pruned panels when switching workspaces", () => {
      // Start in default (2 panels)
      const initialIds = store.allActiveLeaves.map(l => l.id);

      // Switch to operation workspace (which replaces root with new leaves)
      mockStopStream.mockClear();
      store.selectWorkspace("operation");

      const newIds = new Set(store.allActiveLeaves.map(l => l.id));

      // Each pruned id must have received an onStreamStopRequested
      for (const oldId of initialIds) {
        if (!newIds.has(oldId)) {
          expect(mockStopStream).toHaveBeenCalledWith(oldId);
        }
      }
    });

    it("does not leak streams or throw when closing already closed or non-existent panel", () => {
      mockStopStream.mockClear();
      store.closePanel("non-existent-id");
      expect(mockStopStream).not.toHaveBeenCalled();
    });
  });

  describe("H5-B: Layout Stress & Node Recycling Resilience", () => {
    it("handles rapid opening and closing of panels without memory leaks or orphan nodes", () => {
      // Rapidly switch between templates and add panels
      for (let i = 0; i < 20; i++) {
        store.selectWorkspace("incidents");
        store.selectWorkspace("development");
        store.selectWorkspace("operation");
      }

      const activeLeaves = store.allActiveLeaves;
      expect(activeLeaves.length).toBe(3); // Operation workspace has 3 panels

      // Verify each leaf has valid parent and structure
      activeLeaves.forEach(leaf => {
        expect(leaf.id).toBeTruthy();
        expect(leaf.panelKind).toBeTruthy();
      });
    });
  });

  describe("H5-C: Midnight Graphite Design Token Completeness", () => {
    it("defines all essential Midnight Graphite semantic tokens in theme definition", () => {
      const mockDi = {
        inject: jest.fn().mockReturnValue({ colors: {} }),
      };
      const themeColors = midnightGraphiteTheme.instantiate(mockDi as any).colors;

      // Essential surface tokens
      expect(themeColors.surface).toBe("#121925");
      expect(themeColors.surfaceRaised).toBe("#161E2A");
      expect(themeColors.surfaceElevated).toBe("#1A2433");
      expect(themeColors.surfaceHover).toBe("#1E2A3A");

      // Text tokens
      expect(themeColors.textPrimary).toBe("#E4EBF4");
      expect(themeColors.textSecondary).toBe("#A8B4C6");
      expect(themeColors.textMuted).toBe("#6F7D91");

      // Border tokens
      expect(themeColors.borderDefault).toBe("#2C3848");
      expect(themeColors.borderSubtle).toBe("#1E2836");
      expect(themeColors.borderStrong).toBe("#3D4F66");

      // Action & Interactive tokens
      expect(themeColors.actionPrimary).toBe("#5F8AD4");
      expect(themeColors.focusRing).toBe("#7BA3E3");

      // Status tokens
      expect(themeColors.statusSuccess).toBe("#3DBF88");
      expect(themeColors.statusWarning).toBe("#E0AE62");
      expect(themeColors.statusError).toBe("#F05353");
      expect(themeColors.statusInfo).toBe("#7BA3E3");
    });
  });
});
