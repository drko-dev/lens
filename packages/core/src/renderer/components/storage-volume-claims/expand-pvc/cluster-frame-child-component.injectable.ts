/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { PvcExpandDialog } from "./dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const pvcExpandDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "pvc-expand-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "pvc-expand-dialog",
    shouldRender: computed(() => true),
    Component: PvcExpandDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default pvcExpandDialogClusterFrameChildComponentInjectable;
