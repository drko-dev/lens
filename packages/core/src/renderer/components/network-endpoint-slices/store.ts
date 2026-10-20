/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { EndpointSlice, EndpointSliceApi, EndpointSliceData } from "../../../common/k8s-api/endpoints/endpoint-slice.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class EndpointSliceStore extends KubeObjectStore<EndpointSlice, EndpointSliceApi, EndpointSliceData> {
  getByService(serviceName: string, namespace?: string): EndpointSlice[] {
    return this.items.filter(slice => {
      const matchName = slice.getServiceName() === serviceName;
      const matchNs = namespace ? slice.getNs() === namespace : true;

      return matchName && matchNs;
    });
  }
}
