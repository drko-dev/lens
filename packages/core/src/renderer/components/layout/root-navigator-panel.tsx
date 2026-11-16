/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./root-navigator-panel.scss";
import React, { useState } from "react";
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
import navigateToExtensionsInjectable from "../../../common/front-end-routing/routes/extensions/navigate-to-extensions.injectable";
import navigateToCatalogInjectable from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import navigateToWelcomeInjectable from "../../../common/front-end-routing/routes/welcome/navigate-to-welcome.injectable";

interface Dependencies {
  entityRegistry: CatalogEntityRegistry;
  currentPath: IComputedValue<string>;
  getClusterById: GetClusterById;
  clusters: IComputedValue<Cluster[]>;
  navigateToExtensions: () => void;
  navigateToCatalog: () => void;
  navigateToWelcome: () => void;
}

const isRootNavigatorRoute = (path: string) =>
  /^\/(welcome|preferences|extensions|entity\/[^/]+\/settings|add-cluster|catalog|release-notes)(\/|$)/.test(path);

/** Persistent Navigator column of the root frame, aligned with Lens 2026 unified shell. */
const NonInjectedRootNavigatorPanel = observer(({
  entityRegistry,
  currentPath,
  getClusterById,
  clusters: clusterStoreList,
  navigateToExtensions,
  navigateToCatalog,
  navigateToWelcome,
}: Dependencies) => {
  const [bookmarksOpen, setBookmarksOpen] = useState(true);
  const [extensionsOpen, setExtensionsOpen] = useState(true);
  const [localKubeconfigsOpen, setLocalKubeconfigsOpen] = useState(true);

  if (!isRootNavigatorRoute(currentPath.get())) {
    return null;
  }

  const path = currentPath.get();
  const clusterRecords = clusterStoreList.get();
  const clusters = entityRegistry.getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster");
  const cloudClusters = clusters.filter(e => e.metadata.source && !["local", "kubeconfig"].includes(e.metadata.source));
  const localClusters = clusters.filter(e => !cloudClusters.includes(e));

  return (
    <nav
      className="RootNavigatorPanel"
      data-testid="root-navigator-panel"
      aria-label="Navigator">
      <div className="root-navigator-header">
        <button
          type="button"
          className="root-navigator-selector"
          data-testid="root-navigator-selector"
          onClick={navigateToWelcome}
          title="Go to Home"
        >
          <span className="root-navigator-selector-label">Home</span>
          <Icon material="arrow_drop_down" className="root-navigator-selector-caret" />
        </button>
      </div>
      <div className="root-navigator-tree">
        <button
          type="button"
          className="root-nav-section-header"
          data-testid="root-nav-bookmarks-toggle"
          onClick={() => setBookmarksOpen(v => !v)}
        >
          <Icon material={bookmarksOpen ? "keyboard_arrow_down" : "keyboard_arrow_right"} />
          <Icon material="bookmark_border" />
          <span>Bookmarks</span>
        </button>
        {bookmarksOpen && (
          <div className="root-nav-section-items" data-testid="root-nav-bookmarks">
            <button
              type="button"
              className={`root-nav-leaf ${path.startsWith("/welcome") ? "active" : ""}`}
              data-testid="root-nav-welcome"
              onClick={navigateToWelcome}
            >
              <Icon material="home" />
              <span>Welcome</span>
            </button>
            <button
              type="button"
              className={`root-nav-leaf ${path.startsWith("/catalog") ? "active" : ""}`}
              data-testid="root-nav-catalog"
              onClick={navigateToCatalog}
            >
              <Icon material="apps" />
              <span>Browse Catalog</span>
            </button>
          </div>
        )}

        <button
          type="button"
          className="root-nav-section-header"
          data-testid="root-nav-extensions-toggle"
          onClick={() => setExtensionsOpen(v => !v)}
        >
          <Icon material={extensionsOpen ? "keyboard_arrow_down" : "keyboard_arrow_right"} />
          <Icon material="extension" />
          <span>Extensions</span>
        </button>
        {extensionsOpen && (
          <div className="root-nav-section-items" data-testid="root-nav-extensions">
            <button
              type="button"
              className={`root-nav-leaf ${path.startsWith("/extensions") ? "active" : ""}`}
              data-testid="root-nav-installed-extensions"
              onClick={navigateToExtensions}
            >
              <Icon material="widgets" />
              <span>Installed</span>
            </button>
          </div>
        )}

        {clusters.length > 0 && (
          <div className="navigator-clusters-heading" data-testid="navigator-clusters-heading">Kubernetes Clusters</div>
        )}
        {localClusters.length > 0 && (
          <>
            <button
              type="button"
              className="root-nav-section-header"
              data-testid="root-nav-local-kubeconfigs-toggle"
              onClick={() => setLocalKubeconfigsOpen(v => !v)}
            >
              <Icon material={localKubeconfigsOpen ? "keyboard_arrow_down" : "keyboard_arrow_right"} />
              <Icon material="folder" />
              <span>Local Kubeconfigs</span>
            </button>
            {localKubeconfigsOpen && (
              <div className="root-nav-cluster-list" data-testid="root-nav-local-kubeconfigs">
                {localClusters.map(entity => (
                  <NavigatorClusterRow
                    key={entity.getId()}
                    entity={entity}
                    cluster={getClusterById(entity.getId())}
                    fallbackColor={resolveConfiguredClusterFallbackColor(entity, clusterRecords, clusters)}
                    onRun={e => entityRegistry.onRun(e)} />
                ))}
              </div>
            )}
          </>
        )}
        {cloudClusters.length > 0 && (
          <div className="root-nav-cluster-list" data-testid="root-nav-cloud-clusters">
            <div className="navigator-clusters-heading">Cloud Providers</div>
            {cloudClusters.map(entity => (
              <NavigatorClusterRow
                key={entity.getId()}
                entity={entity}
                cluster={getClusterById(entity.getId())}
                fallbackColor={resolveConfiguredClusterFallbackColor(entity, clusterRecords, clusters)}
                onRun={e => entityRegistry.onRun(e)} />
            ))}
          </div>
        )}
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
    navigateToExtensions: di.inject(navigateToExtensionsInjectable),
    navigateToCatalog: di.inject(navigateToCatalogInjectable),
    navigateToWelcome: di.inject(navigateToWelcomeInjectable),
  }),
});
