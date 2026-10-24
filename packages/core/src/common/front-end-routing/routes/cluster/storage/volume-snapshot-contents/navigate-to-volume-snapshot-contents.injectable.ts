/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import volumeSnapshotContentsRouteInjectable from "./volume-snapshot-contents-route.injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";

const navigateToVolumeSnapshotContentsInjectable = getInjectable({
  id: "navigate-to-volume-snapshot-contents",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(volumeSnapshotContentsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToVolumeSnapshotContentsInjectable;
