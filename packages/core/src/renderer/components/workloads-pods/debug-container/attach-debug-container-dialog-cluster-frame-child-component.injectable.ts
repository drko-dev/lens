/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { AttachDebugContainerDialog } from "./attach-debug-container-dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const attachDebugContainerDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "attach-debug-container-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "attach-debug-container-dialog",
    shouldRender: computed(() => true),
    Component: AttachDebugContainerDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default attachDebugContainerDialogClusterFrameChildComponentInjectable;
