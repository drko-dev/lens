/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./sidebar.module.scss";

import React, { useEffect, useState } from "react";
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
import { NavigatorClusterRow, resolveConfiguredClusterFallbackColor } from "./navigator-cluster-row";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { HierarchicalSidebarItem } from "./sidebar-items.injectable";
import sidebarItemsInjectable from "./sidebar-items.injectable";
import type { IComputedValue } from "mobx";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import clustersInjectable from "../../../features/cluster/storage/common/clusters.injectable";
import type { Cluster } from "../../../common/cluster/cluster";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";
import { broadcastMessage } from "../../../common/ipc";
import { IpcRendererNavigationEvents } from "../../../common/ipc/navigation-events";
import { getConfiguredClusterColor, resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import randomColor from "randomcolor";

interface Dependencies {
  sidebarItems: IComputedValue<HierarchicalSidebarItem[]>;
  entityRegistry: CatalogEntityRegistry;
  activeTheme: IComputedValue<LensTheme>;
  getClusterById: GetClusterById;
  clusters: IComputedValue<Cluster[]>;
}

const getLensOverviewIcon = () => <Icon material="dashboard" />;

const NonInjectedSidebar = observer(({ sidebarItems, entityRegistry, activeTheme, getClusterById, clusters }: Dependencies) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clusterTreeExpanded, setClusterTreeExpanded] = useState(true);
  const clusterList = clusters.get();
  const allClusters = entityRegistry.getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster");
  const renderOtherCluster = (entity: (typeof allClusters)[number]) => (
    <NavigatorClusterRow
      key={entity.getId()}
      entity={entity}
      cluster={getClusterById(entity.getId())}
      fallbackColor={resolveConfiguredClusterFallbackColor(entity, clusterList, allClusters)}
      onRun={e => broadcastMessage(IpcRendererNavigationEvents.NAVIGATE_IN_APP, `/cluster/${e.getId()}`)} />
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
  const clusterAccent = getConfiguredClusterColor(activeCluster?.preferences)
    || activeEntity?.spec?.icon?.background
    || (activeEntity ? resolveConfiguredClusterFallbackColor(activeEntity, clusterList, allClusters) : undefined)
    || (envConfig && envConfig.id !== "none" ? `var(${envConfig.cssVar})` : undefined)
    || fallbackPinColor;
  const searching = isNovaKube && searchOpen && query.trim().length > 0;
  const showTree = !isNovaKube || clusterTreeExpanded || searching;
  const connected = activeCluster?.online.get() === true && activeCluster?.ready.get() === true;

  const activeClusterId = activeEntity?.getId();
  const activeViewTitle = (() => {
    const findActive = (list: HierarchicalSidebarItem[]): string | undefined => {
      for (const item of list) {
        if (!item.isVisible.get()) continue;
        const childTitle = findActive(item.children);
        if (childTitle) return childTitle;
        if (item.isActive.get()) {
          const raw = typeof item.title === "string" ? item.title : String(item.id);
          return raw === "Cluster" ? "Cluster Overview" : raw;
        }
      }
      return undefined;
    };
    return findActive(sidebarItems.get());
  })();

  useEffect(() => {
    if (!activeClusterId || typeof window === "undefined" || window.parent === window) return;
    const concreteAccent = clusterAccent && !clusterAccent.startsWith("var(") ? clusterAccent : undefined;
    window.parent.postMessage({
      type: "novakube:cluster-view-title",
      clusterId: activeClusterId,
      viewTitle: activeViewTitle ?? "Cluster Overview",
      accentColor: concreteAccent,
    }, "*");
  }, [activeClusterId, activeViewTitle, clusterAccent]);
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

      <div
        className="navigator-scroll"
        data-testid="navigator-scroll"
        style={isNovaKube ? undefined : { display: "contents" }}
      >
        {isNovaKube && allClusters.length > 0 && !(activeEntity && (clusterTreeExpanded || searching)) && (
          <div className="navigator-clusters-heading" data-testid="navigator-clusters-heading">Kubernetes Clusters</div>
        )}

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
            <Icon material={clusterTreeExpanded || searching ? "chevron_left" : "chevron_right"} />
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
        {isNovaKube && !(activeEntity && clusterTreeExpanded && !searching) && (
          <>
            <button
              type="button"
              className="navigator-cluster-root"
              data-testid="navigator-back-to-home"
              onClick={() => broadcastMessage(IpcRendererNavigationEvents.NAVIGATE_IN_APP, "/welcome")}
            >
              <Icon material="home" />
              <span className="navigator-cluster-label">Home &amp; Extensions</span>
            </button>
            {allClusters.filter(entity => entity.getId() !== activeEntity?.getId()).map(renderOtherCluster)}
          </>
        )}
      </div>
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
    clusters: di.inject(clustersInjectable),
  }),
});

Sidebar.displayName = "Sidebar";

