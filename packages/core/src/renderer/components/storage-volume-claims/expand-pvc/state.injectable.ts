/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { IObservableValue } from "mobx";
import { observable } from "mobx";
import type { PersistentVolumeClaim } from "@openlens/kube-object";

export interface PvcExpandRequest {
  pvc: PersistentVolumeClaim;
  clusterId: string;
  clusterName: string;
}

const pvcExpandDialogStateInjectable = getInjectable({
  id: "pvc-expand-dialog-state",

  instantiate: (): IObservableValue<PvcExpandRequest | undefined> => observable.box(),
});

export default pvcExpandDialogStateInjectable;
