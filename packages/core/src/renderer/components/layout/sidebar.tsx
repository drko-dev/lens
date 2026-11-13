/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./sidebar.module.scss";

import React, { useState } from "react";
import { Icon } from "../icon";
import { filterNavigatorItems } from "./sidebar-filter";
import type { LensTheme } from "../../themes/lens-theme";
import activeThemeInjectable from "../../themes/active.injectable";
import { novakubeThemeName } from "../../themes/novakube.injectable";
import { observer } from "mobx-react";
import { cssNames } from "@openlens/utilities";
import { SidebarItem } from "./sidebar-item";
import type { CatalogEntityRegistry } from "../../api/catalog/entity/registry";
import { SidebarCluster } from "./sidebar-cluster";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { HierarchicalSidebarItem } from "./sidebar-items.injectable";
import sidebarItemsInjectable from "./sidebar-items.injectable";
import type { IComputedValue } from "mobx";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";
import { resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import randomColor from "randomcolor";

interface Dependencies {
  sidebarItems: IComputedValue<HierarchicalSidebarItem[]>;
  entityRegistry: CatalogEntityRegistry;
  activeTheme: IComputedValue<LensTheme>;
  getClusterById: GetClusterById;
}

const getLensOverviewIcon = () => <Icon material="dashboard" />;

const NonInjectedSidebar = observer(({ sidebarItems, entityRegistry, activeTheme, getClusterById }: Dependencies) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clusterTreeExpanded, setClusterTreeExpanded] = useState(true);
  const allClusters = entityRegistry.getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster");
  const activeClusterIndex = allClusters.findIndex(entity => entity.getId() === entityRegistry.activeEntity?.getId());
  const renderOtherCluster = (entity: (typeof allClusters)[number]) => (
    <button
      type="button"
      key={entity.getId()}
      className="navigator-cluster-root navigator-cluster-other"
      data-testid="navigator-cluster-other"
      aria-label={`Open ${entity.getName()}`}
      onClick={() => entityRegistry.onRun(entity)}
      style={{ "--nv-active-cluster-color": entity.spec.icon?.background } as React.CSSProperties}
    >
      <span className="navigator-cluster-pin" aria-hidden="true" />
      <span className="navigator-cluster-label" title={entity.getName()}>{entity.getName()}</span>
    </button>
  );
  const isNovaKube = activeTheme.get().name === novakubeThemeName;
  // Match the official Lens tree guide, using the active cluster pin color
  // rather than hardcoding Lens magenta across every NovaKube cluster.
  const activeEntity = entityRegistry.activeEntity;
  const activeCluster = activeEntity && isKubernetesCluster(activeEntity) ? getClusterById(activeEntity.getId()) : undefined;
  const envConfig = activeEntity && isKubernetesCluster(activeEntity)
    ? resolveClusterEnvironment({
      preferences: activeCluster?.preferences,
      spec: {
        environment: activeEntity.spec.environment,
        customEnvironmentName: activeEntity.spec.customEnvironmentName,
      },
    })
    : undefined;
  const title = activeCluster?.preferences.clusterAlias
    || activeCluster?.preferences.clusterName
    || activeEntity?.getName();
  const fallbackPinColor = activeEntity && title && !activeEntity.spec.icon?.src
    ? randomColor({ seed: `${title}-${activeEntity.metadata.source}`, luminosity: "dark" })
    : undefined;
  const clusterAccent = activeEntity?.spec?.icon?.background
    || (envConfig && envConfig.id !== "none" ? `var(${envConfig.cssVar})` : undefined)
    || fallbackPinColor;
  const searching = isNovaKube && searchOpen && query.trim().length > 0;
  const showTree = !isNovaKube || clusterTreeExpanded || searching;
  const connected = activeCluster?.online.get() === true && activeCluster?.ready.get() === true;
  // In Lens the top-level cluster overview is called "Overview", whereas
  // the original OpenLens registration calls the same destination "Cluster".
  // Adapt presentation in NovaKube only; reuse its real route/action and
  // let the Navigator search index the displayed label.
  const themeItems = isNovaKube
    ? sidebarItems.get().map(item => item.id === "cluster-overview"
      ? { ...item, title: "Overview", getIcon: getLensOverviewIcon }
      : item)
    : sidebarItems.get();
  const items = searching ? filterNavigatorItems(themeItems, query) : themeItems;

  return (
    <div className={cssNames("flex flex-col")} data-testid="cluster-sidebar">
      {isNovaKube ? (
        <>
          <div data-testid="navigator-selector-row">
            <SidebarCluster clusterEntity={entityRegistry.activeEntity} />
            <button
              type="button"
              data-testid="navigator-search-toggle"
              aria-label={searchOpen ? "Close navigator search" : "Search navigator"}
              aria-expanded={searchOpen}
              onClick={() => { setSearchOpen(!searchOpen); setQuery(""); }}
            >
              <Icon material="search" />
            </button>
          </div>
          {searchOpen && (
            <div data-testid="navigator-search-bar">
              <input
                autoFocus
                type="search"
                aria-label="Filter navigator resources"
                placeholder="Search navigator..."
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Escape") { setQuery(""); setSearchOpen(false); }
                }}
              />
            </div>
          )}
        </>
      ) : <SidebarCluster clusterEntity={entityRegistry.activeEntity} />}

      {isNovaKube && allClusters.length > 0 && (
        <div className="navigator-clusters-heading" data-testid="navigator-clusters-heading">Kubernetes Clusters</div>
      )}
      {isNovaKube && allClusters.slice(0, Math.max(activeClusterIndex, 0)).map(renderOtherCluster)}

      {isNovaKube && activeEntity && (
        <button
          type="button"
          className="navigator-cluster-root"
          data-testid="navigator-cluster-root-toggle"
          aria-expanded={clusterTreeExpanded || searching}
          aria-label={`${clusterTreeExpanded || searching ? "Collapse" : "Expand"} ${title || "cluster"} resources`}
          onClick={() => setClusterTreeExpanded(expanded => !expanded)}
          style={clusterAccent ? { "--nv-active-cluster-color": clusterAccent } as React.CSSProperties : undefined}
        >
          <Icon material={clusterTreeExpanded || searching ? "keyboard_arrow_down" : "keyboard_arrow_right"} />
          <span className="navigator-cluster-pin" aria-hidden="true" />
          <span className="navigator-cluster-label" title={title}>{title || "Cluster"}</span>
          <span
            className="navigator-cluster-status"
            data-connected={connected}
            title={connected ? "Cluster connected and ready" : "Cluster connection not confirmed"}
            aria-hidden="true"
          />
        </button>
      )}

      <div
        className={`${styles.sidebarNav} sidebar-active-status`}
        data-testid="navigator-resource-tree"
        style={isNovaKube && clusterAccent ? { "--nv-active-cluster-color": clusterAccent } as React.CSSProperties : undefined}
      >
        {showTree && items.map(item => (
          <SidebarItem
            item={item}
            key={item.id}
            forceExpanded={searching}
          />
        ))}
      </div>
      {isNovaKube && allClusters.slice(activeClusterIndex + 1).map(renderOtherCluster)}
    </div>
  );
});

export const Sidebar = withInjectables<Dependencies>(NonInjectedSidebar, {
  getProps: (di, props) => ({
    ...props,
    sidebarItems: di.inject(sidebarItemsInjectable),
    entityRegistry: di.inject(catalogEntityRegistryInjectable),
    activeTheme: di.inject(activeThemeInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
  }),
});

Sidebar.displayName = "Sidebar";

