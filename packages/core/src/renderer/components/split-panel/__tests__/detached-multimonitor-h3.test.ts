/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SplitPanelStore } from "../split-panel-store";

describe("H3: Detached Tool Windows, Multimonitor & Single-Owner Lifecycle Suite", () => {
  let store: SplitPanelStore;
  let mockInvoke: jest.Mock;
  let mockStopStream: jest.Mock;
  let mockResumeStream: jest.Mock;
  let registeredRedockHandler: ((notice: any) => void) | undefined;

  beforeEach(() => {
    mockInvoke = jest.fn().mockResolvedValue({ windowId: 42, reused: false });
    mockStopStream = jest.fn();
    mockResumeStream = jest.fn();

    store = new SplitPanelStore({
      initialClusterId: "cluster-h3-test",
      invoke: mockInvoke,
      onRedocked: (callback) => {
        registeredRedockHandler = callback;

        return () => {
          registeredRedockHandler = undefined;
        };
      },
      onStreamStopRequested: mockStopStream,
      onStreamResumeRequested: mockResumeStream,
    });

    store.selectWorkspace("incidents");
    store.setResourceBinding({
      kind: "Deployment",
      name: "demo-web",
      namespace: "demo-apps",
      uid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      apiVersion: "apps/v1",
    });
  });

  afterEach(() => {
    store.dispose();
  });

  describe("H3-A & H3-B: Detachment Contract and Stable Identity", () => {
    it("creates a stable detached panel descriptor with single session key", async () => {
      const leaves = store.allActiveLeaves;
      const kubetailLeaf = leaves.find(l => l.panelKind === "kubetail")!;

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);

      const success = await store.detachPanel(kubetailLeaf.id);

      expect(success).toBe(true);
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);

      const state = store.getDetachedState(kubetailLeaf.id);

      expect(state).toBeDefined();
      expect(state?.panelId).toBe(kubetailLeaf.id);
      expect(state?.panelKind).toBe("kubetail");
      expect(state?.clusterId).toBe("cluster-h3-test");
      expect(state?.workspaceId).toBe("incidents");
      expect(state?.resource?.name).toBe("demo-web");
      expect(state?.resource?.kind).toBe("Deployment");
      expect(state?.sessionKey).toBe(`cluster-h3-test/incidents/${kubetailLeaf.id}/logs`);
      expect(state?.windowId).toBe(42);
    });

    it("focuses existing owner and avoids duplicating detached state on repeated detach", async () => {
      const leaves = store.allActiveLeaves;
      const leaf = leaves[0];

      await store.detachPanel(leaf.id);
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      // Second attempt on the same panel
      const secondResult = await store.detachPanel(leaf.id);

      expect(secondResult).toBe(true);
      expect(mockInvoke).toHaveBeenCalledTimes(1); // Not duplicated
      expect(store.detachedPanels.size).toBe(1);
    });

    it("rejects invalid or non-existent leaf ids safely without crashing", async () => {
      const result = await store.detachPanel("non-existent-leaf-id");

      expect(result).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(store.detachedPanels.size).toBe(0);
    });

    it("refuses detachment without valid resource binding", async () => {
      store.setResourceBinding(undefined);
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      const result = await store.detachPanel(kubetailLeaf.id);

      expect(result).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);
    });

    it("rolls back stream ownership and does not mark detached if window opening fails", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Failed to open window"));
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await expect(store.detachPanel(kubetailLeaf.id)).rejects.toThrow("Failed to open window");

      // Verify stream was rolled back
      expect(mockResumeStream).toHaveBeenCalledWith(kubetailLeaf.id);
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);
      expect(store.detachedPanels.size).toBe(0);
    });
  });

  describe("H3-C: Single-Owner Streaming Invariance for Kubetail", () => {
    it("stops local streaming before requesting Main to take ownership", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await store.detachPanel(kubetailLeaf.id);

      // Verify onStreamStopRequested was called prior to / during detachment
      expect(mockStopStream).toHaveBeenCalledWith(kubetailLeaf.id);
      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("resumes local streaming only after redocking completes", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await store.detachPanel(kubetailLeaf.id);
      expect(mockStopStream).toHaveBeenCalledTimes(1);

      await store.redockPanel(kubetailLeaf.id);

      expect(mockInvoke).toHaveBeenCalledWith("detached-tool:frame-request-redock", {
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      });
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);
      expect(mockResumeStream).toHaveBeenCalledWith(kubetailLeaf.id);
    });
  });

  describe("H3-D: Redock Lifecycle and OS Window Close Events", () => {
    it("handles native OS close or external redock events cleanly via onPanelRedocked", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await store.detachPanel(kubetailLeaf.id);
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);

      // Simulate external notification from Electron Main (window closed via macOS red button)
      expect(registeredRedockHandler).toBeDefined();
      registeredRedockHandler!({
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      });

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);
      expect(mockResumeStream).toHaveBeenCalledWith(kubetailLeaf.id);
    });

    it("ignores redock notifications for unrelated clusters or tabs", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await store.detachPanel(kubetailLeaf.id);

      registeredRedockHandler!({
        clusterId: "other-cluster",
        workspaceId: "incidents",
        tabId: "other-tab",
        toolKind: "logs",
      });

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);
      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("rejects redock with matching tabId but different clusterId (fail-closed)", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      await store.detachPanel(kubetailLeaf.id);

      registeredRedockHandler!({
        clusterId: "malicious-foreign-cluster",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      });

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);
      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("rejects redock with matching tabId but different workspaceId (fail-closed)", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      await store.detachPanel(kubetailLeaf.id);

      registeredRedockHandler!({
        clusterId: "cluster-h3-test",
        workspaceId: "other-workspace",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      });

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);
      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("rejects redock with matching tabId but different toolKind (fail-closed)", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      await store.detachPanel(kubetailLeaf.id);

      registeredRedockHandler!({
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "inspector", // kubetail expects 'logs'
      });

      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(true);
      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("ignores redock notifications for non-existent session", () => {
      registeredRedockHandler!({
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: "non-existent-panel-id",
        toolKind: "logs",
      });

      expect(mockResumeStream).not.toHaveBeenCalled();
    });

    it("processes valid redock exactly once and ignores duplicate notifications", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      await store.detachPanel(kubetailLeaf.id);

      const notice = {
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      };

      // First notification: valid
      registeredRedockHandler!(notice);
      expect(store.isPanelDetached(kubetailLeaf.id)).toBe(false);
      expect(mockResumeStream).toHaveBeenCalledTimes(1);

      // Duplicate notification: ignored
      registeredRedockHandler!(notice);
      expect(mockResumeStream).toHaveBeenCalledTimes(1);
    });

    it("ignores redock notification received after store is disposed", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;
      await store.detachPanel(kubetailLeaf.id);

      const cachedHandler = registeredRedockHandler;
      store.dispose();

      expect(store.isDisposed).toBe(true);

      cachedHandler!({
        clusterId: "cluster-h3-test",
        workspaceId: "incidents",
        tabId: kubetailLeaf.id,
        toolKind: "logs",
      });

      expect(mockResumeStream).not.toHaveBeenCalled();
    });
  });

  describe("H3-E: Resource Details Safe Inspector Detachment", () => {
    it("detaches Resource Details with toolKind 'inspector' and apiVersion", async () => {
      const detailsLeaf = store.allActiveLeaves.find(l => l.panelKind === "resource-details")!;

      await store.detachPanel(detailsLeaf.id);

      expect(store.isPanelDetached(detailsLeaf.id)).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("detached-tool:request-detach", expect.objectContaining({
        toolKind: "inspector",
        resource: expect.objectContaining({
          kind: "Deployment",
          name: "demo-web",
          namespace: "demo-apps",
          apiVersion: "apps/v1",
        }),
      }));
    });
  });

  describe("H3-H: Zero Credential Guarantee & Sandboxing", () => {
    it("does not leak secrets or credentials into detached state or storage", async () => {
      const kubetailLeaf = store.allActiveLeaves.find(l => l.panelKind === "kubetail")!;

      await store.detachPanel(kubetailLeaf.id);

      const state = store.getDetachedState(kubetailLeaf.id);
      const serialized = JSON.stringify(state);

      expect(serialized).not.toMatch(/token|bearer|secret|password|privateKey|kubeconfig/i);
    });
  });
});
