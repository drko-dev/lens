/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ArgoApplication, ArgoApplicationApi, ArgoApplicationData } from "../../../common/k8s-api/endpoints/argocd.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class ArgoApplicationStore extends KubeObjectStore<
  ArgoApplication,
  ArgoApplicationApi,
  ArgoApplicationData
> {
}
