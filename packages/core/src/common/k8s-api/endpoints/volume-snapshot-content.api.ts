/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";
import type { VolumeSnapshotContentData } from "@openlens/kube-object";
import { VolumeSnapshotContent } from "@openlens/kube-object";

export class VolumeSnapshotContentApi extends KubeApi<VolumeSnapshotContent, VolumeSnapshotContentData> {
  constructor(deps: KubeApiDependencies, opts?: DerivedKubeApiOptions) {
    super(deps, {
      ...opts ?? {},
      objectConstructor: VolumeSnapshotContent,
    });
  }
}
