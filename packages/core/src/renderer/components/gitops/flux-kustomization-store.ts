/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { FluxKustomization, FluxKustomizationApi, FluxKustomizationData } from "../../../common/k8s-api/endpoints/fluxcd.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class FluxKustomizationStore extends KubeObjectStore<
  FluxKustomization,
  FluxKustomizationApi,
  FluxKustomizationData
> {
}
