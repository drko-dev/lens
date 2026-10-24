/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { GatewayClass, GatewayClassApi, GatewayClassData } from "../../../common/k8s-api/endpoints/gateway.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class GatewayClassStore extends KubeObjectStore<GatewayClass, GatewayClassApi, GatewayClassData> {
}
