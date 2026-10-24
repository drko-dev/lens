/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import createVolumeSnapshotDialogStateInjectable, { type CreateVolumeSnapshotRequest } from "./state.injectable";

export type OpenCreateVolumeSnapshotDialog = (request: Omit<CreateVolumeSnapshotRequest, "clusterId" | "clusterName">) => void;

const openCreateVolumeSnapshotDialogInjectable = getInjectable({
  id: "open-create-volume-snapshot-dialog",

  instantiate: (di): OpenCreateVolumeSnapshotDialog => {
    const state = di.inject(createVolumeSnapshotDialogStateInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);

    return ({ pvc }) => {
      state.set({
        pvc,
        clusterId: hostedCluster?.id ?? "unknown",
        clusterName: hostedCluster?.name.get() ?? "unknown",
      });
    };
  },
});

export default openCreateVolumeSnapshotDialogInjectable;
