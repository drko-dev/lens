/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Deployment } from "@openlens/kube-object";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import rolloutRollbackDialogStateInjectable from "./state.injectable";

export type OpenRolloutRollbackDialog = (request: {
  deployment: Deployment;
  preferredRevision?: number;
}) => void;

const openRolloutRollbackDialogInjectable = getInjectable({
  id: "open-rollout-rollback-dialog",
  instantiate: (di): OpenRolloutRollbackDialog => {
    const state = di.inject(rolloutRollbackDialogStateInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);

    return ({ deployment, preferredRevision }) => state.set({
      deployment,
      preferredRevision,
      clusterId: hostedCluster?.id ?? "unknown",
      clusterName: hostedCluster?.name.get() ?? "unknown",
    });
  },
});

export default openRolloutRollbackDialogInjectable;
