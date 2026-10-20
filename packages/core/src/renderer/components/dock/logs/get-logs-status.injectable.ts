/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";
import type { LogStreamStatus } from "./store";

const getLogsStatusInjectable = getInjectable({
  id: "get-logs-status",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): LogStreamStatus => store.getStatus(tabId);
  },
});

export default getLogsStatusInjectable;
