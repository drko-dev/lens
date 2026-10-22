/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import type { ObservableSet } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import type { Cluster } from "../../../../common/cluster/cluster";
import type { DetachedToolWindowsFeatureFlag } from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import type { DetachToolRequest, FrameRedockRequest } from "../../../../common/detached-tools/detached-tool-channels";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import type { ShowCheckedErrorNotification } from "../../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import detachedLogsTabsInjectable from "./detached-logs-tabs.injectable";
import type { LogTabViewModel } from "./logs-view-model";

export const DETACHED_LOGS_TAIL_LINES = 500;
export const DETACHED_WORKSPACE_ID = "default";

interface Dependencies {
  flag: DetachedToolWindowsFeatureFlag;
  detachedTabs: ObservableSet<string>;
  hostedCluster: Cluster | undefined;
  invoke: (channel: string, payload: unknown) => Promise<unknown>;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
}

const injectDependencies = (di: Parameters<Parameters<typeof withInjectables>[1]["getProps"]>[0]): Dependencies => ({
  flag: di.inject(detachedToolWindowsFeatureFlagInjectable),
  detachedTabs: di.inject(detachedLogsTabsInjectable),
  hostedCluster: di.inject(hostedClusterInjectable),
  invoke: (channel, payload) => di.inject(ipcRendererInjectable).invoke(channel, payload),
  showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
});

export interface LogDetachProps {
  tabId: string;
  model: LogTabViewModel;
}

const NonInjectedLogDetachButton = observer(({ tabId, model, flag, detachedTabs, hostedCluster, invoke, showCheckedErrorNotification }: LogDetachProps & Dependencies) => {
  const data = model.logTabData.get();
  const pod = model.pod.get();

  if (!flag.isEnabled || !hostedCluster || !data || !pod || detachedTabs.has(tabId)) {
    return null;
  }

  const detach = async () => {
    const request: DetachToolRequest = {
      clusterId: hostedCluster.id,
      workspaceId: DETACHED_WORKSPACE_ID,
      tabId,
      toolKind: "logs",
      resource: { kind: "Pod", namespace: pod.getNs(), name: pod.getName(), uid: pod.getId() },
      logs: {
        container: data.selectedContainer,
        tailLines: DETACHED_LOGS_TAIL_LINES,
        previous: data.showPrevious,
        timestamps: data.showTimestamps,
      },
    };

    // Exactly one stream owner: the dock stops (and stays stopped) before Main starts its own.
    model.stopLoadingLogs();
    detachedTabs.add(tabId);

    try {
      await invoke(detachedToolFrameChannels.requestDetach, request);
    } catch (error) {
      detachedTabs.delete(tabId);
      showCheckedErrorNotification(error, "Could not detach the logs");
    }
  };

  return (
    <Button
      plain
      label="Detach"
      data-testid="log-detach-btn"
      onClick={detach}
    />
  );
});

export const LogDetachButton = withInjectables<Dependencies, LogDetachProps>(NonInjectedLogDetachButton, {
  getProps: (di, props) => ({ ...props, ...injectDependencies(di) }),
});

const NonInjectedDetachedLogsPlaceholder = observer(({ tabId, detachedTabs, hostedCluster, invoke, showCheckedErrorNotification }: { tabId: string } & Dependencies) => {
  const redock = async () => {
    if (!hostedCluster) {
      return;
    }

    const request: FrameRedockRequest = {
      clusterId: hostedCluster.id,
      workspaceId: DETACHED_WORKSPACE_ID,
      tabId,
      toolKind: "logs",
    };

    try {
      const result = await invoke(detachedToolFrameChannels.requestRedock, request) as { accepted?: boolean } | undefined;

      // No window owns this tab any more (stale state): take the stream back.
      if (!result?.accepted) {
        detachedTabs.delete(tabId);
      }
    } catch (error) {
      showCheckedErrorNotification(error, "Could not redock the logs");
    }
  };

  return (
    <div className="flex column gaps align-center justify-center box grow" data-testid="log-detached-placeholder">
      <span>Detached — streaming in a separate window</span>
      <Button
        primary
        label="Redock"
        data-testid="log-redock-btn"
        onClick={redock}
      />
    </div>
  );
});

export const DetachedLogsPlaceholder = withInjectables<Dependencies, { tabId: string }>(NonInjectedDetachedLogsPlaceholder, {
  getProps: (di, props) => ({ ...props, ...injectDependencies(di) }),
});
