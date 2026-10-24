/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { shouldShowResourceInjectionToken } from "../../../../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import { frontEndRouteInjectionToken } from "../../../../front-end-route-injection-token";

const volumeSnapshotsRouteInjectable = getInjectable({
  id: "volume-snapshots-route",

  instantiate: (di) => ({
    path: "/volume-snapshots",
    clusterFrame: true,
    isEnabled: di.inject(shouldShowResourceInjectionToken, {
      apiName: "volumesnapshots",
      group: "snapshot.storage.k8s.io",
    }),
  }),

  injectionToken: frontEndRouteInjectionToken,
});

export default volumeSnapshotsRouteInjectable;
