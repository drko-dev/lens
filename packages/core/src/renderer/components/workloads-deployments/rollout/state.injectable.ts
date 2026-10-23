/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";
import type { Deployment } from "@openlens/kube-object";

export interface RolloutRollbackRequest {
  deployment: Deployment;
  preferredRevision?: number;
  clusterId: string;
  clusterName: string;
}

const rolloutRollbackDialogStateInjectable = getInjectable({
  id: "rollout-rollback-dialog-state",
  instantiate: () => observable.box<RolloutRollbackRequest | undefined>(),
});

export default rolloutRollbackDialogStateInjectable;
