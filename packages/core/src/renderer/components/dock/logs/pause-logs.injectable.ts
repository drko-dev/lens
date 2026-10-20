/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const pauseLogsInjectable = getInjectable({
  id: "pause-logs",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): void => store.pause(tabId);
  },
});

export default pauseLogsInjectable;
