/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { VolumeSnapshotClasses } from "./volume-snapshot-classes";
import volumeSnapshotClassesRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/volume-snapshot-classes/volume-snapshot-classes-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const volumeSnapshotClassesRouteComponentInjectable = getInjectable({
  id: "volume-snapshot-classes-route-component",

  instantiate: (di) => ({
    route: di.inject(volumeSnapshotClassesRouteInjectable),
    Component: VolumeSnapshotClasses,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default volumeSnapshotClassesRouteComponentInjectable;
