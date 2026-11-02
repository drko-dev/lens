/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { createGlobalPanelStore } from "./global-panel-store";

// One store per cluster frame renderer: the panel clusterId never follows the selected cluster.
const globalPanelStoreInjectable = getInjectable({
  id: "global-panel-store",
  instantiate: (di) => createGlobalPanelStore(di.inject(hostedClusterIdInjectable) ?? undefined),
});

export default globalPanelStoreInjectable;
