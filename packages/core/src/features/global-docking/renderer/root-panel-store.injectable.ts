/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import activeRootPanelKindInjectable from "./active-root-panel-kind.injectable";
import { createRootPanelStore, rootPanelKinds } from "./root-panel-store";
import { attachGlobalLayoutPersistence } from "./global-layout-persistence";
import { isGlobalDockingEnabled } from "./global-docking-feature-flag";
import layoutPersistenceStorageInjectable from "./layout-persistence-storage.injectable";
import restoredSessionGateInjectable from "./restored-session-gate.injectable";

// One store per root frame renderer: the layout survives route changes between root views.
const rootPanelStoreInjectable = getInjectable({
  id: "root-panel-store",
  instantiate: (di) => {
    const store = createRootPanelStore(di.inject(activeRootPanelKindInjectable).get());

    // H7.7: the root layout is independent (no clusterId) and only touched while the feature is on.
    if (isGlobalDockingEnabled(typeof window === "undefined" ? undefined : window.localStorage)) {
      attachGlobalLayoutPersistence({
        store,
        scope: "root",
        allowedKinds: rootPanelKinds,
        singleInstance: true,
        storage: di.inject(layoutPersistenceStorageInjectable),
        gate: di.inject(restoredSessionGateInjectable),
        logger: di.inject(loggerInjectionToken),
      });
    }

    return store;
  },
});

export default rootPanelStoreInjectable;
