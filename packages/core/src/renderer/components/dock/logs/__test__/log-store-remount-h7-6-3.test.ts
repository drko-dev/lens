/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computed, observable, runInAction } from "mobx";
import type { Pod } from "@openlens/kube-object";
import { LogStore } from "../store";
import type { LogTabData } from "../tab-store";

const line = (n: number, ms = 0) => `2026-11-03T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.${String(ms).padStart(3, "0")}Z Line ${n}`;
const lines = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => line(from + i)).join("\n");

describe("LogStore remount and session preservation (H7.6.3B)", () => {
  let store: LogStore;
  let callForLogs: jest.Mock;
  let setIntervalSpy: jest.SpyInstance;

  const pod = (id: string) => ({ getNs: () => "default", getName: () => `pod-${id}`, getId: () => id }) as unknown as Pod;
  const data = (over: Partial<LogTabData> = {}): LogTabData => ({
    selectedPodId: "pod-123",
    selectedContainer: "main",
    namespace: "default",
    showPrevious: false,
    showTimestamps: false,
    ...over,
  });
  const podRef = computed(() => pod("pod-123"));
  const tabData = (value: LogTabData | undefined = data()) => computed(() => value);
  const tabId = "tab-1";

  beforeEach(() => {
    callForLogs = jest.fn();
    store = new LogStore({ callForLogs });
    setIntervalSpy = jest.spyOn(window, "setInterval");
  });

  afterEach(() => {
    store.clearLogs(tabId);
    store.clearLogs("tab-2");
    setIntervalSpy.mockRestore();
  });

  describe("identity of a session", () => {
    it("can resume only the exact same content session", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.load(tabId, podRef, tabData());

      expect(store.canResume(tabId, data())).toBe(true);
      // Anything that changes the CONTENT is a different session.
      expect(store.canResume(tabId, data({ selectedContainer: "sidecar" }))).toBe(false);
      expect(store.canResume(tabId, data({ selectedPodId: "pod-other" }))).toBe(false);
      expect(store.canResume(tabId, data({ namespace: "other-ns" }))).toBe(false);
      expect(store.canResume(tabId, data({ showPrevious: true }))).toBe(false);
      expect(store.canResume(tabId, data({ tailLines: 100 }))).toBe(false);
      expect(store.canResume(tabId, data({ sinceSeconds: 900 }))).toBe(false);
      // Display-only options do not.
      expect(store.canResume(tabId, data({ wordWrap: true, showTimestamps: true }))).toBe(true);
      expect(store.canResume(tabId, undefined)).toBe(false);
      expect(store.canResume("never-loaded", data())).toBe(false);
    });

    it("registers the session even when the tab data is written after load() started", async () => {
      // BoundPodLogs writes the tab data in an effect: load() can start before it exists.
      const late = observable.box<LogTabData | undefined>(undefined);
      const lateData = computed(() => late.get());

      callForLogs.mockResolvedValueOnce(lines(1, 2));

      const loading = store.load(tabId, podRef, lateData);

      runInAction(() => late.set(data()));
      await loading;

      expect(store.getLogs(tabId)).toHaveLength(2);
      expect(store.canResume(tabId, data())).toBe(true);
    });

    it("keeps buffers of different tabs (pods/containers) apart", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.load(tabId, podRef, tabData());
      callForLogs.mockResolvedValueOnce(lines(100, 101));
      await store.load("tab-2", computed(() => pod("pod-999")), tabData(data({ selectedPodId: "pod-999" })));

      expect(store.getLogs(tabId)).toEqual(lines(1, 2).split("\n"));
      expect(store.getLogs("tab-2")).toEqual(lines(100, 101).split("\n"));
      expect(store.canResume("tab-2", data())).toBe(false);
    });
  });

  describe("remount", () => {
    it("reload() wipes the history (why a remount must not use it), resumeLoading() keeps it", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 3));
      await store.load(tabId, podRef, tabData());
      store.stopLoadingLogs(tabId);

      callForLogs.mockResolvedValueOnce(lines(3, 4));
      await store.resumeLoading(tabId, podRef, tabData());
      expect(store.getLogs(tabId)).toEqual(lines(1, 4).split("\n"));

      store.stopLoadingLogs(tabId);
      callForLogs.mockResolvedValueOnce(lines(5, 5));

      const reloading = store.reload(tabId, podRef, tabData());

      expect(store.getLogs(tabId)).toHaveLength(0);
      await reloading;
    });

    it("falls back to a clean reload when the session is not the same", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 3));
      await store.load(tabId, podRef, tabData());
      store.stopLoadingLogs(tabId);

      callForLogs.mockResolvedValueOnce(lines(50, 51));
      await store.resumeLoading(tabId, podRef, tabData(data({ selectedContainer: "sidecar" })));

      expect(store.getLogs(tabId)).toEqual(lines(50, 51).split("\n"));
    });

    it("never runs two timers for one tab, however many times it resumes", async () => {
      callForLogs.mockResolvedValue(lines(1, 2));
      await store.load(tabId, podRef, tabData());
      store.stopLoadingLogs(tabId);
      setIntervalSpy.mockClear();

      await store.resumeLoading(tabId, podRef, tabData());
      await store.resumeLoading(tabId, podRef, tabData());
      await store.resumeLoading(tabId, podRef, tabData());

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it("does not ask twice while a request is in flight", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.load(tabId, podRef, tabData());
      callForLogs.mockClear();

      let release!: (value: string) => void;

      callForLogs.mockReturnValueOnce(new Promise<string>((resolve) => { release = resolve; }));

      const first = store.loadMore(tabId, podRef, tabData());
      const second = store.loadMore(tabId, podRef, tabData());

      release(lines(3, 3));
      await Promise.all([first, second]);

      expect(callForLogs).toHaveBeenCalledTimes(1);
      expect(store.getLogs(tabId)).toEqual(lines(1, 3).split("\n"));
    });
  });

  describe("buffer", () => {
    it("deduplicates overlapping and same-timestamp lines on resume", async () => {
      const a = `${line(1, 500)} first`;
      const b = `${line(1, 500)} second`; // same timestamp, different content: both are real lines

      callForLogs.mockResolvedValueOnce([a, b].join("\n"));
      await store.load(tabId, podRef, tabData());
      store.stopLoadingLogs(tabId);

      // The server repeats everything since the last timestamp, plus one new line.
      callForLogs.mockResolvedValueOnce([a, b, line(2)].join("\n"));
      await store.resumeLoading(tabId, podRef, tabData());

      expect(store.getLogs(tabId)).toEqual([a, b, line(2)]);
    });

    it("keeps the 10000-line cap across resumes and counts what it dropped", async () => {
      callForLogs.mockResolvedValueOnce(Array.from({ length: 10005 }, (_, i) => line(i)).join("\n"));
      await store.load(tabId, podRef, tabData());

      expect(store.getLogs(tabId)).toHaveLength(10000);
      expect(store.getTruncatedCount(tabId)).toBe(5);

      store.stopLoadingLogs(tabId);
      callForLogs.mockResolvedValueOnce(Array.from({ length: 4 }, (_, i) => line(20000 + i)).join("\n"));
      await store.resumeLoading(tabId, podRef, tabData());

      expect(store.getLogs(tabId)).toHaveLength(10000);
      expect(store.getTruncatedCount(tabId)).toBe(9);
    });
  });

  describe("pause and follow", () => {
    it("does not reactivate a paused tab, and holds new lines until resume", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 1));
      await store.load(tabId, podRef, tabData());
      store.pause(tabId);
      store.stopLoadingLogs(tabId);

      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.resumeLoading(tabId, podRef, tabData());

      expect(store.isPaused(tabId)).toBe(true);
      expect(store.getStatus(tabId)).toBe("PAUSED");
      expect(store.getPendingCount(tabId)).toBe(1);
      expect(store.getLogs(tabId)).toEqual(lines(1, 1).split("\n"));

      store.resume(tabId);
      expect(store.getLogs(tabId)).toEqual(lines(1, 2).split("\n"));
    });

    it("keeps follow and scroll offset across a stop/resume, defaulting to follow", async () => {
      expect(store.getViewState(tabId)).toEqual({ follow: true, offset: 0 });

      callForLogs.mockResolvedValueOnce(lines(1, 3));
      await store.load(tabId, podRef, tabData());
      store.setViewState(tabId, { follow: false, offset: 240 });
      store.stopLoadingLogs(tabId);

      callForLogs.mockResolvedValueOnce(lines(3, 4));
      await store.resumeLoading(tabId, podRef, tabData());

      expect(store.getViewState(tabId)).toEqual({ follow: false, offset: 240 });
      store.setViewState(tabId, { follow: true });
      expect(store.getViewState(tabId)).toEqual({ follow: true, offset: 240 });
    });
  });

  describe("collapse versus close", () => {
    it("stopLoadingLogs (move/collapse) keeps the buffer and the session but stops the timer", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.load(tabId, podRef, tabData());
      store.setViewState(tabId, { follow: false, offset: 10 });
      store.stopLoadingLogs(tabId);

      expect(store.getLogs(tabId)).toHaveLength(2);
      expect(store.canResume(tabId, data())).toBe(true);
      expect(store.getViewState(tabId).offset).toBe(10);

      // No consumer: no polling even after a long time.
      callForLogs.mockClear();
      jest.useFakeTimers();
      jest.advanceTimersByTime(60_000);
      jest.useRealTimers();
      expect(callForLogs).not.toHaveBeenCalled();
    });

    it("clearLogs (close) releases buffer, session, view state, pause and the timer", async () => {
      callForLogs.mockResolvedValueOnce(lines(1, 2));
      await store.load(tabId, podRef, tabData());
      store.pause(tabId);
      store.setViewState(tabId, { follow: false, offset: 10 });

      const clearSpy = jest.spyOn(window, "clearInterval");

      store.clearLogs(tabId);

      expect(clearSpy).toHaveBeenCalled();
      expect(store.getLogs(tabId)).toEqual([]);
      expect(store.canResume(tabId, data())).toBe(false);
      expect(store.getViewState(tabId)).toEqual({ follow: true, offset: 0 });
      expect(store.isPaused(tabId)).toBe(false);
      expect(store.areLogsPresent(tabId)).toBe(true); // "no buffer" in Lens terms
      clearSpy.mockRestore();
    });

    it("a late answer from before the close does not resurrect the buffer", async () => {
      let release!: (value: string) => void;

      callForLogs.mockReturnValueOnce(new Promise<string>((resolve) => { release = resolve; }));

      const loading = store.load(tabId, podRef, tabData());

      store.clearLogs(tabId); // closed while the first request is still in flight
      release(lines(1, 2));
      await loading;

      expect(store.getLogs(tabId)).toEqual([]);
      expect(store.canResume(tabId, data())).toBe(false);
    });
  });
});
