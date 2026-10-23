/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { RevisionDiffDialog } from "./diff-dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const revisionDiffDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "revision-diff-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "revision-diff-dialog",
    shouldRender: computed(() => true),
    Component: RevisionDiffDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default revisionDiffDialogClusterFrameChildComponentInjectable;
