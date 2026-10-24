/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { CreateVolumeSnapshotDialog } from "./dialog";
import { clusterFrameChildComponentInjectionToken } from "../../../frames/cluster-frame/cluster-frame-child-component-injection-token";

const createVolumeSnapshotDialogClusterFrameChildComponentInjectable = getInjectable({
  id: "create-volume-snapshot-dialog-cluster-frame-child-component",

  instantiate: () => ({
    id: "create-volume-snapshot-dialog",
    shouldRender: computed(() => true),
    Component: CreateVolumeSnapshotDialog,
  }),

  injectionToken: clusterFrameChildComponentInjectionToken,
});

export default createVolumeSnapshotDialogClusterFrameChildComponentInjectable;
