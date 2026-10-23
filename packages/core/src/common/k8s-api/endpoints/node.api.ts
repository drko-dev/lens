/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Node } from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies, ResourceDescriptor } from "../kube-api";
import { KubeApi } from "../kube-api";

export class NodeApi extends KubeApi<Node> {
  constructor(deps: KubeApiDependencies, opts?: DerivedKubeApiOptions) {
    super(deps, {
      ...opts ?? {},
      objectConstructor: Node,
    });
  }

  cordon(params: ResourceDescriptor) {
    return this.patch(params, {
      spec: {
        unschedulable: true,
      },
    }, "strategic");
  }

  uncordon(params: ResourceDescriptor) {
    return this.patch(params, {
      spec: {
        unschedulable: false,
      },
    }, "strategic");
  }
}
