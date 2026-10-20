/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const isLogsPausedInjectable = getInjectable({
  id: "is-logs-paused",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): boolean => store.isPaused(tabId);
  },
});

export default isLogsPausedInjectable;
