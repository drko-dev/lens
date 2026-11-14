/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { DockTabCreate, DockTab, DockStore, TabId } from "../dock/store";
import { TabKind } from "../dock/store";
import type { LogTabData, LogTabStore } from "./tab-store";
import { runInAction } from "mobx";
import createDockTabInjectable from "../dock/create-dock-tab.injectable";
import dockStoreInjectable from "../dock/store.injectable";
import logTabStoreInjectable from "./tab-store.injectable";
import setLogTabDataInjectable from "./set-log-tab-data.injectable";
import getRandomIdForPodLogsTabInjectable from "./get-random-id-for-pod-logs-tab.injectable";

export type CreateLogsTabData = Pick<LogTabData, "owner" | "selectedPodId" | "selectedContainer" | "namespace"> & Omit<Partial<LogTabData>, "owner" | "selectedPodId" | "selectedContainer" | "namespace">;

interface Dependencies {
  createDockTab: (rawTabDesc: DockTabCreate, addNumber?: boolean) => DockTab;
  dockStore: DockStore;
  logTabStore: LogTabStore;
  setLogTabData: (tabId: string, data: LogTabData) => void;
  getRandomId: () => string;
}

const createLogsTab = ({ createDockTab, dockStore, logTabStore, setLogTabData, getRandomId }: Dependencies) => (title: string, data: CreateLogsTabData): TabId => {
  const existingTab = dockStore.tabs.find(tab => {
    if (tab.kind !== TabKind.POD_LOGS) {
      return false;
    }

    const tabData = logTabStore.getData(tab.id);

    if (!tabData) {
      return false;
    }

    return tabData.selectedPodId === data.selectedPodId
      && tabData.namespace === data.namespace
      && tabData.selectedContainer === data.selectedContainer
      && tabData.owner?.uid === data.owner?.uid;
  });

  if (existingTab) {
    runInAction(() => {
      dockStore.selectTab(existingTab.id);
      dockStore.open();
    });

    return existingTab.id;
  }

  const id = `log-tab-${getRandomId()}`;

  runInAction(() => {
    createDockTab({
      id,
      title,
      kind: TabKind.POD_LOGS,
    }, false);
    setLogTabData(id, {
      showTimestamps: false,
      showPrevious: false,
      ...data,
    });
  });

  return id;
};

const createLogsTabInjectable = getInjectable({
  id: "create-logs-tab",

  instantiate: (di) => createLogsTab({
    createDockTab: di.inject(createDockTabInjectable),
    dockStore: di.inject(dockStoreInjectable),
    logTabStore: di.inject(logTabStoreInjectable),
    setLogTabData: di.inject(setLogTabDataInjectable),
    getRandomId: di.inject(getRandomIdForPodLogsTabInjectable),
  }),
});

export default createLogsTabInjectable;
