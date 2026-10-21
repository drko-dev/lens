/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { LogTabData } from "./tab-store";
import type { IComputedValue } from "mobx";
import { computed } from "mobx";
import type { TabId } from "../dock/store";
import type { SearchStore } from "../../../search-store/search-store";
import type { Pod, PodLogsQuery } from "@openlens/kube-object";
import { isDefined } from "@openlens/utilities";
import assert from "assert";
import type { GetPodById } from "../../workloads-pods/get-pod-by-id.injectable";
import type { GetPodsByOwnerId } from "../../workloads-pods/get-pods-by-owner-id.injectable";
import type { LoadLogs } from "./load-logs.injectable";
import type { ResourceDescriptor } from "../../../../common/k8s-api/kube-api";
import type { LogStreamStatus } from "./store";
import type { Cluster } from "../../../../common/cluster/cluster";
import { createToolContextFromCluster } from "../../../../common/workspace/tool-context";

export interface LogTabViewModelDependencies {
  getLogs: (tabId: TabId) => string[];
  getLogsWithoutTimestamps: (tabId: TabId) => string[];
  getTimestampSplitLogs: (tabId: TabId) => [string, string][];
  getLogTabData: (tabId: TabId) => LogTabData | undefined;
  setLogTabData: (tabId: TabId, data: LogTabData) => void;
  loadLogs: LoadLogs;
  reloadLogs: (tabId: TabId, pod: IComputedValue<Pod | undefined>, logTabData: IComputedValue<LogTabData | undefined>) => Promise<void>;
  renameTab: (tabId: TabId, title: string) => void;
  stopLoadingLogs: (tabId: TabId) => void;
  getPodById: GetPodById;
  getPodsByOwnerId: GetPodsByOwnerId;
  areLogsPresent: (tabId: TabId) => boolean;
  downloadLogs: (filename: string, logs: string[]) => void;
  downloadAllLogs: (params: ResourceDescriptor, query: PodLogsQuery) => Promise<void>;
  searchStore: SearchStore;
  isPaused: (tabId: TabId) => boolean;
  pause: (tabId: TabId) => void;
  resume: (tabId: TabId) => void;
  getPendingCount: (tabId: TabId) => number;
  getStatus: (tabId: TabId) => LogStreamStatus;
  getError: (tabId: TabId) => string | undefined;
  getTruncatedCount: (tabId: TabId) => number;
  hostedCluster?: Cluster;
}

export class LogTabViewModel {
  public readonly clusterId: string;
  public readonly clusterName: string;
  public readonly environment: string;
  public readonly isProduction: boolean;
  public readonly accentColor: string;

  constructor(protected readonly tabId: TabId, private readonly dependencies: LogTabViewModelDependencies) {
    const cluster = dependencies.hostedCluster;
    const toolContext = createToolContextFromCluster(cluster, tabId);

    this.clusterId = toolContext.clusterId;
    this.clusterName = toolContext.clusterName;
    this.environment = toolContext.environment;
    this.isProduction = toolContext.isProduction;
    this.accentColor = toolContext.clusterColor || "#3d90ce";
  }

  get searchStore() {
    return this.dependencies.searchStore;
  }

  readonly podUid = computed(() => {
    return this.pod.get()?.getId() ?? this.logTabData.get()?.selectedPodId;
  });

  readonly isLoading = computed(() => this.dependencies.areLogsPresent(this.tabId));
  readonly logs = computed(() => this.dependencies.getLogs(this.tabId));
  readonly logsWithoutTimestamps = computed(() => this.dependencies.getLogsWithoutTimestamps(this.tabId));
  readonly timestampSplitLogs = computed(() => this.dependencies.getTimestampSplitLogs(this.tabId));
  readonly logTabData = computed(() => this.dependencies.getLogTabData(this.tabId));
  readonly isPaused = computed(() => this.dependencies.isPaused(this.tabId));
  readonly pendingCount = computed(() => this.dependencies.getPendingCount(this.tabId));
  readonly status = computed(() => this.dependencies.getStatus(this.tabId));
  readonly error = computed(() => this.dependencies.getError(this.tabId));
  readonly truncatedCount = computed(() => this.dependencies.getTruncatedCount(this.tabId));
  readonly isTruncated = computed(() => this.truncatedCount.get() > 0);
  readonly pods = computed(() => {
    const data = this.logTabData.get();

    if (!data) {
      return [];
    }

    if (typeof data.owner?.uid === "string") {
      return this.dependencies.getPodsByOwnerId(data.owner.uid);
    }

    return [this.dependencies.getPodById(data.selectedPodId)].filter(isDefined);
  });
  readonly pod = computed(() => {
    const data = this.logTabData.get();

    if (!data) {
      return undefined;
    }

    return this.dependencies.getPodById(data.selectedPodId);
  });

  updateLogTabData = (partialData: Partial<LogTabData>) => {
    const data = this.logTabData.get();

    assert(data, "Can only update data once it is set");

    this.dependencies.setLogTabData(this.tabId, { ...data, ...partialData });
  };

  loadLogs = () => this.dependencies.loadLogs(this.tabId, this.pod, this.logTabData);
  reloadLogs = () => this.dependencies.reloadLogs(this.tabId, this.pod, this.logTabData);
  renameTab = (title: string) => this.dependencies.renameTab(this.tabId, title);
  stopLoadingLogs = () => this.dependencies.stopLoadingLogs(this.tabId);
  pause = () => this.dependencies.pause(this.tabId);
  resume = () => this.dependencies.resume(this.tabId);

  downloadLogs = () => {
    const pod = this.pod.get();
    const tabData = this.logTabData.get();

    if (pod && tabData) {
      const fileName = pod.getName();
      const logsToDownload: string[] = tabData.showTimestamps
        ? this.logs.get()
        : this.logsWithoutTimestamps.get();

      this.dependencies.downloadLogs(`${fileName}.log`, logsToDownload);
    }
  };

  downloadAllLogs = () => {
    const pod = this.pod.get();
    const tabData = this.logTabData.get();

    if (pod && tabData) {
      const params = { name: pod.getName(), namespace: pod.getNs() };
      const query = { timestamps: tabData.showTimestamps, previous: tabData.showPrevious, container: tabData.selectedContainer };

      return this.dependencies.downloadAllLogs(params, query);
    }

    return;
  };
}
