/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { VolumeSnapshots } from "./volume-snapshots";
import volumeSnapshotsRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshots/volume-snapshots-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const volumeSnapshotsRouteComponentInjectable = getInjectable({
  id: "volume-snapshots-route-component",

  instantiate: (di) => ({
    route: di.inject(volumeSnapshotsRouteInjectable),
    Component: VolumeSnapshots,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default volumeSnapshotsRouteComponentInjectable;
