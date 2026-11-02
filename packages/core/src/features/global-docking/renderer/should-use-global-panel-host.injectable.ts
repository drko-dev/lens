/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import podsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/pods/pods-route.injectable";
import deploymentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/deployments/deployments-route.injectable";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import { isGlobalDockingEnabled } from "./global-docking-feature-flag";

// H7.1 pilot: only the Pods and Deployments routes are hosted; every other route renders classically.
const shouldUseGlobalPanelHostInjectable = getInjectable({
  id: "should-use-global-panel-host",
  instantiate: (di) => {
    const enabled = isGlobalDockingEnabled(typeof window === "undefined" ? undefined : window.localStorage);
    const podsActive = di.inject(routeIsActiveInjectable, di.inject(podsRouteInjectable));
    const deploymentsActive = di.inject(routeIsActiveInjectable, di.inject(deploymentsRouteInjectable));

    return computed(() => enabled && (podsActive.get() || deploymentsActive.get()));
  },
});

export default shouldUseGlobalPanelHostInjectable;
