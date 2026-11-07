/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { action, computed, makeObservable, observable, reaction } from "mobx";
import type { Deployment, Pod, StatefulSet, DaemonSet } from "@openlens/kube-object";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { StatefulSetStore } from "../workloads-statefulsets/store";
import type { DaemonSetStore } from "../workloads-daemonsets/store";
import type { PodStore } from "../workloads-pods/store";
import type { KubetailStreamClient, ActiveStreamHandle } from "./kubetail-stream-client.injectable";
import type {
  KubetailLogEntry,
  PodStreamInfo,
  ResourceSelection,
  WorkloadKind,
  WorkloadOption,
} from "./kubetail-types";
import {
  getPodColor,
  parseKubeLogLine,
  getLineOverlapSignature,
  mergeLogsChronologically,
  resetLogSequence,
  formatLogsAsText,
  formatLogsAsJsonl,
  triggerFileDownload,
  KubetailPreferences,
  NotFoundResource,
} from "./kubetail-types";
import { stripAnsiCodes } from "../dock/logs/log-buffer-utils";
import type { ClusterContext } from "../../cluster-frame-context/cluster-frame-context";
import type { Cluster } from "../../../common/cluster/cluster";
import type { CreateStorage } from "../../utils/create-storage/create-storage.injectable";
import type { StorageLayer } from "../../utils/storage-helper";

export interface KubetailStoreDependencies {
  deploymentStore: DeploymentStore;
  statefulSetStore?: StatefulSetStore;
  daemonSetStore?: DaemonSetStore;
  podStore: PodStore;
  streamClient: KubetailStreamClient;
  clusterContext?: ClusterContext;
  hostedCluster?: Cluster;
  hostedClusterId?: string;
  createStorage?: CreateStorage;
}

export class KubetailStore {
  @observable selectedNamespace = "";
  @observable selectedKind: WorkloadKind | "ALL" = "ALL";
  @observable selectedResource: ResourceSelection | undefined = undefined;
  @observable notFoundResource: NotFoundResource | null = null;
  @observable clusterName = "default";
  @observable clusterId = "";

  @observable activePodNames = observable.set<string>();
  @observable activeContainerNames = observable.set<string>();
  @observable activeStreams = observable.map<string, PodStreamInfo>();
  @observable logs = observable.array<KubetailLogEntry>([], { deep: false });
  @observable isPaused = false;
  @observable pendingLogs = observable.array<KubetailLogEntry>([], { deep: false });
  @observable autoScroll = true;
  @observable autoFollowNewReplicas = true;

  // Visual filters (do not re-trigger network streaming)
  @observable searchQuery = "";
  @observable selectedFilterPod = "";
  @observable selectedFilterContainer = "";

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
  private knownPodNames = new Set<string>();
  private userDeselectedAllContainers = false;
  private preferencesStorage?: StorageLayer<KubetailPreferences>;

  private batchQueue: KubetailLogEntry[] = [];
  private flushTimer: any = null;
  private disposers: (() => void)[] = [];

  constructor(private dependencies: KubetailStoreDependencies) {
    makeObservable(this);

    if (dependencies.hostedCluster) {
      this.clusterName = dependencies.hostedCluster.name.get() || "default";
      this.clusterId = dependencies.hostedCluster.id || dependencies.hostedClusterId || "";
    } else if (dependencies.hostedClusterId) {
      this.clusterId = dependencies.hostedClusterId;
    }

    if (dependencies.createStorage) {
      this.preferencesStorage = dependencies.createStorage<KubetailPreferences>("kubetail:preferences", {
        autoScroll: true,
        autoFollowNewReplicas: true,
        maxLines: 5000,
      });

      const saved = this.preferencesStorage.get();

      if (saved) {
        if (typeof saved.autoScroll === "boolean") this.autoScroll = saved.autoScroll;
        if (typeof saved.autoFollowNewReplicas === "boolean") this.autoFollowNewReplicas = saved.autoFollowNewReplicas;
        if (typeof saved.maxLines === "number") this.maxLines = saved.maxLines;
      }
    }

    // React to replica changes or workload pod updates
    this.disposers.push(
      reaction(
        () => this.currentResourcePods,
        (pods) => {
          if (this.selectedResource) {
            this.syncStreamsWithPods(pods);
          }
        },
      ),
    );

    // Verify workload existence once underlying stores are populated
    this.disposers.push(
      reaction(
        () => ({
          resource: this.selectedResource,
          deployments: this.dependencies.deploymentStore?.items,
          statefulSets: this.dependencies.statefulSetStore?.items,
          daemonSets: this.dependencies.daemonSetStore?.items,
          pods: this.dependencies.podStore?.items,
        }),
        ({ resource }) => {
          if (!resource) return;

          const { deploymentStore, statefulSetStore, daemonSetStore, podStore } = this.dependencies;
          let storeLoaded = false;
          let exists = false;

          switch (resource.kind) {
            case "Deployment":
              storeLoaded = Boolean(deploymentStore?.isLoaded !== false && (deploymentStore?.items?.length ?? 0) > 0);
              exists = Boolean(deploymentStore?.items.some(d => d.getName() === resource.name && (!resource.namespace || d.getNs() === resource.namespace)));
              break;
            case "StatefulSet":
              storeLoaded = Boolean(statefulSetStore?.isLoaded !== false && ((statefulSetStore?.items?.length ?? 0) > 0 || statefulSetStore?.isLoaded === true));
              exists = Boolean(statefulSetStore?.items.some(s => s.getName() === resource.name && (!resource.namespace || s.getNs() === resource.namespace)));
              break;
            case "DaemonSet":
              storeLoaded = Boolean(daemonSetStore?.isLoaded !== false && ((daemonSetStore?.items?.length ?? 0) > 0 || daemonSetStore?.isLoaded === true));
              exists = Boolean(daemonSetStore?.items.some(d => d.getName() === resource.name && (!resource.namespace || d.getNs() === resource.namespace)));
              break;
            case "Pod":
              storeLoaded = Boolean(podStore?.isLoaded !== false && (podStore?.items?.length ?? 0) > 0);
              exists = Boolean(podStore?.items.some(p => p.getName() === resource.name && (!resource.namespace || p.getNs() === resource.namespace)));
              break;
          }

          if (storeLoaded && !exists) {
            this.setResource(undefined);
            this.notFoundResource = { ...resource };
          }
        },
      ),
    );

    // Periodic batch flush for smooth virtualized rendering
    this.flushTimer = setInterval(() => {
      this.flushBatch();
    }, 50);
  }

