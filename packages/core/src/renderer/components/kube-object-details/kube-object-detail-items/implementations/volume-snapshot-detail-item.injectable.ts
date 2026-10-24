/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { kubeObjectDetailItemInjectionToken } from "../kube-object-detail-item-injection-token";
import { computed } from "mobx";
import { VolumeSnapshotDetails } from "../../../storage-volume-snapshots";
import { kubeObjectMatchesToKindAndApiVersion } from "../kube-object-matches-to-kind-and-api-version";
import currentKubeObjectInDetailsInjectable from "../../current-kube-object-in-details.injectable";

const volumeSnapshotDetailItemInjectable = getInjectable({
  id: "volume-snapshot-detail-item",

  instantiate: (di) => {
    const kubeObject = di.inject(currentKubeObjectInDetailsInjectable);

    return {
      Component: VolumeSnapshotDetails,
      enabled: computed(() => isVolumeSnapshot(kubeObject.value.get()?.object)),
      orderNumber: 10,
    };
  },

  injectionToken: kubeObjectDetailItemInjectionToken,
});

export const isVolumeSnapshot = kubeObjectMatchesToKindAndApiVersion(
  "VolumeSnapshot",
  ["snapshot.storage.k8s.io/v1"],
);

export default volumeSnapshotDetailItemInjectable;
