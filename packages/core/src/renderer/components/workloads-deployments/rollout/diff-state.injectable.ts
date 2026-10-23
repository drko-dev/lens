/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";
import type { Deployment } from "@openlens/kube-object";
import type { DeploymentRevision } from "./revisions";

export interface RevisionDiffRequest {
  deployment: Deployment;
  revision: DeploymentRevision;
  clusterId: string;
  clusterName: string;
}

const revisionDiffDialogStateInjectable = getInjectable({
  id: "revision-diff-dialog-state",
  instantiate: () => observable.box<RevisionDiffRequest | undefined>(),
});

export default revisionDiffDialogStateInjectable;