  // Backward compatibility getters
  get selectedDeploymentName(): string {
    return this.selectedResource?.kind === "Deployment" ? this.selectedResource.name : "";
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
  get availableStatefulSets(): StatefulSet[] {
    const { statefulSetStore } = this.dependencies;

    if (!statefulSetStore) return [];
    if (!this.selectedNamespace) {
      return statefulSetStore.items;
    }

    return statefulSetStore.items.filter(s => s.getNs() === this.selectedNamespace);
  }

  @computed
  get availableDaemonSets(): DaemonSet[] {
    const { daemonSetStore } = this.dependencies;

    if (!daemonSetStore) return [];
    if (!this.selectedNamespace) {
      return daemonSetStore.items;
    }

    return daemonSetStore.items.filter(d => d.getNs() === this.selectedNamespace);
  }

  @computed
  get availableStandalonePods(): Pod[] {
    const { podStore } = this.dependencies;
    const items = this.selectedNamespace
      ? podStore.items.filter(p => p.getNs() === this.selectedNamespace)
      : podStore.items;

    return items.filter(p => {
      const ownerRefs = typeof p.getOwnerRefs === "function" ? p.getOwnerRefs() : [];

      return !ownerRefs || ownerRefs.length === 0;
    });
  }

  /**
   * Unified list of selectable workloads (Deployments, StatefulSets, DaemonSets, Pods)
   */
  @computed
  get availableWorkloads(): WorkloadOption[] {
    const options: WorkloadOption[] = [];
    const kind = this.selectedKind;

    if (kind === "ALL" || kind === "Deployment") {
      for (const d of this.availableDeployments) {
        const replicas = typeof d.getReplicas === "function" ? d.getReplicas() : 1;

        options.push({
          kind: "Deployment",
          namespace: d.getNs(),
          name: d.getName(),
          label: `Deployment / ${d.getName()} (${replicas} replicas)`,
          replicas,
        });
      }
    }

    if (kind === "ALL" || kind === "StatefulSet") {
      for (const s of this.availableStatefulSets) {
        const replicas = typeof s.getReplicas === "function" ? s.getReplicas() : 1;

        options.push({
          kind: "StatefulSet",
          namespace: s.getNs(),
          name: s.getName(),
          label: `StatefulSet / ${s.getName()} (${replicas} replicas)`,
          replicas,
        });
      }
    }

    if (kind === "ALL" || kind === "DaemonSet") {
      for (const d of this.availableDaemonSets) {
        const replicas = d.status?.currentNumberScheduled ?? 1;

        options.push({
          kind: "DaemonSet",
          namespace: d.getNs(),
          name: d.getName(),
          label: `DaemonSet / ${d.getName()} (${replicas} nodes)`,
          replicas,
        });
      }
    }

    if (kind === "ALL" || kind === "Pod") {
      for (const p of this.availableStandalonePods) {
        options.push({
          kind: "Pod",
          namespace: p.getNs(),
          name: p.getName(),
          label: `Pod / ${p.getName()}`,
          replicas: 1,
        });
      }
    }

    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Resolves the child pods for the currently selected resource
   */
  @computed
  get currentResourcePods(): Pod[] {
    const res = this.selectedResource;

    if (!res || !res.name) {
      return [];
    }

    const { deploymentStore, statefulSetStore, daemonSetStore, podStore } = this.dependencies;

    switch (res.kind) {
      case "Deployment": {
        const dep = deploymentStore.items.find(d => d.getName() === res.name && (!res.namespace || d.getNs() === res.namespace));

        if (!dep) return [];

        const childPods = deploymentStore.getChildPods(dep);

        if (childPods.length > 0) return childPods;

        // Fallback for clusters/mocks where ReplicaSets are not present or not synced
        return podStore.items.filter(p => (!res.namespace || p.getNs() === res.namespace) && p.getName().startsWith(dep.getName()));
      }
      case "StatefulSet": {
        if (!statefulSetStore) return [];
        const ss = statefulSetStore.items.find(s => s.getName() === res.name && (!res.namespace || s.getNs() === res.namespace));

        return ss ? statefulSetStore.getChildPods(ss) : [];
      }
      case "DaemonSet": {
        if (!daemonSetStore) return [];
        const ds = daemonSetStore.items.find(d => d.getName() === res.name && (!res.namespace || d.getNs() === res.namespace));

        return ds ? daemonSetStore.getChildPods(ds) : [];
      }
      case "Pod": {
        const pod = podStore.items.find(p => p.getName() === res.name && (!res.namespace || p.getNs() === res.namespace));

        return pod ? [pod] : [];
      }
      default:
        return [];
    }
  }

  // Alias for backward compatibility
  @computed
  get currentDeploymentPods(): Pod[] {
    return this.currentResourcePods;
  }

  @computed
  get availableContainers(): string[] {
    const pods = this.currentResourcePods;
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
    let result = this.logs as KubetailLogEntry[];

    // 1. Visual filter by Pod
    if (this.selectedFilterPod) {
      result = result.filter(entry => entry.podName === this.selectedFilterPod);
    }

    // 2. Visual filter by Container
    if (this.selectedFilterContainer) {
      result = result.filter(entry => entry.containerName === this.selectedFilterContainer);
    }

    // 3. Visual filter by Search Query (Text or Safe Regex)
    const query = this.searchQuery.trim();

    if (!query) {
      return result;
    }

    let regex: RegExp | null = null;

    if (query.length < 250) {
      try {
        if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
          regex = new RegExp(query.slice(1, -1), "i");
        } else {
          regex = new RegExp(query, "i");
        }
      } catch {
        // Fall back to plain substring matching on invalid regex
      }
    }

    const lowerQuery = query.toLowerCase();

    return result.filter((entry) => {
      const cleanMessage = stripAnsiCodes(entry.message);

      if (regex) {
        return regex.test(cleanMessage) || regex.test(entry.podName);
      }

      return cleanMessage.toLowerCase().includes(lowerQuery) || entry.podName.toLowerCase().includes(lowerQuery);
    });
  }

  private savePreferences(): void {
    if (this.preferencesStorage) {
      this.preferencesStorage.set({
        autoScroll: this.autoScroll,
        autoFollowNewReplicas: this.autoFollowNewReplicas,
        maxLines: this.maxLines,
      });
    }
  }

  @action
  syncWithClusterContext(): void {
    const { clusterContext } = this.dependencies;

    if (!clusterContext) return;

    const contextNamespaces = clusterContext.contextNamespaces;

    if (!this.selectedNamespace) {
      if (contextNamespaces && contextNamespaces.length === 1) {
        this.selectedNamespace = contextNamespaces[0];
      }
    }
  }

  @action
  selectWorkloadFromNavigation(selection: { kind: WorkloadKind; name: string; namespace: string; uid?: string }): boolean {
    const { kind, name, namespace, uid } = selection;

    this.selectedNamespace = namespace;
    this.selectedKind = kind;

    const { deploymentStore, statefulSetStore, daemonSetStore, podStore } = this.dependencies;
    let found = false;
    let actualUid = uid;

    switch (kind) {
      case "Deployment": {
        const dep = deploymentStore.items.find(d => d.getName() === name && (!namespace || d.getNs() === namespace));

        if (dep) {
          found = true;
          actualUid = dep.metadata?.uid || uid;
        }
        break;
      }
      case "StatefulSet": {
        const sts = statefulSetStore?.items.find(s => s.getName() === name && (!namespace || s.getNs() === namespace));

        if (sts) {
          found = true;
          actualUid = sts.metadata?.uid || uid;
        }
        break;
      }
      case "DaemonSet": {
        const ds = daemonSetStore?.items.find(d => d.getName() === name && (!namespace || d.getNs() === namespace));

        if (ds) {
          found = true;
          actualUid = ds.metadata?.uid || uid;
        }
        break;
      }
      case "Pod": {
        const pod = podStore.items.find(p => p.getName() === name && (!namespace || p.getNs() === namespace));

        if (pod) {
          found = true;
          actualUid = pod.metadata?.uid || uid;
        }
        break;
      }
    }

    if (!found) {
      const isStoreLoading = Boolean(
        (kind === "Deployment" && deploymentStore?.isLoaded === false)
        || (kind === "StatefulSet" && statefulSetStore?.isLoaded === false)
        || (kind === "DaemonSet" && daemonSetStore?.isLoaded === false)
        || (kind === "Pod" && podStore?.isLoaded === false),
      );

      if (isStoreLoading) {
        this.notFoundResource = null;
        this.setResource({ kind, name, namespace, uid });

        return true;
      }

      this.setResource(undefined);
      this.notFoundResource = { kind, name, namespace };

      return false;
    }

    this.notFoundResource = null;
    this.setResource({ kind, name, namespace, uid: actualUid });

    return true;
  }

  @action
  setNamespace(namespace: string): void {
    if (this.selectedNamespace === namespace) return;
    this.selectedNamespace = namespace;
    this.selectedResource = undefined;
    this.notFoundResource = null;
    this.stopAllStreams();
    this.clearLogs();
  }

  @action
  setKind(kind: WorkloadKind | "ALL"): void {
    if (this.selectedKind === kind) return;
    this.selectedKind = kind;
  }

  @action
  setResource(selection: ResourceSelection | undefined): void {
    if (
      this.selectedResource?.kind === selection?.kind &&
      this.selectedResource?.name === selection?.name &&
      this.selectedResource?.namespace === selection?.namespace
    ) {
      return;
    }

    this.selectedResource = selection;
    if (selection) {
      this.notFoundResource = null;
    }
    this.userDeselectedAllContainers = false;
    this.stopAllStreams();
    this.clearLogs();
    this.knownPodNames.clear();

    if (!selection) return;

    // Auto-select all pods and containers for the newly selected workload
    const pods = this.currentResourcePods;

    this.activePodNames.clear();

    for (const pod of pods) {
      this.knownPodNames.add(pod.getName());
      this.activePodNames.add(pod.getName());
    }

    this.activeContainerNames.clear();

    for (const c of this.availableContainers) {
      this.activeContainerNames.add(c);
    }

    this.syncStreamsWithPods(pods);
  }

  @action
  setWorkload(kind: WorkloadKind, name: string, namespace?: string): void {
    const ns = namespace || this.selectedNamespace;
    this.setResource({ kind, name, namespace: ns });
  }

  // Alias for backward compatibility
  @action
  setDeployment(deploymentName: string): void {
    if (!deploymentName) {
      this.setResource(undefined);

      return;
    }

    const dep = this.availableDeployments.find(d => d.getName() === deploymentName);

    this.setResource({
      kind: "Deployment",
      name: deploymentName,
      namespace: dep ? dep.getNs() : this.selectedNamespace,
    });
  }

  @action
  togglePod(podName: string): void {
    if (this.activePodNames.has(podName)) {
      this.activePodNames.delete(podName);
    } else {
      this.activePodNames.add(podName);
    }

    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  selectAllPods(): void {
    for (const pod of this.currentResourcePods) {
      this.activePodNames.add(pod.getName());
    }

    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  deselectAllPods(): void {
    this.activePodNames.clear();
    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  toggleContainer(containerName: string): void {
    if (this.activeContainerNames.has(containerName)) {
      this.activeContainerNames.delete(containerName);
      if (this.activeContainerNames.size === 0) {
        this.userDeselectedAllContainers = true;
      }
    } else {
      this.userDeselectedAllContainers = false;
      this.activeContainerNames.add(containerName);
    }

    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  selectAllContainers(): void {
    this.userDeselectedAllContainers = false;
    for (const c of this.availableContainers) {
      this.activeContainerNames.add(c);
    }

    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  deselectAllContainers(): void {
    this.userDeselectedAllContainers = true;
    this.activeContainerNames.clear();
    this.syncStreamsWithPods(this.currentResourcePods);
  }

  @action
  toggleAutoFollowNewReplicas(): void {
    this.autoFollowNewReplicas = !this.autoFollowNewReplicas;
    this.savePreferences();
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
    this.savePreferences();
  }

  @action
  setSearchQuery(query: string): void {
    this.searchQuery = query;
  }

  @action
  setFilterPod(podName: string): void {
    this.selectedFilterPod = podName;
  }

  @action
  setFilterContainer(containerName: string): void {
    this.selectedFilterContainer = containerName;
  }

  getStreamKey(podName: string, containerName: string): string {
    return `${podName}/${containerName}`;
  }

  syncStreamsWithPods(pods: Pod[] = this.currentResourcePods): void {
    if (!pods) return;

    // If containers were not populated yet (e.g. pods weren't loaded when workload was selected),
    // and user didn't explicitly deselect all containers, auto-select all available containers now
    if (!this.userDeselectedAllContainers && this.activeContainerNames.size === 0 && this.availableContainers.length > 0) {
      for (const c of this.availableContainers) {
        this.activeContainerNames.add(c);
      }
    }

    // Handle new replica discovery vs existing pods
    if (this.selectedResource && this.autoFollowNewReplicas) {
      for (const pod of pods) {
        const podName = pod.getName();

        if (!this.knownPodNames.has(podName)) {
          this.knownPodNames.add(podName);
          this.activePodNames.add(podName);
        }
      }
    } else {
      for (const pod of pods) {
        this.knownPodNames.add(pod.getName());
      }
    }

    const currentPodNames = new Set(pods.map(p => p.getName()));

    // Clean up pods that are deleted from the cluster
    for (const name of Array.from(this.knownPodNames)) {
      if (!currentPodNames.has(name)) {
        this.knownPodNames.delete(name);
        this.activePodNames.delete(name);
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
        if (!this.activeContainerNames.has(container.name)) {
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

  private ensureFlushTimer(): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => {
        this.flushBatch();
      }, 50);
    }
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
        return;
      }
      this.isReconnecting.set(streamKey, false);
    }

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

    const stream = this.activeStreams.get(streamKey);

    if (stream) {
      stream.lineCount++;
      if (stream.status !== "STREAMING") {
        stream.status = "STREAMING";
        stream.error = undefined;
      }
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
      this.ensureFlushTimer();
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

    // HTTP 401 / 403: Insufficient RBAC privileges or expired credentials. Stop retrying to avoid spamming the API server.
    if (statusCode === 401 || statusCode === 403 || error.message.includes("401") || error.message.includes("403")) {
      action(() => {
        const stream = this.activeStreams.get(streamKey);

        if (stream) {
          stream.status = "ERROR";
          stream.error = statusCode === 401 || error.message.includes("401")
            ? "HTTP 401 Unauthorized: Session or cluster authentication expired."
            : "HTTP 403 Forbidden: Insufficient RBAC permissions to read pod logs.";
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
      if (this.activePodNames.has(podName) && this.selectedResource) {
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

  stopAllStreams(): void {
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

  /**
   * Exports logs to string format (TXT or JSONL)
   */
  exportLogs(format: "txt" | "jsonl", filteredOnly = false, clusterName?: string): string {
    const entries = filteredOnly ? this.displayLogs : this.logs;
    const targetCluster = clusterName || this.clusterName || "default";

    if (format === "jsonl") {
      return formatLogsAsJsonl(entries, targetCluster);
    }

    return formatLogsAsText(entries, targetCluster);
  }

  /**
   * Triggers an explicit client-side file download of the logs
   */
  downloadExport(format: "txt" | "jsonl", filteredOnly = false, clusterName?: string): void {
    const content = this.exportLogs(format, filteredOnly, clusterName);
    const targetName = this.selectedResource ? `${this.selectedResource.kind.toLowerCase()}-${this.selectedResource.name}` : "all";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `kubetail-${targetName}-${ts}.${format}`;
    const mimeType = format === "jsonl" ? "application/x-ndjson" : "text/plain";

    triggerFileDownload(content, filename, mimeType);
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
