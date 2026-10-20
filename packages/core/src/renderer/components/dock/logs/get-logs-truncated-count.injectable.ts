/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const getLogsTruncatedCountInjectable = getInjectable({
  id: "get-logs-truncated-count",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): number => store.getTruncatedCount(tabId);
  },
});

export default getLogsTruncatedCountInjectable;
