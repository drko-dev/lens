/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import { LogTabViewModel } from "./logs-view-model";
import type { TabId } from "../dock/store";
import getLogsInjectable from "./get-logs.injectable";
import getLogsWithoutTimestampsInjectable from "./get-logs-without-timestamps.injectable";
import getTimestampSplitLogsInjectable from "./get-timestamp-split-logs.injectable";
import reloadLogsInjectable from "./reload-logs.injectable";
import resumeLoadingLogsInjectable from "./resume-loading-logs.injectable";
import canResumeLogsInjectable from "./can-resume-logs.injectable";
import getLogTabDataInjectable from "./get-log-tab-data.injectable";
import loadLogsInjectable from "./load-logs.injectable";
import setLogTabDataInjectable from "./set-log-tab-data.injectable";
import stopLoadingLogsInjectable from "./stop-loading-logs.injectable";
import renameTabInjectable from "../dock/rename-tab.injectable";
import areLogsPresentInjectable from "./are-logs-present.injectable";
import searchStoreInjectable from "../../../search-store/search-store.injectable";
import getPodsByOwnerIdInjectable from "../../workloads-pods/get-pods-by-owner-id.injectable";
import getPodByIdInjectable from "../../workloads-pods/get-pod-by-id.injectable";
import downloadLogsInjectable from "./download-logs.injectable";
import downloadAllLogsInjectable from "./download-all-logs.injectable";
import isLogsPausedInjectable from "./is-logs-paused.injectable";
import pauseLogsInjectable from "./pause-logs.injectable";
import resumeLogsInjectable from "./resume-logs.injectable";
import getPendingLogsCountInjectable from "./get-pending-logs-count.injectable";
import getLogsStatusInjectable from "./get-logs-status.injectable";
import getLogsErrorInjectable from "./get-logs-error.injectable";
import getLogsTruncatedCountInjectable from "./get-logs-truncated-count.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import logStoreInjectable from "./store.injectable";

export interface InstantiateArgs {
  tabId: TabId;
}

const logsViewModelInjectable = getInjectable({
  id: "logs-view-model",

  instantiate: (di, tabId) => {
    const logStore = di.inject(logStoreInjectable);

    return new LogTabViewModel(tabId, {
      getLogs: di.inject(getLogsInjectable),
      getLogsWithoutTimestamps: di.inject(getLogsWithoutTimestampsInjectable),
      getTimestampSplitLogs: di.inject(getTimestampSplitLogsInjectable),
      reloadLogs: di.inject(reloadLogsInjectable),
      resumeLoadingLogs: di.inject(resumeLoadingLogsInjectable),
      canResumeLogs: di.inject(canResumeLogsInjectable),
      getLogTabData: di.inject(getLogTabDataInjectable),
      setLogTabData: di.inject(setLogTabDataInjectable),
      loadLogs: di.inject(loadLogsInjectable),
      renameTab: di.inject(renameTabInjectable),
      stopLoadingLogs: di.inject(stopLoadingLogsInjectable),
      areLogsPresent: di.inject(areLogsPresentInjectable),
      getPodById: di.inject(getPodByIdInjectable),
      getPodsByOwnerId: di.inject(getPodsByOwnerIdInjectable),
      downloadLogs: di.inject(downloadLogsInjectable),
      downloadAllLogs: di.inject(downloadAllLogsInjectable),
      searchStore: di.inject(searchStoreInjectable),
      isPaused: di.inject(isLogsPausedInjectable),
      pause: di.inject(pauseLogsInjectable),
      resume: di.inject(resumeLogsInjectable),
      getPendingCount: di.inject(getPendingLogsCountInjectable),
      getStatus: di.inject(getLogsStatusInjectable),
      getError: di.inject(getLogsErrorInjectable),
      getTruncatedCount: di.inject(getLogsTruncatedCountInjectable),
      getViewState: (tabId) => logStore.getViewState(tabId),
      setViewState: (tabId, state) => logStore.setViewState(tabId, state),
      hostedCluster: di.inject(hostedClusterInjectable),
    });
  },

  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, tabId: TabId) => `log-tab-view-model-${tabId}}`,
  }),
});

export default logsViewModelInjectable;
