/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import activeRootPanelKindInjectable from "../../../features/global-docking/renderer/active-root-panel-kind.injectable";
import { isGlobalDockingEnabled } from "../../../features/global-docking/renderer/global-docking-feature-flag";

// Settings and Catalog use the docking host only with the global docking flag on; flag OFF = classic routes.
const shouldUseRootPanelHostInjectable = getInjectable({
  id: "should-use-root-panel-host",
  instantiate: (di) => {
    const enabled = isGlobalDockingEnabled(typeof window === "undefined" ? undefined : window.localStorage);
    const activeKind = di.inject(activeRootPanelKindInjectable);

    return computed(() => enabled && activeKind.get() !== undefined);
  },
});

export default shouldUseRootPanelHostInjectable;
