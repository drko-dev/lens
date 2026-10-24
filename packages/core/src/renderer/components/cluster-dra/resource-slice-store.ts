/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ResourceSlice, ResourceSliceApi, ResourceSliceData } from "../../../common/k8s-api/endpoints/resource-dra.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class ResourceSliceStore extends KubeObjectStore<
  ResourceSlice,
  ResourceSliceApi,
  ResourceSliceData
> {
}
