/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import logStoreInjectable from "./store.injectable";
import type { LogTabData } from "./tab-store";

export type CanResumeLogs = (tabId: string, data: LogTabData | undefined) => boolean;

const canResumeLogsInjectable = getInjectable({
  id: "can-resume-logs",

  instantiate: (di): CanResumeLogs => {
    const logStore = di.inject(logStoreInjectable);

    return (tabId, data) => logStore.canResume(tabId, data);
  },
});

export default canResumeLogsInjectable;
