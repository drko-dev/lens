/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { GRPCRoute, GRPCRouteApi, GRPCRouteData } from "../../../common/k8s-api/endpoints/gateway.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class GRPCRouteStore extends KubeObjectStore<GRPCRoute, GRPCRouteApi, GRPCRouteData> {
}
