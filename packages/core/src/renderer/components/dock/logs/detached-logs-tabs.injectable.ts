/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";

/**
 * R4-06: ids of Logs dock tabs whose stream is currently owned by a detached window.
 * While a tab is in this set the dock must not stream for it.
 */
const detachedLogsTabsInjectable = getInjectable({
  id: "detached-logs-tabs",
  instantiate: () => observable.set<string>(),
});

export default detachedLogsTabsInjectable;
