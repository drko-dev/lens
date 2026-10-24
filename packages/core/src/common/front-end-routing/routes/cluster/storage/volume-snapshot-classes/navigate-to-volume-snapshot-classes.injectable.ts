/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import volumeSnapshotClassesRouteInjectable from "./volume-snapshot-classes-route.injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";

const navigateToVolumeSnapshotClassesInjectable = getInjectable({
  id: "navigate-to-volume-snapshot-classes",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(volumeSnapshotClassesRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToVolumeSnapshotClassesInjectable;
