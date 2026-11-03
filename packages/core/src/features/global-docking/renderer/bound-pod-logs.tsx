/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import splitPanelStyles from "../../../renderer/components/split-panel/split-panel.module.scss";
import React, { useLayoutEffect } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Icon } from "../../../renderer/components/icon";
import type { PanelResourceBinding } from "../../../renderer/components/split-panel/split-panel-types";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { dockedLogsTabId } from "./global-panel-store";
import { LogsDockTab } from "../../../renderer/components/dock/logs/view";
import { TabKind } from "../../../renderer/components/dock/dock/store";
import logTabStoreInjectable from "../../../renderer/components/dock/logs/tab-store.injectable";
import type { LogTabStore } from "../../../renderer/components/dock/logs/tab-store";

export interface BoundPodLogsProps {
  readonly binding: PanelResourceBinding;
}

interface Dependencies {
  hostedClusterId: string | undefined;
  logTabStore: LogTabStore;
}

/**
 * H7.6.3B: Pod Logs rendered inside a docked panel with an isolated, stable session identity.
 * Validates cluster isolation and ensures the tab metadata exists in LogTabStore.
 */
const NonInjectedBoundPodLogs = observer(({ binding, hostedClusterId, logTabStore }: BoundPodLogsProps & Dependencies) => {
  const sameCluster = !binding.clusterId || binding.clusterId === hostedClusterId;
  const tabId = binding.tabId || dockedLogsTabId(binding);

  // Layout effect on purpose: it runs before the passive effects of LogsDockTab (its child),
  // so the first load already sees the tab data instead of racing it.
  useLayoutEffect(() => {
    if (!sameCluster) {
      return;
    }

    const currentData = logTabStore.getData(tabId);
    if (!currentData) {
      logTabStore.setData(tabId, {
        selectedPodId: binding.uid || binding.name,
        namespace: binding.namespace || "default",
        selectedContainer: binding.container || "main",
        showTimestamps: false,
        showPrevious: false,
      });
    }
  }, [tabId, binding, sameCluster, logTabStore]);

  const identity = {
    "data-kind": "Pod",
    "data-namespace": binding.namespace ?? "",
    "data-name": binding.name,
    "data-container": binding.container ?? "",
    "data-tab-id": tabId,
    "data-cluster-id": binding.clusterId,
  };

  if (!sameCluster) {
    return (
      <div className={splitPanelStyles.emptyDetailsState} data-testid="bound-logs-unavailable" {...identity}>
        <Icon material="info" className={splitPanelStyles.emptyIcon} />
        <span className={splitPanelStyles.emptyTitle}>{`Logs: ${binding.name}`}</span>
        <span className={splitPanelStyles.emptyDescription}>
          This resource belongs to another cluster.
        </span>
      </div>
    );
  }

  const dockTab = {
    id: tabId,
    kind: TabKind.POD_LOGS,
    title: `Logs: ${binding.name}`,
    pinned: false,
  };

  return (
    <div className="BoundPodLogs flex column box grow" style={{ height: "100%", minHeight: 0, overflow: "hidden" }} data-testid="bound-logs" {...identity}>
      {/* box grow: the list measures its parent with an AutoSizer, so the Logs tab must fill the panel (0 px high otherwise) */}
      <LogsDockTab tab={dockTab} className="box grow" />
    </div>
  );
});

export const BoundPodLogs = withInjectables<Dependencies, BoundPodLogsProps>(NonInjectedBoundPodLogs, {
  getProps: (di, props) => ({
    ...props,
    hostedClusterId: di.inject(hostedClusterIdInjectable) ?? undefined,
    logTabStore: di.inject(logTabStoreInjectable),
  }),
});
