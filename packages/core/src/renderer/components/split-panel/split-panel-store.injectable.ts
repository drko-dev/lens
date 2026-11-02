/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { SplitPanelStore } from "./split-panel-store";
import hostedClusterIdInjectable from "../../cluster-frame-context/hosted-cluster-id.injectable";

const splitPanelStoreInjectable = getInjectable({
  id: "split-panel-store",
  instantiate: (di) => {
    let initialClusterId: string | undefined;

    try {
      initialClusterId = di.inject(hostedClusterIdInjectable) ?? undefined;
    } catch {
      // In tests or outside frame context
    }

    return new SplitPanelStore({
      initialClusterId,
    });
  },
});

export default splitPanelStoreInjectable;
