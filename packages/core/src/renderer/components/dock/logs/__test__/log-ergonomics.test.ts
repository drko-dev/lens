/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computed, observable } from "mobx";
import { LogStore } from "../store";
import type { Pod } from "@openlens/kube-object";
import type { LogTabData } from "../tab-store";

describe("Log Ergonomics: Since, Tail, and Concurrency Invalidation (R7-08)", () => {
  let logStore: LogStore;
  let mockCallForLogs: jest.Mock;

  const mockPod = {
    getNs: () => "default",
    getName: () => "test-pod",
    getId: () => "pod-123",
  } as unknown as Pod;

  const createTabData = (overrides: Partial<LogTabData> = {}): LogTabData => ({
    selectedPodId: "pod-123",
    selectedContainer: "main",
    namespace: "default",
    showPrevious: false,
    showTimestamps: true,
    ...overrides,
  });

  const tabId1 = "tab-log-1";
  const tabId2 = "tab-log-2";

  beforeEach(() => {
    mockCallForLogs = jest.fn();
    logStore = new LogStore({
      callForLogs: mockCallForLogs,
    });
  });

  afterEach(() => {
    logStore.stopLoadingLogs(tabId1);
    logStore.stopLoadingLogs(tabId2);
    logStore.clearLogs(tabId1);
    logStore.clearLogs(tabId2);
  });

  describe("Since and Tail Query Parameters", () => {
    it("translates tailLines (100, 500, 1000) into query parameters", async () => {
      const tabData = observable.box(createTabData({ tailLines: 100 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z line1");

      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      expect(mockCallForLogs).toHaveBeenCalledWith(
        { namespace: "default", name: "test-pod" },
        expect.objectContaining({
          tailLines: 100,
        }),
      );
    });

    it("does not pass tailLines when All is explicitly selected (tailLines: 0)", async () => {
      // Explicit All sends tailLines: 0 in tabData (TAIL_ALL)
      const tabData = observable.box(createTabData({ tailLines: 0 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z line1");

      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      const callArgs = mockCallForLogs.mock.calls[0][1];

      // Verifies the exact absence of tailLines in query params sent to Kubernetes API
      expect(callArgs.tailLines).toBeUndefined();
    });

    it("preserves legacy progressive loading when tailLines is unconfigured (undefined)", async () => {
      // Unconfigured legacy tab has tailLines: undefined
      const tabData = observable.box(createTabData({ tailLines: undefined }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z line1");

      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      // Note: when tailLines is not specified in tabData, progressive loading default is used
      expect(mockCallForLogs).toHaveBeenCalledWith(
        { namespace: "default", name: "test-pod" },
        expect.objectContaining({
          tailLines: 500, // progressive default
        }),
      );
    });

    it("translates sinceSeconds (15m=900, 1h=3600, etc.) into query parameters", async () => {
      const tabData = observable.box(createTabData({ sinceSeconds: 900 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z line1");

      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      expect(mockCallForLogs).toHaveBeenCalledWith(
        { namespace: "default", name: "test-pod" },
        expect.objectContaining({
          sinceSeconds: 900,
        }),
      );
    });

    it("never sends sinceSeconds and sinceTime simultaneously during loadMore streaming", async () => {
      const tabData = observable.box(createTabData({ sinceSeconds: 3600 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00.100Z initial line");

      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      mockCallForLogs.mockClear();
      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:01.000Z streamed line");

      await logStore.loadMore(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      expect(mockCallForLogs).toHaveBeenCalledWith(
        { namespace: "default", name: "test-pod" },
        expect.objectContaining({
          sinceTime: "2026-10-24T00:00:00.100Z",
        }),
      );

      const lastCallArgs = mockCallForLogs.mock.calls[0][1];

      expect(lastCallArgs.sinceSeconds).toBeUndefined();
    });
  });

  describe("Concurrency & Stale Response Invalidation", () => {
    it("discards late response when user changes filter before first request finishes", async () => {
      const tabData1 = observable.box(createTabData({ sinceSeconds: 900 }));
      let resolveFirstCall: (value: string) => void = () => {};
      const firstCallPromise = new Promise<string>((resolve) => {
        resolveFirstCall = resolve;
      });

      mockCallForLogs.mockImplementationOnce(() => firstCallPromise);

      // Start initial load
      const firstLoad = logStore.load(tabId1, computed(() => mockPod), computed(() => tabData1.get()));

      // User changes since filter to 24h (86400s) -> reloadLogs triggers clearLogs then load
      const tabData2 = observable.box(createTabData({ sinceSeconds: 86400 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z NEW 24h LOG DATA");

      const reload = logStore.reload(tabId1, computed(() => mockPod), computed(() => tabData2.get()));

      // Now resolve the first delayed request
      resolveFirstCall?.("2026-10-24T00:00:00Z OLD OBSOLETE LOG DATA");

      await Promise.all([firstLoad, reload]);

      // The store should only contain the NEW data, not the old obsolete data
      const logs = logStore.getLogs(tabId1);

      expect(logs).toEqual(["2026-10-24T00:00:00Z NEW 24h LOG DATA"]);
      expect(logs).not.toContain("2026-10-24T00:00:00Z OLD OBSOLETE LOG DATA");
    });

    it("discards late error from obsolete loadMore after reload and preserves healthy tab state", async () => {
      const tabData = observable.box(createTabData({ sinceSeconds: 900 }));

      // 1. Initial successful load
      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00.000Z initial line");
      await logStore.load(tabId1, computed(() => mockPod), computed(() => tabData.get()));
      expect(logStore.getStatus(tabId1)).toBe("LIVE");

      // 2. loadMore is started, pending
      let rejectLoadMore: (err: any) => void = () => {};
      const loadMorePromise = new Promise<string>((_, reject) => {
        rejectLoadMore = reject;
      });

      mockCallForLogs.mockImplementationOnce(() => loadMorePromise);
      const pendingLoadMore = logStore.loadMore(tabId1, computed(() => mockPod), computed(() => tabData.get()));

      // 3. While loadMore is in flight, user changes filter and reloads
      const updatedTabData = observable.box(createTabData({ sinceSeconds: 3600 }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00.000Z reloaded line");
      const reloadPromise = logStore.reload(tabId1, computed(() => mockPod), computed(() => updatedTabData.get()));

      // 4. Stale loadMore now fails with network error
      rejectLoadMore(new Error("Connection reset by peer"));

      await Promise.allSettled([pendingLoadMore, reloadPromise]);

      // 5. Verify the error from obsolete loadMore did NOT corrupt the reloaded tab state!
      expect(logStore.getError(tabId1)).toBeUndefined();
      expect(logStore.getStatus(tabId1)).toBe("LIVE");
      expect(logStore.getLogs(tabId1)).toEqual(["2026-10-24T00:00:00.000Z reloaded line"]);
    });

    it("maintains strict isolation between different tabs", async () => {
      const tab1Data = observable.box(createTabData({ selectedContainer: "container-1" }));
      const tab2Data = observable.box(createTabData({ selectedContainer: "container-2" }));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z Tab 1 logs");
      await logStore.load(tabId1, computed(() => mockPod), computed(() => tab1Data.get()));

      mockCallForLogs.mockResolvedValueOnce("2026-10-24T00:00:00Z Tab 2 logs");
      await logStore.load(tabId2, computed(() => mockPod), computed(() => tab2Data.get()));

      expect(logStore.getLogs(tabId1)).toEqual(["2026-10-24T00:00:00Z Tab 1 logs"]);
      expect(logStore.getLogs(tabId2)).toEqual(["2026-10-24T00:00:00Z Tab 2 logs"]);

      // Clearing Tab 1 does not affect Tab 2
      logStore.clearLogs(tabId1);
      expect(logStore.getLogs(tabId1)).toEqual([]);
      expect(logStore.getLogs(tabId2)).toEqual(["2026-10-24T00:00:00Z Tab 2 logs"]);
    });
  });
});
