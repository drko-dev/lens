/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IComputedValue } from "mobx";
import { observable } from "mobx";
import type { PodLogsQuery, Pod } from "@openlens/kube-object";
import { waitUntilDefined, getOrInsertWith, interval } from "@openlens/utilities";
import type { IntervalFn } from "@openlens/utilities";
import type { TabId } from "../dock/store";
import type { CallForLogs } from "./call-for-logs.injectable";
import type { LogTabData } from "./tab-store";
import {
  mergeLogLines,
  trimLogBuffer,
  getLastLogTimestamp,
} from "./log-buffer-utils";

type PodLogLine = string;

export interface PodLogsQueryWithSinceSeconds extends PodLogsQuery {
  sinceSeconds?: number;
}

export type LogStreamStatus = "LIVE" | "PAUSED" | "RECONNECTING" | "ERROR";

const logLinesToLoad = 500;

export interface LogViewState {
  follow: boolean;
  offset: number;
}

const sessionKey = (data: LogTabData) => JSON.stringify([
  data.selectedPodId, data.namespace, data.selectedContainer,
  Boolean(data.showPrevious), data.tailLines ?? null, data.sinceSeconds ?? null,
]);

interface Dependencies {
  callForLogs: CallForLogs;
}

export class LogStore {
  protected podLogs = observable.map<TabId, PodLogLine[]>();
  protected pendingLogs = observable.map<TabId, PodLogLine[]>();
  protected pausedTabs = observable.set<TabId>();
  protected tabStatus = observable.map<TabId, LogStreamStatus>();
  protected tabErrors = observable.map<TabId, string | undefined>();
  protected truncatedCounts = observable.map<TabId, number>();
  protected refreshers = new Map<TabId, IntervalFn>();
  protected inFlightRequests = new Set<TabId>();
  protected tabRequestIds = new Map<TabId, number>();
  /** H7.6.3B: which logical session each buffer belongs to (see sessionKey). */
  protected sessionKeys = new Map<TabId, string>();
  /** H7.6.3B: follow/scroll of the view, kept across remounts (not reactive: read once on mount). */
  protected viewStates = new Map<TabId, LogViewState>();

  constructor(private dependencies: Dependencies) {}

  public getViewState(tabId: TabId): LogViewState {
    return this.viewStates.get(tabId) ?? { follow: true, offset: 0 };
  }

  public setViewState(tabId: TabId, state: Partial<LogViewState>): void {
    this.viewStates.set(tabId, { ...this.getViewState(tabId), ...state });
  }

  /**
   * Checks if the buffer of `tabId` can be reused for `targetData` without clearing it.
   * Everything that changes the CONTENT is part of the key: pod, container, namespace,
   * previous instance and the tail/since window. Display-only options are not.
   */
  public canResume(tabId: TabId, targetData: LogTabData | undefined): boolean {
    return Boolean(targetData)
      && this.podLogs.has(tabId)
      && this.sessionKeys.get(tabId) === sessionKey(targetData!);
  }

  public isPaused(tabId: TabId): boolean {
    return this.pausedTabs.has(tabId);
  }

  public pause(tabId: TabId): void {
    this.pausedTabs.add(tabId);
    this.tabStatus.set(tabId, "PAUSED");
  }

  public resume(tabId: TabId): void {
    this.pausedTabs.delete(tabId);
    const pending = this.pendingLogs.get(tabId);

    if (pending && pending.length > 0) {
      const current = this.podLogs.get(tabId) ?? [];
      const { merged } = mergeLogLines(current, pending);
      const { trimmed, droppedCount } = trimLogBuffer(merged);

      if (droppedCount > 0) {
        this.truncatedCounts.set(tabId, (this.truncatedCounts.get(tabId) ?? 0) + droppedCount);
      }

      this.podLogs.set(tabId, trimmed);
      this.pendingLogs.delete(tabId);
    }

    this.tabStatus.set(tabId, "LIVE");
  }

  public getPendingCount(tabId: TabId): number {
    return this.pendingLogs.get(tabId)?.length ?? 0;
  }

  public getStatus(tabId: TabId): LogStreamStatus {
    return this.tabStatus.get(tabId) ?? (this.isPaused(tabId) ? "PAUSED" : "LIVE");
  }

  public getError(tabId: TabId): string | undefined {
    return this.tabErrors.get(tabId);
  }

  public getTruncatedCount(tabId: TabId): number {
    return this.truncatedCounts.get(tabId) ?? 0;
  }

  public isTruncated(tabId: TabId): boolean {
    return (this.truncatedCounts.get(tabId) ?? 0) > 0;
  }

  protected handlerError(tabId: TabId, error: any): void {
    if (error.error && !(error.message || error.reason || error.code)) {
      error = error.error;
    }

    const message = `Failed to load logs: ${error.message || error.reason || error}`;

    this.tabErrors.set(tabId, message);
    this.tabStatus.set(tabId, "ERROR");

    // Only if podLogs was never populated do we display error as the only content.
    // If existing logs were already displayed, keep them intact without destroying history!
    if (!this.podLogs.has(tabId) || (this.podLogs.get(tabId)?.length ?? 0) === 0) {
      this.stopLoadingLogs(tabId);
      this.podLogs.set(tabId, [message, `Reason: ${error.reason || "Network / API error"} (${error.code || 500})`]);
    }
  }

  /**
   * Function prepares tailLines param for passing to API request
   * Each time it increasing it's number, caused to fetch more logs.
   */
  public async load(tabId: TabId, computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>): Promise<void> {
    if (this.inFlightRequests.has(tabId)) {
      return;
    }

    this.inFlightRequests.add(tabId);
    const requestId = (this.tabRequestIds.get(tabId) ?? 0) + 1;

    this.tabRequestIds.set(tabId, requestId);

    try {
      const data = logTabData.get();
      const queryParams: Partial<PodLogsQueryWithSinceSeconds> = {};

      if (data?.tailLines !== undefined) {
        if (data.tailLines > 0) {
          queryParams.tailLines = data.tailLines;
        }
      } else {
        queryParams.tailLines = this.getLogLines(tabId) + logLinesToLoad;
      }

      if (data?.sinceSeconds !== undefined && data.sinceSeconds > 0) {
        queryParams.sinceSeconds = data.sinceSeconds;
      }

      const logs = await this.loadLogs(computedPod, logTabData, queryParams);

      if (this.tabRequestIds.get(tabId) !== requestId) {
        return;
      }

      const { trimmed, droppedCount } = trimLogBuffer(logs);

      if (droppedCount > 0) {
        this.truncatedCounts.set(tabId, droppedCount);
      }

      this.getRefresher(tabId, computedPod, logTabData).start();
      this.podLogs.set(tabId, trimmed);

      const loadedData = logTabData.get();

      if (loadedData) {
        this.sessionKeys.set(tabId, sessionKey(loadedData));
      }

      this.tabErrors.delete(tabId);
      this.tabStatus.set(tabId, this.isPaused(tabId) ? "PAUSED" : "LIVE");
    } catch (error) {
      if (this.tabRequestIds.get(tabId) === requestId) {
        this.handlerError(tabId, error);
      }
    } finally {
      if (this.tabRequestIds.get(tabId) === requestId) {
        this.inFlightRequests.delete(tabId);
      }
    }
  }

  private getRefresher(tabId: TabId, computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>): IntervalFn {
    return getOrInsertWith(this.refreshers, tabId, () => (
      interval(10, () => {
        if (this.podLogs.has(tabId)) {
          this.loadMore(tabId, computedPod, logTabData);
        }
      })
    ));
  }

  /**
   * Stop loading more logs for a given tab
   * @param tabId The ID of the logs tab to stop loading more logs for
   */
  public stopLoadingLogs(tabId: TabId): void {
    this.refreshers.get(tabId)?.stop();
    this.refreshers.delete(tabId);
    this.inFlightRequests.delete(tabId);
  }

  /**
   * Function is used to refresher/stream-like requests.
   * It changes 'sinceTime' param each time allowing to fetch logs
   * starting from last line received without dropping lines in the same second.
   */
  public async loadMore(tabId: TabId, computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>): Promise<void> {
    if (this.inFlightRequests.has(tabId)) {
      return;
    }

    const oldLogs = this.podLogs.get(tabId);

    if (!oldLogs?.length) {
      return;
    }

    this.inFlightRequests.add(tabId);
    const requestId = this.tabRequestIds.get(tabId);

    try {
      const logs = await this.loadLogs(computedPod, logTabData, {
        sinceTime: this.getLastSinceTime(tabId),
      });

      if (this.tabRequestIds.get(tabId) !== requestId) {
        return;
      }

      // Clear transient error if connection recovered
      if (this.tabErrors.has(tabId)) {
        this.tabErrors.delete(tabId);
        this.tabStatus.set(tabId, this.isPaused(tabId) ? "PAUSED" : "LIVE");
      }

      if (this.isPaused(tabId)) {
        // In paused mode, accumulate received lines in pendingLogs buffer without freezing the visible view
        const currentPending = this.pendingLogs.get(tabId) ?? [];
        const base = currentPending.length > 0 ? currentPending : oldLogs;
        const { merged } = mergeLogLines(base, logs);
        const onlyPending = currentPending.length > 0 ? merged : merged.slice(oldLogs.length);
        const { trimmed, droppedCount } = trimLogBuffer(onlyPending);

        if (droppedCount > 0) {
          this.truncatedCounts.set(tabId, (this.truncatedCounts.get(tabId) ?? 0) + droppedCount);
        }

        this.pendingLogs.set(tabId, trimmed);
      } else {
        const { merged } = mergeLogLines(oldLogs, logs);
        const { trimmed, droppedCount } = trimLogBuffer(merged);

        if (droppedCount > 0) {
          this.truncatedCounts.set(tabId, (this.truncatedCounts.get(tabId) ?? 0) + droppedCount);
        }

        this.podLogs.set(tabId, trimmed);
      }
    } catch (error) {
      if (this.tabRequestIds.get(tabId) === requestId) {
        this.handlerError(tabId, error);
      }
    } finally {
      if (this.tabRequestIds.get(tabId) === requestId) {
        this.inFlightRequests.delete(tabId);
      }
    }
  }

  /**
   * Main logs loading function adds necessary data to payload and makes
   * an API request
   */
  private async loadLogs(computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>, params: Partial<PodLogsQueryWithSinceSeconds>): Promise<string[]> {
    const {
      pod,
      tabData: {
        selectedContainer,
        showPrevious,
      },
    } = await waitUntilDefined(() => {
      const pod = computedPod.get();
      const tabData = logTabData.get();

      if (pod && tabData) {
        return { pod, tabData };
      }

      return undefined;
    });
    const namespace = pod.getNs();
    const name = pod.getName();

    const result = await this.dependencies.callForLogs({ namespace, name }, {
      ...params,
      timestamps: true,  // Always setting timestamp to separate old logs from new ones
      container: selectedContainer,
      previous: showPrevious,
    });

    return result.trimEnd().replace(/\r/g, "\n").split("\n");
  }

  /**
   * @deprecated This depends on dockStore, which should be removed
   * Converts logs into a string array
   * @returns Length of log lines
   */
  get lines(): number {
    return this.logs.length;
  }

  getLogLines(tabId: TabId): number {
    return this.getLogs(tabId).length;
  }

  areLogsPresent(tabId: TabId): boolean {
    return !this.podLogs.has(tabId);
  }

  getLogs(tabId: TabId): string[] {
    return this.podLogs.get(tabId) ?? [];
  }

  getLogsWithoutTimestamps(tabId: TabId): string[] {
    return this.getLogs(tabId).map(this.removeTimestamps);
  }

  getTimestampSplitLogs(tabId: TabId): [string, string][] {
    return this.getLogs(tabId).map(this.splitOutTimestamp);
  }

  /**
   * @deprecated This now only returns the empty array
   * Returns logs with timestamps for selected tab
   */
  get logs(): string[] {
    return [];
  }

  /**
   * @deprecated This now only returns the empty array
   * Removes timestamps from each log line and returns changed logs
   * @returns Logs without timestamps
   */
  get logsWithoutTimestamps(): string[] {
    return this.logs.map(item => this.removeTimestamps(item));
  }

  /**
   * Returns the ISO-8601 timestamp of the last received log line without
   * artificially incrementing by +1 second. Overlap is handled cleanly by mergeLogLines.
   */
  getLastSinceTime(tabId: TabId): string {
    const logs = this.podLogs.get(tabId) ?? [];
    const pending = this.pendingLogs.get(tabId) ?? [];
    const target = pending.length > 0 ? pending : logs;

    return getLastLogTimestamp(target);
  }

  splitOutTimestamp(logs: string): [string, string] {
    const extraction = /^(\d+\S+)(.*)/m.exec(logs);

    if (!extraction || extraction.length < 3) {
      return ["", logs];
    }

    return [extraction[1], extraction[2]];
  }

  getTimestamps(logs: string) {
    return logs.match(/^\d+\S+/gm);
  }

  removeTimestamps(logs: string): string {
    return logs.replace(/^\d+.*?\s/gm, "");
  }

  clearLogs(tabId: TabId): void {
    this.tabRequestIds.set(tabId, (this.tabRequestIds.get(tabId) ?? 0) + 1);
    this.stopLoadingLogs(tabId);
    this.podLogs.delete(tabId);
    this.pendingLogs.delete(tabId);
    this.pausedTabs.delete(tabId);
    this.tabStatus.delete(tabId);
    this.tabErrors.delete(tabId);
    this.truncatedCounts.delete(tabId);
    this.inFlightRequests.delete(tabId);
    this.sessionKeys.delete(tabId);
    this.viewStates.delete(tabId);
  }

  /**
   * Resumes polling without clearing the existing buffer (H7.6.3B).
   * Used when a panel remounts (after drag, tab change or restore) for the same session.
   */
  async resumeLoading(tabId: TabId, computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>): Promise<void> {
    const data = logTabData.get();

    if (!this.canResume(tabId, data)) {
      return this.reload(tabId, computedPod, logTabData);
    }

    this.getRefresher(tabId, computedPod, logTabData).start();
    await this.loadMore(tabId, computedPod, logTabData);
  }

  reload(tabId: TabId, computedPod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>): Promise<void> {
    this.clearLogs(tabId);

    return this.load(tabId, computedPod, logTabData);
  }
}
