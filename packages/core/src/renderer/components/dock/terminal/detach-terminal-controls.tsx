/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";
import type { ObservableMap } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import { Button } from "@openlens/button";
import type { Cluster } from "../../../../common/cluster/cluster";
import type { DetachedToolWindowsFeatureFlag } from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import type { DetachTerminalRequest, DetachTerminalResult } from "../../../../common/terminal/detached-terminal-channels";
import { DETACHED_TERMINAL_WORKSPACE_ID, detachedTerminalFrameChannels } from "../../../../common/terminal/detached-terminal-channels";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import type { ShowCheckedErrorNotification } from "../../notifications/show-checked-error.injectable";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import detachedTerminalTabsInjectable from "./detached-terminal-tabs.injectable";
import type { TerminalStore } from "./store";
import terminalStoreInjectable from "./store.injectable";

interface Dependencies {
  flag: DetachedToolWindowsFeatureFlag;
  detachedTabs: ObservableMap<string, "detached" | "ended">;
  terminalStore: TerminalStore;
  hostedCluster: Cluster | undefined;
  invoke: (channel: string, payload: unknown) => Promise<unknown>;
  showCheckedErrorNotification: ShowCheckedErrorNotification;
}

const injectDependencies = (di: Parameters<Parameters<typeof withInjectables>[1]["getProps"]>[0]): Dependencies => ({
  flag: di.inject(detachedToolWindowsFeatureFlagInjectable),
  detachedTabs: di.inject(detachedTerminalTabsInjectable),
  terminalStore: di.inject(terminalStoreInjectable),
  hostedCluster: di.inject(hostedClusterInjectable),
  invoke: (channel, payload) => di.inject(ipcRendererInjectable).invoke(channel, payload),
  showCheckedErrorNotification: di.inject(showCheckedErrorNotificationInjectable),
});

const NonInjectedTerminalDetachButton = observer(({ tabId, flag, detachedTabs, terminalStore, hostedCluster, invoke, showCheckedErrorNotification }: { tabId: string } & Dependencies) => {
  if (!flag.isEnabled || !hostedCluster || detachedTabs.has(tabId)) {
    return null;
  }

  const api = terminalStore.getTerminalApi(tabId);

  if (!api) {
    return null;
  }

  const detach = async () => {
    const request: DetachTerminalRequest = {
      clusterId: hostedCluster.id,
      workspaceId: DETACHED_TERMINAL_WORKSPACE_ID,
      tabId,
    };
    const giveBack = () => {
      detachedTabs.delete(tabId);
      void api.resume();
    };

    // Exactly one consumer: the dock stops (auto-)connecting before Main hands the PTY over.
    api.suspend();
    detachedTabs.set(tabId, "detached");

    try {
      const result = await invoke(detachedTerminalFrameChannels.requestDetach, request) as DetachTerminalResult | undefined;

      if (!result?.accepted) {
        giveBack();
      }
    } catch (error) {
      giveBack();
      showCheckedErrorNotification(error, "Could not detach the terminal");
    }
  };

  return (
    <Button
      plain
      label="Detach"
      data-testid="terminal-detach-btn"
      onClick={detach}
    />
  );
});

export const TerminalDetachButton = withInjectables<Dependencies, { tabId: string }>(NonInjectedTerminalDetachButton, {
  getProps: (di, props) => ({ ...props, ...injectDependencies(di) }),
});

const NonInjectedDetachedTerminalPlaceholder = observer(({ tabId, detachedTabs, terminalStore, hostedCluster, invoke, showCheckedErrorNotification }: { tabId: string } & Dependencies) => {
  const ended = detachedTabs.get(tabId) === "ended";
  const redock = async () => {
    if (!hostedCluster) {
      return;
    }

    try {
      const result = await invoke(detachedTerminalFrameChannels.requestRedock, {
        clusterId: hostedCluster.id,
        workspaceId: DETACHED_TERMINAL_WORKSPACE_ID,
        tabId,
      } as DetachTerminalRequest) as { accepted?: boolean } | undefined;

      // No window owns this tab any more (stale state): take the terminal back.
      if (!result?.accepted) {
        detachedTabs.delete(tabId);
        void terminalStore.getTerminalApi(tabId)?.resume();
      }
    } catch (error) {
      showCheckedErrorNotification(error, "Could not redock the terminal");
    }
  };

  return (
    <div className="flex column gaps align-center justify-center box grow" data-testid="terminal-detached-placeholder">
      <span>{ended ? "Terminal session ended in the detached window" : "Detached — running in a separate window"}</span>
      <Button
        primary
        label={ended ? "Close window and redock" : "Redock"}
        data-testid="terminal-redock-btn"
        onClick={redock}
      />
    </div>
  );
});

export const DetachedTerminalPlaceholder = withInjectables<Dependencies, { tabId: string }>(NonInjectedDetachedTerminalPlaceholder, {
  getProps: (di, props) => ({ ...props, ...injectDependencies(di) }),
});
