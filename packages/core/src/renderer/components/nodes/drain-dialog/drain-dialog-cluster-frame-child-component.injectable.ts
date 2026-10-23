/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { DrainNodeDialog } from "./drain-dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const drainNodeDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "drain-node-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "drain-node-dialog",
    shouldRender: computed(() => true),
    Component: DrainNodeDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default drainNodeDialogClusterFrameChildComponentInjectable;
