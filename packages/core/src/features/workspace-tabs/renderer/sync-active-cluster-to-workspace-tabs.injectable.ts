/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { reaction } from "mobx";
import matchedClusterIdInjectable from "../../../renderer/navigation/matched-cluster-id.injectable";
import currentlyInClusterFrameInjectable from "../../../renderer/routes/currently-in-cluster-frame.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import initClusterStoreInjectable from "../../../features/cluster/storage/renderer/init.injectable";
import workspaceTabsStoreInjectable from "./workspace-tabs-store.injectable";
import workspacePersistenceStoreInjectable from "./workspace-persistence-store.injectable";
import workspaceTabsFeatureFlagInjectable from "../common/workspace-tabs-feature-flag.injectable";
import { beforeFrameStartsSecondInjectionToken } from "../../../renderer/before-frame-starts/tokens";

const syncActiveClusterToWorkspaceTabsInjectable = getInjectable({
  id: "sync-active-cluster-to-workspace-tabs",

  instantiate: (di) => {
    const isClusterFrame = di.inject(currentlyInClusterFrameInjectable);

    return {
      run: () => {
        if (isClusterFrame) return;

        const matchedClusterId = di.inject(matchedClusterIdInjectable);
        const getClusterById = di.inject(getClusterByIdInjectable);
        const workspaceTabsStore = di.inject(workspaceTabsStoreInjectable);
        const featureFlag = di.inject(workspaceTabsFeatureFlagInjectable);
        const persistenceStore = di.inject(workspacePersistenceStoreInjectable);

        if (featureFlag.isEnabled) {
          persistenceStore.initAndRestore();
          persistenceStore.startObserving();
        }

        let initialRouteSync = true;

        reaction(
          () => {
            if (!featureFlag.isEnabled) return undefined;

            const clusterId = matchedClusterId.get();

            if (!clusterId) return undefined;

            return getClusterById(clusterId) ? clusterId : null;
          },
          (clusterId) => {
            const preserveRestoredFocus = initialRouteSync && clusterId === undefined && persistenceStore.isHydrated;
            const routeClusterId = clusterId === null ? matchedClusterId.get() : clusterId;
            const isRestoredWorkspaceRoute =
              initialRouteSync &&
              persistenceStore.isHydrated &&
              Boolean(routeClusterId && workspaceTabsStore.isRestoredTabInactive(routeClusterId));

            initialRouteSync = false;

            if (isRestoredWorkspaceRoute) return;

            workspaceTabsStore.syncRoute(
              routeClusterId,
              { preserveSelection: preserveRestoredFocus },
            );
          },
          { fireImmediately: true },
        );
      },
      runAfter: initClusterStoreInjectable,
    };
  },

  injectionToken: beforeFrameStartsSecondInjectionToken,
});

export default syncActiveClusterToWorkspaceTabsInjectable;
