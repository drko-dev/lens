/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";

const resumeLogsInjectable = getInjectable({
  id: "resume-logs",
  instantiate: (di) => {
    const store = di.inject(logStoreInjectable);

    return (tabId: string): void => store.resume(tabId);
  },
});

export default resumeLogsInjectable;
