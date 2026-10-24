/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { VolumeSnapshotContents } from "./volume-snapshot-contents";
import volumeSnapshotContentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-contents/volume-snapshot-contents-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const volumeSnapshotContentsRouteComponentInjectable = getInjectable({
  id: "volume-snapshot-contents-route-component",

  instantiate: (di) => ({
    route: di.inject(volumeSnapshotContentsRouteInjectable),
    Component: VolumeSnapshotContents,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default volumeSnapshotContentsRouteComponentInjectable;
