/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PodDisruptionBudget } from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export class PodDisruptionBudgetApi extends KubeApi<PodDisruptionBudget> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        policy: [
          "v1",
          "v1beta1",
        ],
      },
      ...opts,
      objectConstructor: PodDisruptionBudget,
    });
  }
}
