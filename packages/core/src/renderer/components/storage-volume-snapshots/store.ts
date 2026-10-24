/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { VolumeSnapshot } from "@openlens/kube-object";
import type { VolumeSnapshotApi } from "../../../common/k8s-api/endpoints";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class VolumeSnapshotStore extends KubeObjectStore<VolumeSnapshot, VolumeSnapshotApi> {}
