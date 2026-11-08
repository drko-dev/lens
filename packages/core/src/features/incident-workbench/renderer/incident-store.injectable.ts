/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import ipcRendererInjectable from "../../../renderer/utils/channel/ipc-renderer.injectable";
import { IncidentStore } from "./incident-store";
import activeIncidentClusterContextInjectable from "./active-incident-cluster-context.injectable";

const incidentStoreInjectable = getInjectable({
  id: "incident-store",

  instantiate: (di) => {
    let ipc;

    try {
      ipc = di.inject(ipcRendererInjectable);
    } catch {
      ipc = {
        invoke: async () => [],
      };
    }

    const store = new IncidentStore(ipc);

    try {
      const activeClusterContext = di.inject(activeIncidentClusterContextInjectable);
      const ctx = activeClusterContext.get();
      if (ctx.clusterId) {
        store.setActiveClusterContext(ctx.clusterId, ctx.namespace);
      }
    } catch {
      // Unit test environments without cluster context injectable
    }

    return store;
  },
});

export default incidentStoreInjectable;
