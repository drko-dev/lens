/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Deployment } from "@openlens/kube-object";
import type { DeploymentRevision } from "./revisions";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import revisionDiffDialogStateInjectable from "./diff-state.injectable";

export type OpenRevisionDiffDialog = (request: {
  deployment: Deployment;
  revision: DeploymentRevision;
}) => void;

const openRevisionDiffDialogInjectable = getInjectable({
  id: "open-revision-diff-dialog",
  instantiate: (di): OpenRevisionDiffDialog => {
    const state = di.inject(revisionDiffDialogStateInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);

    return request => state.set({
      ...request,
      clusterId: hostedCluster?.id ?? "unknown",
      clusterName: hostedCluster?.name.get() ?? "unknown",
    });
  },
});

export default openRevisionDiffDialogInjectable;
