/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const getPendingLogsCountInjectable = getInjectable({
  id: "get-pending-logs-count",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): number => store.getPendingCount(tabId);
  },
});

export default getPendingLogsCountInjectable;
