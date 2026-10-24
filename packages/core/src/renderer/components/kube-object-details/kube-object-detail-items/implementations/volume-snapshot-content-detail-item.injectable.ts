/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { kubeObjectDetailItemInjectionToken } from "../kube-object-detail-item-injection-token";
import { computed } from "mobx";
import { VolumeSnapshotContentDetails } from "../../../storage-volume-snapshot-contents";
import { kubeObjectMatchesToKindAndApiVersion } from "../kube-object-matches-to-kind-and-api-version";
import currentKubeObjectInDetailsInjectable from "../../current-kube-object-in-details.injectable";

const volumeSnapshotContentDetailItemInjectable = getInjectable({
  id: "volume-snapshot-content-detail-item",

  instantiate: (di) => {
    const kubeObject = di.inject(currentKubeObjectInDetailsInjectable);

    return {
      Component: VolumeSnapshotContentDetails,
      enabled: computed(() => isVolumeSnapshotContent(kubeObject.value.get()?.object)),
      orderNumber: 10,
    };
  },

  injectionToken: kubeObjectDetailItemInjectionToken,
});

export const isVolumeSnapshotContent = kubeObjectMatchesToKindAndApiVersion(
  "VolumeSnapshotContent",
  ["snapshot.storage.k8s.io/v1"],
);

export default volumeSnapshotContentDetailItemInjectable;
