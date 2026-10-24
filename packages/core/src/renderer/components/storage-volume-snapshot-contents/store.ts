/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { VolumeSnapshotContent } from "@openlens/kube-object";
import type { VolumeSnapshotContentApi } from "../../../common/k8s-api/endpoints";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class VolumeSnapshotContentStore extends KubeObjectStore<VolumeSnapshotContent, VolumeSnapshotContentApi> {}
