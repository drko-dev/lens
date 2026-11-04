/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import activeRootPanelKindInjectable from "./active-root-panel-kind.injectable";
import { createRootPanelStore } from "./root-panel-store";

// One store per root frame renderer: the layout survives route changes between root views.
const rootPanelStoreInjectable = getInjectable({
  id: "root-panel-store",
  instantiate: (di) => createRootPanelStore(di.inject(activeRootPanelKindInjectable).get()),
});

export default rootPanelStoreInjectable;
