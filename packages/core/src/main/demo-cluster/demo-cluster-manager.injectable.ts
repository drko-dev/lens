/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import directoryForKubeConfigsInjectable from "../../common/app-paths/directory-for-kube-configs/directory-for-kube-configs.injectable";
import addClusterInjectable from "../../features/cluster/storage/common/add.injectable";
import clustersStateInjectable from "../../features/cluster/storage/common/state.injectable";
import { DemoClusterManager } from "./demo-cluster-manager";

const demoClusterManagerInjectable = getInjectable({
  id: "demo-cluster-manager",

  instantiate: (di) => new DemoClusterManager({
    directoryForKubeConfigs: di.inject(directoryForKubeConfigsInjectable),
    addCluster: di.inject(addClusterInjectable),
    clustersState: di.inject(clustersStateInjectable),
  }),
});

export default demoClusterManagerInjectable;
