/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import pvcExpandDialogStateInjectable, { type PvcExpandRequest } from "./state.injectable";

export type OpenPvcExpandDialog = (request: Omit<PvcExpandRequest, "clusterId" | "clusterName">) => void;

const openPvcExpandDialogInjectable = getInjectable({
  id: "open-pvc-expand-dialog",

  instantiate: (di): OpenPvcExpandDialog => {
    const state = di.inject(pvcExpandDialogStateInjectable);
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

export default openPvcExpandDialogInjectable;
