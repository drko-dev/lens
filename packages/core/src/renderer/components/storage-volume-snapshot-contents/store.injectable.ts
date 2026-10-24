/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import volumeSnapshotContentApiInjectable from "../../../common/k8s-api/endpoints/volume-snapshot-content.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForClusterScopedResourcesInjectable from "../../cluster-frame-context/for-cluster-scoped-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { VolumeSnapshotContentStore } from "./store";

const volumeSnapshotContentStoreInjectable = getInjectable({
  id: "volume-snapshot-content-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "volumeSnapshotContentStore is only available in certain environments");

    const api = di.inject(volumeSnapshotContentApiInjectable);

    return new VolumeSnapshotContentStore({
      context: di.inject(clusterFrameContextForClusterScopedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default volumeSnapshotContentStoreInjectable;
