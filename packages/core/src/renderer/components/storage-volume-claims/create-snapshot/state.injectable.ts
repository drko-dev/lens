/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { IObservableValue } from "mobx";
import { observable } from "mobx";
import type { PersistentVolumeClaim } from "@openlens/kube-object";

export interface CreateVolumeSnapshotRequest {
  pvc: PersistentVolumeClaim;
  clusterId: string;
  clusterName: string;
}

const createVolumeSnapshotDialogStateInjectable = getInjectable({
  id: "create-volume-snapshot-dialog-state",

  instantiate: (): IObservableValue<CreateVolumeSnapshotRequest | undefined> => observable.box(),
});

export default createVolumeSnapshotDialogStateInjectable;
