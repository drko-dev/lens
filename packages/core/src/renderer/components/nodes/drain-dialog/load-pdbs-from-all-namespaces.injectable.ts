/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../cluster-frame-context/for-namespaced-resources.injectable";
import podDisruptionBudgetStoreInjectable from "../../config-pod-disruption-budgets/store.injectable";
import type { PodDisruptionBudget } from "@openlens/kube-object";
import { ClusterDataLoadError } from "../../../utils/cluster-data-load-error";

export type LoadPdbsFromAllNamespaces = () => Promise<undefined | PodDisruptionBudget[]>;

const loadPdbsFromAllNamespacesInjectable = getInjectable({
  id: "load-pdbs-from-all-namespaces",
  instantiate: (di): LoadPdbsFromAllNamespaces => {
    const pdbStore = di.inject(podDisruptionBudgetStoreInjectable);
    const context = di.inject(clusterFrameContextForNamespacedResourcesInjectable);

    return async () => {
      const failures: unknown[] = [];

      const res = await pdbStore.loadAll({
        namespaces: context.allNamespaces,
        onLoadFailure: error => failures.push(error),
      });

      if (failures.length > 0) {
        const partial = Boolean(pdbStore.isLoaded) && !pdbStore.failedLoading;

        throw new ClusterDataLoadError("PodDisruptionBudgets", { partial, errors: failures });
      }

      if (pdbStore.failedLoading) {
        throw new ClusterDataLoadError("PodDisruptionBudgets", { partial: false, errors: [pdbStore.lastError] });
      }

      if (!pdbStore.isLoaded) {
        throw new ClusterDataLoadError("PodDisruptionBudgets", { partial: false, errors: ["PodDisruptionBudget load did not complete"] });
      }

      return res;
    };
  },
});

export default loadPdbsFromAllNamespacesInjectable;
