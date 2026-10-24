/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import volumeSnapshotsRouteInjectable from "./volume-snapshots-route.injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";

const navigateToVolumeSnapshotsInjectable = getInjectable({
  id: "navigate-to-volume-snapshots",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(volumeSnapshotsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToVolumeSnapshotsInjectable;
