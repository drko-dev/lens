/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Gateway, GatewayApi, GatewayData } from "../../../common/k8s-api/endpoints/gateway.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class GatewayStore extends KubeObjectStore<Gateway, GatewayApi, GatewayData> {
}
