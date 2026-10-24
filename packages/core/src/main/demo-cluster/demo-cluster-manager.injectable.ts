/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import directoryForUserDataInjectable from "../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import addClusterInjectable from "../../features/cluster/storage/common/add.injectable";
import clustersStateInjectable from "../../features/cluster/storage/common/state.injectable";
import { DemoClusterManager } from "./demo-cluster-manager";

const demoClusterManagerInjectable = getInjectable({
  id: "demo-cluster-manager",

  instantiate: (di) => new DemoClusterManager({
    directoryForUserData: di.inject(directoryForUserDataInjectable),
    addCluster: di.inject(addClusterInjectable),
    clustersState: di.inject(clustersStateInjectable),
  }),
});

export default demoClusterManagerInjectable;
