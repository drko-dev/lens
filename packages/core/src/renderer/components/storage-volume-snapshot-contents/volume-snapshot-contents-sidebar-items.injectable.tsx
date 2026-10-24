/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import volumeSnapshotContentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-contents/volume-snapshot-contents-route.injectable";
import { storageSidebarItemId } from "../storage/storage-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToVolumeSnapshotContentsInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-contents/navigate-to-volume-snapshot-contents.injectable";

const volumeSnapshotContentsSidebarItemsInjectable = getInjectable({
  id: "volume-snapshot-contents-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(volumeSnapshotContentsRouteInjectable);
    const navigateToVolumeSnapshotContents = di.inject(navigateToVolumeSnapshotContentsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "volume-snapshot-contents",
        parentId: storageSidebarItemId,
        title: "Volume Snapshot Contents",
        onClick: navigateToVolumeSnapshotContents,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 47,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default volumeSnapshotContentsSidebarItemsInjectable;
