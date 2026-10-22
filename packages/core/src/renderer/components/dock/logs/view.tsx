/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React, { createRef, useEffect } from "react";
import { observer } from "mobx-react";
import { InfoPanel } from "../info-panel";
import { LogResourceSelector } from "./resource-selector";
import type { LogListRef } from "./list";
import { LogList } from "./list";
import { LogSearch } from "./search";
import { LogControls } from "./controls";
import { withInjectables } from "@ogre-tools/injectable-react";
import logsViewModelInjectable from "./logs-view-model.injectable";
import type { LogTabViewModel } from "./logs-view-model";
import type { DockTab } from "../dock/store";
import { cssNames } from "@openlens/utilities";
import type { SubscribeStores } from "../../../kube-watch-api/kube-watch-api";
import type { ObservableSet } from "mobx";
import detachedLogsTabsInjectable from "./detached-logs-tabs.injectable";
import type { DetachedLogsHydration } from "./detached-logs-hydration.injectable";
import detachedLogsHydrationInjectable from "./detached-logs-hydration.injectable";
import { DetachedLogsPlaceholder, LogDetachButton } from "./detach-logs-controls";
import subscribeStoresInjectable from "../../../kube-watch-api/subscribe-stores.injectable";
import type { PodStore } from "../../workloads-pods/store";
import podStoreInjectable from "../../workloads-pods/store.injectable";

export interface LogsDockTabProps {
  className?: string;
  tab: DockTab;
}

interface Dependencies {
  model: LogTabViewModel;
  subscribeStores: SubscribeStores;
  detachedTabs: ObservableSet<string>;
  hydration: DetachedLogsHydration;
  podStore: PodStore;
}

const NonInjectedLogsDockTab = observer(({
  className,
  tab,
  model,
  subscribeStores,
  podStore,
  detachedTabs,
  hydration,
}: Dependencies & LogsDockTabProps) => {
  const logListElement = createRef<LogListRef>();
  const data = model.logTabData.get();

  const isDetached = detachedTabs.has(tab.id);

  useEffect(() => {
    // While a detached window owns this tab's stream the dock must stay silent.
    if (isDetached) {
      return undefined;
    }

    // After a frame reload Main may still own this tab: wait for its answer before loading anything.
    let cancelled = false;

    if (hydration.done) {
      model.reloadLogs();
    } else {
      hydration.ready.then(() => {
        if (!cancelled && !detachedTabs.has(tab.id)) model.reloadLogs();
      });
    }

    return () => {
      cancelled = true;
      model.stopLoadingLogs();
    };
  }, [tab.id, isDetached]);
  useEffect(() => subscribeStores([
    podStore,
  ], {
    namespaces: data ? [data.namespace] : [],
  }), [data?.namespace]);

  const scrollToOverlay = (overlayLine: number | undefined) => {
    if (!logListElement.current || overlayLine === undefined) {
      return;
    }

    // Scroll vertically
    logListElement.current.scrollToItem(overlayLine, "center");
    // Scroll horizontally in timeout since virtual list need some time to prepare its contents
    setTimeout(() => {
      const overlay = document.querySelector(".PodLogs .list span.active");

      if (!overlay) return;
      // Note: .scrollIntoViewIfNeeded() is non-standard and thus not present in js-dom.
      overlay?.scrollIntoViewIfNeeded?.();
    }, 100);
  };

  if (!data) {
    return null;
  }

  if (isDetached) {
    return (
      <div className={cssNames("PodLogs flex column", className)}>
        <DetachedLogsPlaceholder tabId={tab.id} />
      </div>
    );
  }

  return (
    <div className={cssNames("PodLogs flex column", className)}>
      <InfoPanel
        tabId={tab.id}
        controls={(
          <div className="flex gaps">
            <LogResourceSelector model={model} />
            <LogSearch
              model={model}
              scrollToOverlay={scrollToOverlay}
            />
            <LogDetachButton tabId={tab.id} model={model} />
          </div>
        )}
        showSubmitClose={false}
        showButtons={false}
        showStatusPanel={false}
      />
      <LogList model={model} ref={logListElement} />
      <LogControls model={model} />
    </div>
  );
});


export const LogsDockTab = withInjectables<Dependencies, LogsDockTabProps>(NonInjectedLogsDockTab, {
  getProps: (di, props) => ({
    ...props,
    model: di.inject(logsViewModelInjectable, props.tab.id),
    subscribeStores: di.inject(subscribeStoresInjectable),
    podStore: di.inject(podStoreInjectable),
    detachedTabs: di.inject(detachedLogsTabsInjectable),
    hydration: di.inject(detachedLogsHydrationInjectable),
  }),
});
