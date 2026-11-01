/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import statefulSetStoreInjectable from "../workloads-statefulsets/store.injectable";
import daemonSetStoreInjectable from "../workloads-daemonsets/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import kubetailStreamClientInjectable from "./kubetail-stream-client.injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import hostedClusterIdInjectable from "../../cluster-frame-context/hosted-cluster-id.injectable";
import createStorageInjectable from "../../utils/create-storage/create-storage.injectable";
import { KubetailStore } from "./kubetail-store";

const kubetailStoreInjectable = getInjectable({
  id: "kubetail-store",
  instantiate: (di) => new KubetailStore({
    deploymentStore: di.inject(deploymentStoreInjectable),
    statefulSetStore: di.inject(statefulSetStoreInjectable),
    daemonSetStore: di.inject(daemonSetStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    streamClient: di.inject(kubetailStreamClientInjectable),
    clusterContext: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
    hostedClusterId: di.inject(hostedClusterIdInjectable),
    createStorage: di.inject(createStorageInjectable),
  }),
});

export default kubetailStoreInjectable;
