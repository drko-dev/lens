/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { IComputedValue } from "mobx";
import type { Pod } from "@openlens/kube-object";
import logStoreInjectable from "./store.injectable";
import type { LogTabData } from "./tab-store";

export interface ResumeLoadingLogs {
  (
    tabId: string,
    pod: IComputedValue<Pod | undefined>,
    logTabData: IComputedValue<LogTabData | undefined>,
  ): Promise<void>;
}

const resumeLoadingLogsInjectable = getInjectable({
  id: "resume-loading-logs",

  instantiate: (di): ResumeLoadingLogs => {
    const logStore = di.inject(logStoreInjectable);

    return (tabId, pod, logTabData) => logStore.resumeLoading(tabId, pod, logTabData);
  },
});

export default resumeLoadingLogsInjectable;
