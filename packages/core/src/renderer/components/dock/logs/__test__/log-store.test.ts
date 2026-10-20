/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computed } from "mobx";
import { LogStore } from "../store";
import type { Pod } from "@openlens/kube-object";
import type { LogTabData } from "../tab-store";

describe("LogStore (R2-03 Continuous Execution & Integrity)", () => {
  let logStore: LogStore;
  let mockCallForLogs: jest.Mock;

  const mockPod = {
    getNs: () => "default",
    getName: () => "test-pod",
    getId: () => "pod-123",
  } as unknown as Pod;

  const mockTabData: LogTabData = {
    selectedPodId: "pod-123",
    selectedContainer: "main",
    namespace: "default",
    showPrevious: false,
    showTimestamps: true,
  };

  const computedPod = computed(() => mockPod);
  const computedTabData = computed(() => mockTabData);
  const tabId = "tab-log-1";

  beforeEach(() => {
    mockCallForLogs = jest.fn();
    logStore = new LogStore({
      callForLogs: mockCallForLogs,
    });
  });

  afterEach(() => {
    logStore.stopLoadingLogs(tabId);
    logStore.clearLogs(tabId);
  });

  describe("Sub-second polling and deduplication", () => {
    it("preserves lines in the same second across polling calls without duplicating or losing lines", async () => {
      // First load: 2 lines in 2026-10-20T09:00:00.100Z and .200Z
      const initialLogs = [
        "2026-10-20T09:00:00.100000000Z Starting container",
        "2026-10-20T09:00:00.200000000Z Listening on port 8080",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(initialLogs);

      await logStore.load(tabId, computedPod, computedTabData);

      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.100000000Z Starting container",
        "2026-10-20T09:00:00.200000000Z Listening on port 8080",
      ]);

      // Verify getLastSinceTime does NOT artificially add +1 second
      const sinceTime = logStore.getLastSinceTime(tabId);

      expect(sinceTime).toBe("2026-10-20T09:00:00.200Z");

      // Polling loadMore returns overlap line plus new line in the SAME second
      const pollResponse = [
        "2026-10-20T09:00:00.200000000Z Listening on port 8080",
        "2026-10-20T09:00:00.800000000Z Health check OK",
        "2026-10-20T09:00:01.000000000Z Received HTTP GET /",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(pollResponse);

      await logStore.loadMore(tabId, computedPod, computedTabData);

      const logsAfterPoll = logStore.getLogs(tabId);

      expect(logsAfterPoll).toEqual([
        "2026-10-20T09:00:00.100000000Z Starting container",
        "2026-10-20T09:00:00.200000000Z Listening on port 8080",
        "2026-10-20T09:00:00.800000000Z Health check OK",
        "2026-10-20T09:00:01.000000000Z Received HTTP GET /",
      ]);
    });

    it("does not deduplicate legitimate identical lines if they are not overlap", async () => {
      const initialLogs = [
        "2026-10-20T09:00:00.000Z ping",
        "2026-10-20T09:00:00.500Z ping",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(initialLogs);
      await logStore.load(tabId, computedPod, computedTabData);

      // In the next poll, overlap is the last ping, plus two more pings
      const pollResponse = [
        "2026-10-20T09:00:00.500Z ping",
        "2026-10-20T09:00:01.000Z ping",
        "2026-10-20T09:00:01.500Z ping",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(pollResponse);
      await logStore.loadMore(tabId, computedPod, computedTabData);

      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.000Z ping",
        "2026-10-20T09:00:00.500Z ping",
        "2026-10-20T09:00:01.000Z ping",
        "2026-10-20T09:00:01.500Z ping",
      ]);
    });
  });

  describe("Pause and Resume stream handling", () => {
    it("accumulates new logs in pendingLogs when paused, keeping visible logs stable", async () => {
      const initialLogs = [
        "2026-10-20T09:00:00.000Z line 1",
        "2026-10-20T09:00:00.500Z line 2",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(initialLogs);
      await logStore.load(tabId, computedPod, computedTabData);

      // User pauses the log stream
      logStore.pause(tabId);
      expect(logStore.isPaused(tabId)).toBe(true);
      expect(logStore.getStatus(tabId)).toBe("PAUSED");
      expect(logStore.getPendingCount(tabId)).toBe(0);

      // Background poll arrives while paused
      const incomingLogs = [
        "2026-10-20T09:00:00.500Z line 2",
        "2026-10-20T09:00:01.000Z line 3 (pending)",
        "2026-10-20T09:00:01.500Z line 4 (pending)",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(incomingLogs);
      await logStore.loadMore(tabId, computedPod, computedTabData);

      // Visible logs MUST remain unchanged
      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.000Z line 1",
        "2026-10-20T09:00:00.500Z line 2",
      ]);

      // Pending counter reflects incoming lines
      expect(logStore.getPendingCount(tabId)).toBe(2);

      // Resuming flushes pending lines into visible logs
      logStore.resume(tabId);
      expect(logStore.isPaused(tabId)).toBe(false);
      expect(logStore.getStatus(tabId)).toBe("LIVE");
      expect(logStore.getPendingCount(tabId)).toBe(0);

      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.000Z line 1",
        "2026-10-20T09:00:00.500Z line 2",
        "2026-10-20T09:00:01.000Z line 3 (pending)",
        "2026-10-20T09:00:01.500Z line 4 (pending)",
      ]);
    });
  });

  describe("Buffer capping and truncation notification", () => {
    it("caps buffer at 10,000 lines and records truncated count", async () => {
      // Create 10,005 fake lines
      const bigLogBatch = Array.from({ length: 10005 }, (_, i) => `2026-10-20T09:00:00.000Z message line ${i + 1}`).join("\n");

      mockCallForLogs.mockResolvedValueOnce(bigLogBatch);
      await logStore.load(tabId, computedPod, computedTabData);

      expect(logStore.getLogs(tabId).length).toBe(10000);
      expect(logStore.isTruncated(tabId)).toBe(true);
      expect(logStore.getTruncatedCount(tabId)).toBe(5);

      // First line should be message line 6
      expect(logStore.getLogs(tabId)[0]).toBe("2026-10-20T09:00:00.000Z message line 6");
    });
  });

  describe("Transient error recovery without log history destruction", () => {
    it("retains existing logs on network / API error, setting ERROR status, and recovers on subsequent poll", async () => {
      const initialLogs = [
        "2026-10-20T09:00:00.000Z healthy line 1",
        "2026-10-20T09:00:00.500Z healthy line 2",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(initialLogs);
      await logStore.load(tabId, computedPod, computedTabData);

      expect(logStore.getLogs(tabId).length).toBe(2);

      // Simulate a network timeout on polling
      mockCallForLogs.mockRejectedValueOnce(new Error("ETIMEDOUT: Connection lost"));
      await logStore.loadMore(tabId, computedPod, computedTabData);

      // Previously loaded logs MUST NOT be wiped out!
      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.000Z healthy line 1",
        "2026-10-20T09:00:00.500Z healthy line 2",
      ]);
      expect(logStore.getStatus(tabId)).toBe("ERROR");
      expect(logStore.getError(tabId)).toContain("ETIMEDOUT: Connection lost");

      // Next poll succeeds: error is cleared and status returns to LIVE
      const recoveredLogs = [
        "2026-10-20T09:00:00.500Z healthy line 2",
        "2026-10-20T09:00:05.000Z reconnected line 3",
      ].join("\n");

      mockCallForLogs.mockResolvedValueOnce(recoveredLogs);
      await logStore.loadMore(tabId, computedPod, computedTabData);

      expect(logStore.getStatus(tabId)).toBe("LIVE");
      expect(logStore.getError(tabId)).toBeUndefined();
      expect(logStore.getLogs(tabId)).toEqual([
        "2026-10-20T09:00:00.000Z healthy line 1",
        "2026-10-20T09:00:00.500Z healthy line 2",
        "2026-10-20T09:00:05.000Z reconnected line 3",
      ]);
    });
  });
});
