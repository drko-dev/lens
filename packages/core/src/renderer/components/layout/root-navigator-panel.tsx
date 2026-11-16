/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./root-navigator-panel.scss";
import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { CatalogEntityRegistry } from "../../api/catalog/entity/registry";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import currentPathInjectable from "../../routes/current-path.injectable";
import { Icon } from "../icon";
import { NavigatorClusterRow, resolveConfiguredClusterFallbackColor } from "./navigator-cluster-row";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import clustersInjectable from "../../../features/cluster/storage/common/clusters.injectable";
import type { Cluster } from "../../../common/cluster/cluster";

interface Dependencies {
  entityRegistry: CatalogEntityRegistry;
  currentPath: IComputedValue<string>;
  getClusterById: GetClusterById;
  clusters: IComputedValue<Cluster[]>;
}

const isRootNavigatorRoute = (path: string) =>
  /^\/(welcome|preferences|extensions|entity\/[^/]+\/settings|add-cluster|catalog|release-notes)(\/|$)/.test(path);

/** Persistent Navigator column of the root frame, aligned with Lens 2026 unified shell. */
const NonInjectedRootNavigatorPanel = observer(({ entityRegistry, currentPath, getClusterById, clusters: clusterStoreList }: Dependencies) => {
  if (!isRootNavigatorRoute(currentPath.get())) {
    return null;
  }

  const clusterRecords = clusterStoreList.get();
  const clusters = entityRegistry.getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster");

  return (
    <nav
      className="RootNavigatorPanel"
      data-testid="root-navigator-panel"
      aria-label="Navigator">
      <div className="root-navigator-header">
        <div className="root-navigator-selector" data-testid="root-navigator-selector">
          <span className="root-navigator-selector-label">Home</span>
          <Icon material="arrow_drop_down" className="root-navigator-selector-caret" />
        </div>
      </div>
      <div className="root-navigator-tree">
        {clusters.length > 0 && (
          <div className="navigator-clusters-heading" data-testid="navigator-clusters-heading">Kubernetes Clusters</div>
        )}
        {clusters.map(entity => (
          <NavigatorClusterRow
            key={entity.getId()}
            entity={entity}
            cluster={getClusterById(entity.getId())}
            fallbackColor={resolveConfiguredClusterFallbackColor(entity, clusterRecords, clusters)}
            onRun={e => entityRegistry.onRun(e)} />
        ))}
      </div>
    </nav>
  );
});

export const RootNavigatorPanel = withInjectables<Dependencies>(NonInjectedRootNavigatorPanel, {
  getProps: di => ({
    entityRegistry: di.inject(catalogEntityRegistryInjectable),
    currentPath: di.inject(currentPathInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
    clusters: di.inject(clustersInjectable),
  }),
});
