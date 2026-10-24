/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import volumeSnapshotApiInjectable from "../../../common/k8s-api/endpoints/volume-snapshot.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { VolumeSnapshotStore } from "./store";

const volumeSnapshotStoreInjectable = getInjectable({
  id: "volume-snapshot-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "volumeSnapshotStore is only available in certain environments");

    const api = di.inject(volumeSnapshotApiInjectable);

    return new VolumeSnapshotStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default volumeSnapshotStoreInjectable;
