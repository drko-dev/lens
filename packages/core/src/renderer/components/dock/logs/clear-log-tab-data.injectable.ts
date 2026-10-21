/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { TabId } from "../dock/store";
import logTabStoreInjectable from "./tab-store.injectable";
import logStoreInjectable from "./store.injectable";

const clearLogTabDataInjectable = getInjectable({
  id: "clear-log-tab-data",

  instantiate: (di) => {
    const logTabStore = di.inject(logTabStoreInjectable);
    const logStore = di.inject(logStoreInjectable);

    return (tabId: TabId): void => {
      logStore.clearLogs(tabId);
      logTabStore.clearData(tabId);
    };
  },
});

export default clearLogTabDataInjectable;
