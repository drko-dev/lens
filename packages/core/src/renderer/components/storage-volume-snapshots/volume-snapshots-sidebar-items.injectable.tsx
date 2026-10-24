/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import volumeSnapshotsRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshots/volume-snapshots-route.injectable";
import { storageSidebarItemId } from "../storage/storage-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToVolumeSnapshotsInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshots/navigate-to-volume-snapshots.injectable";

const volumeSnapshotsSidebarItemsInjectable = getInjectable({
  id: "volume-snapshots-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(volumeSnapshotsRouteInjectable);
    const navigateToVolumeSnapshots = di.inject(navigateToVolumeSnapshotsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "volume-snapshots",
        parentId: storageSidebarItemId,
        title: "Volume Snapshots",
        onClick: navigateToVolumeSnapshots,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 45,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default volumeSnapshotsSidebarItemsInjectable;
