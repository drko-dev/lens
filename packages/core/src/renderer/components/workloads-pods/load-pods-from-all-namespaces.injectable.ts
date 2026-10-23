/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import showErrorNotificationInjectable from "../notifications/show-error-notification.injectable";
import podStoreInjectable from "./store.injectable";
import type { Pod } from "@openlens/kube-object";
import { ClusterDataLoadError } from "../../utils/cluster-data-load-error";

export type LoadPodsFromAllNamespaces = () => Promise<undefined | Pod[]>;

const loadPodsFromAllNamespacesInjectable = getInjectable({
  id: "load-pods-from-all-namespaces",
  instantiate: (di): LoadPodsFromAllNamespaces => {
    const podStore = di.inject(podStoreInjectable);
    const context = di.inject(clusterFrameContextForNamespacedResourcesInjectable);
    const showErrorNotification = di.inject(showErrorNotificationInjectable);

    return async () => {
      const failures: unknown[] = [];

      const res = await podStore.loadAll({
        namespaces: context.allNamespaces,
        onLoadFailure: error => {
          // `loadAll` swallows per-namespace failures when this callback is supplied and can reset
          // `failedLoading` on partial success, so the failures are collected here instead of
          // trusting mutable store flags after the await.
          failures.push(error);
          showErrorNotification(`Can not load Pods. ${String(error)}`);
        },
      });

      if (failures.length > 0) {
        // Partial means the store did complete a load but at least one namespace failed. A total
        // failure keeps the store unloaded (or in a failed reload of stale contents).
        const partial = Boolean(podStore.isLoaded) && !podStore.failedLoading;

        throw new ClusterDataLoadError("Pods", { partial, errors: failures });
      }

      if (podStore.failedLoading) {
        throw new ClusterDataLoadError("Pods", { partial: false, errors: [podStore.lastError] });
      }

      if (!podStore.isLoaded) {
        throw new ClusterDataLoadError("Pods", { partial: false, errors: ["Pod load did not complete"] });
      }

      return res;
    };
  },
});

export default loadPodsFromAllNamespacesInjectable;
