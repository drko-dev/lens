/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { RolloutRollbackDialog } from "./dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const rolloutRollbackDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "rollout-rollback-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "rollout-rollback-dialog",
    shouldRender: computed(() => true),
    Component: RolloutRollbackDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default rolloutRollbackDialogClusterFrameChildComponentInjectable;
