/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";
import type { VolumeSnapshotClassData } from "@openlens/kube-object";
import { VolumeSnapshotClass } from "@openlens/kube-object";

export class VolumeSnapshotClassApi extends KubeApi<VolumeSnapshotClass, VolumeSnapshotClassData> {
  constructor(deps: KubeApiDependencies, opts?: DerivedKubeApiOptions) {
    super(deps, {
      ...opts ?? {},
      objectConstructor: VolumeSnapshotClass,
    });
  }
}
