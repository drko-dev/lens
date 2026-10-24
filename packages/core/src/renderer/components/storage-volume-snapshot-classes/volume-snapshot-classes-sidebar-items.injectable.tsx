/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import volumeSnapshotClassesRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-classes/volume-snapshot-classes-route.injectable";
import { storageSidebarItemId } from "../storage/storage-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToVolumeSnapshotClassesInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-classes/navigate-to-volume-snapshot-classes.injectable";

const volumeSnapshotClassesSidebarItemsInjectable = getInjectable({
  id: "volume-snapshot-classes-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(volumeSnapshotClassesRouteInjectable);
    const navigateToVolumeSnapshotClasses = di.inject(navigateToVolumeSnapshotClassesInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "volume-snapshot-classes",
        parentId: storageSidebarItemId,
        title: "Volume Snapshot Classes",
        onClick: navigateToVolumeSnapshotClasses,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 46,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default volumeSnapshotClassesSidebarItemsInjectable;
