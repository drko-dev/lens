/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { action, computed, makeObservable, observable, reaction } from "mobx";
import type { Deployment, Pod } from "@openlens/kube-object";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { PodStore } from "../workloads-pods/store";
import type { KubetailStreamClient, ActiveStreamHandle } from "./kubetail-stream-client.injectable";
import type { KubetailLogEntry, PodStreamInfo } from "./kubetail-types";
import {
  getPodColor,
  parseKubeLogLine,
  getLineOverlapSignature,
  mergeLogsChronologically,
  resetLogSequence,
} from "./kubetail-types";
import { stripAnsiCodes } from "../dock/logs/log-buffer-utils";

export interface KubetailStoreDependencies {
  deploymentStore: DeploymentStore;
  podStore: PodStore;
  streamClient: KubetailStreamClient;
}

export class KubetailStore {
  @observable selectedNamespace = "";
  @observable selectedDeploymentName = "";
  @observable activePodNames = observable.set<string>();
  @observable activeContainerNames = observable.set<string>();
  @observable activeStreams = observable.map<string, PodStreamInfo>();
  @observable logs = observable.array<KubetailLogEntry>([], { deep: false });
  @observable isPaused = false;
  @observable pendingLogs = observable.array<KubetailLogEntry>([], { deep: false });
  @observable autoScroll = true;
  @observable searchQuery = "";
  @observable maxLines = 5000;
  @observable maxPendingLogs = 2000;
  @observable isTruncated = false;
  @observable maxConcurrentStreams = 50;

  private streamHandles = new Map<string, ActiveStreamHandle>();
  private retryTimers = new Map<string, any>();
  private retryCounts = new Map<string, number>();
  private lastSeenTimestamps = new Map<string, string>();
  private overlapBuffers = new Map<string, string[]>();
  private isReconnecting = new Map<string, boolean>();
  private seenKeys = new Set<string>();

  private batchQueue: KubetailLogEntry[] = [];
  private flushTimer: any = null;
  private disposers: (() => void)[] = [];

  constructor(private dependencies: KubetailStoreDependencies) {
    makeObservable(this);

    // React to replica changes or deployment pod updates
    this.disposers.push(
      reaction(
        () => this.currentDeploymentPods,
        (pods) => {
          if (this.selectedDeploymentName) {
            this.syncStreamsWithPods(pods);
          }
        },
      ),
    );

    // Periodic batch flush for smooth virtualized rendering without thread thrashing
    this.flushTimer = setInterval(() => {
      this.flushBatch();
    }, 50);
  }

  @computed
  get availableDeployments(): Deployment[] {
    const { deploymentStore } = this.dependencies;

    if (!this.selectedNamespace) {
      return deploymentStore.items;
    }

    return deploymentStore.items.filter(d => d.getNs() === this.selectedNamespace);
  }

  @computed
  get currentDeployment(): Deployment | undefined {
    return this.availableDeployments.find(d => d.getName() === this.selectedDeploymentName);
  }

  @computed
  get currentDeploymentPods(): Pod[] {
    const deployment = this.currentDeployment;

    if (!deployment) {
      return [];
    }

    return this.dependencies.deploymentStore.getChildPods(deployment);
  }

  @computed
  get availableContainers(): string[] {
    const pods = this.currentDeploymentPods;
    const containers = new Set<string>();

    for (const pod of pods) {
      for (const c of pod.getContainers()) {
        containers.add(c.name);
      }
    }

    return Array.from(containers).sort();
  }

  @computed
  get displayLogs(): KubetailLogEntry[] {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      return this.logs;
    }

    let regex: RegExp | null = null;

    try {
      regex = new RegExp(query, "i");
    } catch {
      // Fallback to substring matching if regex is invalid
    }

    return this.logs.filter((entry) => {
      const cleanMessage = stripAnsiCodes(entry.message);

      if (regex) {
        return regex.test(cleanMessage) || regex.test(entry.podName);
      }

      return cleanMessage.toLowerCase().includes(query) || entry.podName.toLowerCase().includes(query);
    });
  }

  @action
  setNamespace(namespace: string): void {
    if (this.selectedNamespace === namespace) return;
    this.selectedNamespace = namespace;
    this.selectedDeploymentName = "";
    this.stopAllStreams();
    this.clearLogs();
  }

  @action
  setDeployment(deploymentName: string): void {
    if (this.selectedDeploymentName === deploymentName) return;
    this.selectedDeploymentName = deploymentName;
    this.stopAllStreams();
    this.clearLogs();

    if (!deploymentName) return;

    // Auto-select all pods and containers for the newly selected deployment
    const pods = this.currentDeploymentPods;

    this.activePodNames.clear();

    for (const pod of pods) {
      this.activePodNames.add(pod.getName());
    }

    this.activeContainerNames.clear();

    for (const c of this.availableContainers) {
      this.activeContainerNames.add(c);
    }

    this.syncStreamsWithPods(pods);
  }

  @action
  togglePod(podName: string): void {
    if (this.activePodNames.has(podName)) {
      this.activePodNames.delete(podName);
    } else {
      this.activePodNames.add(podName);
    }

    this.syncStreamsWithPods(this.currentDeploymentPods);
  }

  @action
  selectAllPods(): void {
    for (const pod of this.currentDeploymentPods) {
      this.activePodNames.add(pod.getName());
    }

    this.syncStreamsWithPods(this.currentDeploymentPods);
  }

  @action
  deselectAllPods(): void {
    this.activePodNames.clear();
    this.syncStreamsWithPods(this.currentDeploymentPods);
  }

  @action
  toggleContainer(containerName: string): void {
    if (this.activeContainerNames.has(containerName)) {
      this.activeContainerNames.delete(containerName);
    } else {
      this.activeContainerNames.add(containerName);
    }

    this.syncStreamsWithPods(this.currentDeploymentPods);
  }

  @action
  pause(): void {
    this.isPaused = true;
  }

  @action
  resume(): void {
    this.isPaused = false;

    if (this.pendingLogs.length > 0) {
      const pending = this.pendingLogs.slice();

      this.pendingLogs.clear();
      mergeLogsChronologically(this.logs, pending, this.maxLines);
    }
  }

  @action
  clearLogs(): void {
    this.logs.clear();
    this.pendingLogs.clear();
    this.seenKeys.clear();
    this.batchQueue = [];
    this.isTruncated = false;
    resetLogSequence();
  }

  @action
  toggleAutoScroll(): void {
    this.autoScroll = !this.autoScroll;
  }

  @action
  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  getStreamKey(podName: string, containerName: string): string {
    return `${podName}/${containerName}`;
  }

  private syncStreamsWithPods(pods: Pod[]): void {
    // If deployment is selected and user hasn't explicitly deselected all pods,
    // auto-register newly scaled replica pods into activePodNames
    if (this.selectedDeploymentName && this.activePodNames.size > 0) {
      for (const pod of pods) {
        this.activePodNames.add(pod.getName());
      }
    }

    const desiredStreamKeys = new Set<string>();
    let streamCount = 0;

    for (const pod of pods) {
      const podName = pod.getName();

      if (!this.activePodNames.has(podName)) {
        continue;
      }

      const containers = pod.getContainers();

      for (const container of containers) {
        if (this.activeContainerNames.size > 0 && !this.activeContainerNames.has(container.name)) {
          continue;
        }

        if (streamCount >= this.maxConcurrentStreams) {
          break;
        }

        const streamKey = this.getStreamKey(podName, container.name);

        desiredStreamKeys.add(streamKey);
        streamCount++;

        if (!this.streamHandles.has(streamKey)) {
          this.startPodStream(pod.getNs(), podName, container.name);
        }
      }
    }

    // Stop streams for pods or containers that are no longer part of active desired set
    for (const [streamKey, handle] of this.streamHandles.entries()) {
      if (!desiredStreamKeys.has(streamKey)) {
        this.clearStreamRetryTimer(streamKey);
        handle.abort();
        this.streamHandles.delete(streamKey);
        this.activeStreams.delete(streamKey);
        this.overlapBuffers.delete(streamKey);
        this.lastSeenTimestamps.delete(streamKey);
        this.retryCounts.delete(streamKey);
      }
    }
  }

  @action
  private startPodStream(namespace: string, podName: string, containerName: string, sinceTime?: string): void {
    const streamKey = this.getStreamKey(podName, containerName);
    const color = getPodColor(podName);

    // Cancel existing handle or pending retry timer if any
    this.clearStreamRetryTimer(streamKey);
    const existingHandle = this.streamHandles.get(streamKey);

    if (existingHandle) {
      existingHandle.abort();
      this.streamHandles.delete(streamKey);
    }

    const currentStream = this.activeStreams.get(streamKey);
    const previousLineCount = currentStream ? currentStream.lineCount : 0;
    const retryCount = this.retryCounts.get(streamKey) || 0;

    this.activeStreams.set(streamKey, {
      podName,
      containerName,
      namespace,
      status: sinceTime ? "RECONNECTING" : "CONNECTING",
      color,
      lineCount: previousLineCount,
      lastSeenTimestamp: sinceTime || this.lastSeenTimestamps.get(streamKey),
      retryCount,
    });

    const isReconnectingSession = Boolean(sinceTime);

    this.isReconnecting.set(streamKey, isReconnectingSession);

    const handle = this.dependencies.streamClient.startStream(
      {
        namespace,
        podName,
        containerName,
        sinceTime,
        tailLines: sinceTime ? undefined : 150,
      },
      {
        onLine: (rawLine) => {
          this.ingestRawLine(rawLine, podName, containerName, namespace);
        },
        onError: (err, statusCode) => {
          this.handleStreamError(streamKey, namespace, podName, containerName, err, statusCode);
        },
        onEnd: () => {
          this.handleStreamEnd(streamKey, namespace, podName, containerName);
        },
      },
    );

    this.streamHandles.set(streamKey, handle);

    action(() => {
      const stream = this.activeStreams.get(streamKey);

      if (stream && stream.status !== "ERROR") {
        stream.status = "STREAMING";
      }
    })();
  }

  private ingestRawLine(rawLine: string, podName: string, containerName: string, namespace: string): void {
    const entry = parseKubeLogLine(rawLine, podName, containerName, namespace);
    const streamKey = this.getStreamKey(podName, containerName);

    // Global deterministic deduplication
    if (this.seenKeys.has(entry.id)) {
      return;
    }

    this.seenKeys.add(entry.id);

    // Bounded seenKeys to prevent unbounded memory growth
    if (this.seenKeys.size > 20000) {
      const iter = this.seenKeys.values();

      for (let i = 0; i < 5000; i++) {
        const next = iter.next();

        if (next.done) break;
        this.seenKeys.delete(next.value);
      }
    }

    // Check reconnection overlap buffer to prevent re-displaying lines during resume overlap
    const isReconn = this.isReconnecting.get(streamKey);
    const lineSig = getLineOverlapSignature(entry.timestampRaw, entry.message);

    let overlapBuf = this.overlapBuffers.get(streamKey);

    if (!overlapBuf) {
      overlapBuf = [];
      this.overlapBuffers.set(streamKey, overlapBuf);
    }

    if (isReconn) {
      if (overlapBuf.includes(lineSig)) {
        // Line was already ingested in previous session, drop duplicate overlap line
        return;
      }
      // First new line after overlap window clears reconnection flag
      this.isReconnecting.set(streamKey, false);
    }

    // Maintain bounded ring buffer of recent line signatures for this stream (up to 100 entries)
    overlapBuf.push(lineSig);
    if (overlapBuf.length > 100) {
      overlapBuf.shift();
    }

    if (entry.timestampRaw) {
      this.lastSeenTimestamps.set(streamKey, entry.timestampRaw);
      const currentStream = this.activeStreams.get(streamKey);

      if (currentStream) {
        currentStream.lastSeenTimestamp = entry.timestampRaw;
      }
    }

    // Update stream line count and status
    const stream = this.activeStreams.get(streamKey);

    if (stream) {
      stream.lineCount++;
      if (stream.status !== "STREAMING") {
        stream.status = "STREAMING";
        stream.error = undefined;
      }
      // Reset retry count on active reception of logs
      this.retryCounts.set(streamKey, 0);
    }

    if (this.isPaused) {
      this.pendingLogs.push(entry);

      if (this.pendingLogs.length > this.maxPendingLogs) {
        const excess = this.pendingLogs.length - this.maxPendingLogs;

        this.pendingLogs.splice(0, excess);
        this.isTruncated = true;
      }
    } else {
      this.batchQueue.push(entry);
    }
  }

  private handleStreamError(
    streamKey: string,
    namespace: string,
    podName: string,
    containerName: string,
    error: Error,
    statusCode?: number,
  ): void {
    action(() => {
      const stream = this.activeStreams.get(streamKey);

      if (stream) {
        stream.status = "ERROR";
        stream.error = error.message;
      }
    })();

    // HTTP 403 Forbidden: Insufficient RBAC privileges. Stop retrying to avoid spamming the API server.
    if (statusCode === 403 || error.message.includes("403")) {
      action(() => {
        const stream = this.activeStreams.get(streamKey);

        if (stream) {
          stream.status = "ERROR";
          stream.error = "HTTP 403 Forbidden: Insufficient RBAC permissions to read pod logs.";
        }
      })();

      return;
    }

    // HTTP 404: Pod or container terminated/not found.
    const retryCount = (this.retryCounts.get(streamKey) || 0) + 1;

    this.retryCounts.set(streamKey, retryCount);

    if (statusCode === 404 || error.message.includes("404")) {
      if (retryCount > 3) {
        action(() => {
          const stream = this.activeStreams.get(streamKey);

          if (stream) {
            stream.status = "TERMINATED";
            stream.error = "Pod or container terminated (404).";
          }
        })();

        return;
      }
    }

    this.scheduleStreamReconnect(streamKey, namespace, podName, containerName);
  }

  private handleStreamEnd(
    streamKey: string,
    namespace: string,
    podName: string,
    containerName: string,
  ): void {
    // If stream ended unexpectedly while the pod is still desired, auto-reconnect from last seen timestamp
    if (this.activePodNames.has(podName)) {
      this.scheduleStreamReconnect(streamKey, namespace, podName, containerName);
    } else {
      action(() => {
        const stream = this.activeStreams.get(streamKey);

        if (stream) {
          stream.status = "TERMINATED";
        }
      })();
    }
  }

  private scheduleStreamReconnect(
    streamKey: string,
    namespace: string,
    podName: string,
    containerName: string,
  ): void {
    this.clearStreamRetryTimer(streamKey);

    const retryCount = this.retryCounts.get(streamKey) || 0;
    this.retryCounts.set(streamKey, retryCount + 1);

    // Exponential backoff with jitter: min 1000ms, max 30000ms
    const baseBackoff = Math.min(30000, 1000 * Math.pow(1.5, Math.min(retryCount, 8)));
    const jitter = Math.random() * 500;
    const delay = Math.round(baseBackoff + jitter);

    action(() => {
      const stream = this.activeStreams.get(streamKey);

      if (stream && stream.status !== "ERROR") {
        stream.status = "RECONNECTING";
      }
    })();

    const timer = setTimeout(() => {
      if (this.activePodNames.has(podName) && this.selectedDeploymentName) {
        const lastSeen = this.lastSeenTimestamps.get(streamKey);

        this.startPodStream(namespace, podName, containerName, lastSeen);
      }
    }, delay);

    this.retryTimers.set(streamKey, timer);
  }

  private clearStreamRetryTimer(streamKey: string): void {
    const timer = this.retryTimers.get(streamKey);

    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(streamKey);
    }
  }

  @action
  private flushBatch(): void {
    if (this.batchQueue.length === 0 || this.isPaused) {
      return;
    }

    const newEntries = this.batchQueue;

    this.batchQueue = [];

    mergeLogsChronologically(this.logs, newEntries, this.maxLines);
  }

  private stopAllStreams(): void {
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();

    for (const handle of this.streamHandles.values()) {
      handle.abort();
    }
    this.streamHandles.clear();

    this.activeStreams.clear();
    this.retryCounts.clear();
    this.lastSeenTimestamps.clear();
    this.overlapBuffers.clear();
    this.isReconnecting.clear();
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.stopAllStreams();

    for (const dispose of this.disposers) {
      dispose();
    }

    this.disposers = [];
    this.clearLogs();
  }
}
