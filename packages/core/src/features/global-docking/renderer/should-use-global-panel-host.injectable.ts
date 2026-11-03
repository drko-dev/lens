/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import activeGlobalPanelKindInjectable from "./active-global-panel-kind.injectable";
import { isGlobalDockingEnabled } from "./global-docking-feature-flag";

// Only the hosted workload routes (globalPanelKinds) use the host; every other route renders classically.
const shouldUseGlobalPanelHostInjectable = getInjectable({
  id: "should-use-global-panel-host",
  instantiate: (di) => {
    const enabled = isGlobalDockingEnabled(typeof window === "undefined" ? undefined : window.localStorage);
    const activeKind = di.inject(activeGlobalPanelKindInjectable);

    return computed(() => enabled && activeKind.get() !== undefined);
  },
});

export default shouldUseGlobalPanelHostInjectable;
