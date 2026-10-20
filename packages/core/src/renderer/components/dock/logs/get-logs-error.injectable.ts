/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const getLogsErrorInjectable = getInjectable({
  id: "get-logs-error",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): string | undefined => store.getError(tabId);
  },
});

export default getLogsErrorInjectable;
