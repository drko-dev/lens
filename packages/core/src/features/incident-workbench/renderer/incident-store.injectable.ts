/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { reaction, type IReactionDisposer } from "mobx";
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
      const initialCtx = activeClusterContext.get();
      if (initialCtx.clusterId) {
        store.setActiveClusterContext(initialCtx.clusterId, initialCtx.namespace);
      }

      // H8.8-05-R4 (P0-A): Follow cluster context transitions dynamically with safe disposer
      const disposer: IReactionDisposer = reaction(
        () => {
          const ctx = activeClusterContext.get();
          return {
            clusterId: ctx.clusterId ?? null,
            namespace: ctx.namespace ?? null,
          };
        },
        ({ clusterId, namespace }) => {
          store.setActiveClusterContext(clusterId, namespace);
        },
        { fireImmediately: false },
      );

      store.registerDisposer(disposer);
    } catch {
      // Unit test environments without cluster context injectable
    }

    return store;
  },
});

export default incidentStoreInjectable;
