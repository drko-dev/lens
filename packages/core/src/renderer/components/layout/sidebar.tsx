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

interface Dependencies {
  sidebarItems: IComputedValue<HierarchicalSidebarItem[]>;
  entityRegistry: CatalogEntityRegistry;
  activeTheme: IComputedValue<LensTheme>;
}

const NonInjectedSidebar = observer(({ sidebarItems, entityRegistry, activeTheme }: Dependencies) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isNovaKube = activeTheme.get().name === novakubeThemeName;
  const searching = isNovaKube && searchOpen && query.trim().length > 0;
  const items = searching ? filterNavigatorItems(sidebarItems.get(), query) : sidebarItems.get();

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

      <div className={`${styles.sidebarNav} sidebar-active-status`}>
        {items.map(item => <SidebarItem item={item} key={item.id} forceExpanded={searching} />)}
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
  }),
});

Sidebar.displayName = "Sidebar";
