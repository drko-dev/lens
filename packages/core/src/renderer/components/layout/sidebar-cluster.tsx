/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./sidebar-cluster.module.scss";
import { observable } from "mobx";
import React, { useState } from "react";
import { broadcastMessage } from "../../../common/ipc";
import type { CatalogEntity, CatalogEntityContextMenu } from "../../api/catalog-entity";
import { IpcRendererNavigationEvents } from "../../../common/ipc/navigation-events";
import { Avatar } from "../avatar";
import { Icon } from "../icon";
import { Menu, MenuItem } from "../menu";
import { Tooltip } from "@openlens/tooltip";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import type { VisitEntityContextMenu } from "../../../common/catalog/visit-entity-context-menu.injectable";
import visitEntityContextMenuInjectable from "../../../common/catalog/visit-entity-context-menu.injectable";
import type { Navigate } from "../../navigation/navigate.injectable";
import type { NormalizeCatalogEntityContextMenu } from "../../catalog/normalize-menu-item.injectable";
import navigateInjectable from "../../navigation/navigate.injectable";
import normalizeCatalogEntityContextMenuInjectable from "../../catalog/normalize-menu-item.injectable";
import type { ActiveHotbarModel } from "../../../features/hotbar/storage/common/toggling.injectable";
import activeHotbarInjectable from "../../../features/hotbar/storage/common/toggling.injectable";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";
import { resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import { EnvironmentBadge } from "../environment-badge";
import { cssNames } from "@openlens/utilities";

export interface SidebarClusterProps {
  clusterEntity: CatalogEntity | null | undefined;
}

interface Dependencies {
  navigate: Navigate;
  normalizeMenuItem: NormalizeCatalogEntityContextMenu;
  visitEntityContextMenu: VisitEntityContextMenu;
  entityInActiveHotbar: ActiveHotbarModel;
  getClusterById: GetClusterById;
}

const NonInjectedSidebarCluster = observer(({
  clusterEntity,
  visitEntityContextMenu: onContextMenuOpen,
  navigate,
  normalizeMenuItem,
  entityInActiveHotbar,
  getClusterById,
}: Dependencies & SidebarClusterProps) => {
  const [menuItems] = useState(observable.array<CatalogEntityContextMenu>());
  const [opened, setOpened] = useState(false );

  if (!clusterEntity) {
    // render a Loading version of the SidebarCluster
    return (
      <div className={styles.SidebarCluster}>
        <Avatar
          title="??"
          background="var(--halfGray)"
          size={40}
          className={styles.loadingAvatar}
        />
        <div className={styles.loadingClusterName} />
      </div>
    );
  }

  const onMenuOpen = () => {
    const title = entityInActiveHotbar.hasEntity(clusterEntity.getId())
      ? "Remove from Hotbar"
      : "Add to Hotbar";
    const onClick = () => entityInActiveHotbar.toggleEntity(clusterEntity);

    menuItems.replace([{ title, onClick }]);
    onContextMenuOpen(clusterEntity, {
      menuItems,
      navigate: (url, forceMainFrame = true) => {
        if (forceMainFrame) {
          broadcastMessage(IpcRendererNavigationEvents.NAVIGATE_IN_APP, url);
        } else {
          navigate(url);
        }
      },
    });

    toggle();
  };

  const onKeyDown = (evt: React.KeyboardEvent<HTMLDivElement>) => {
    if (evt.code == "Space") {
      toggle();
    }
  };

  const toggle = () => {
    setOpened(!opened);
  };

  const id = `cluster-${clusterEntity.getId()}`;
  const tooltipId = `tooltip-${id}`;

  const cluster = isKubernetesCluster(clusterEntity)
    ? getClusterById(clusterEntity.getId())
    : undefined;

  const envConfig = isKubernetesCluster(clusterEntity)
    ? resolveClusterEnvironment({ preferences: cluster?.preferences, spec: { environment: clusterEntity.spec.environment, customEnvironmentName: clusterEntity.spec.customEnvironmentName }})
    : undefined;
  const isProd = envConfig?.isProduction === true;

  const alias = cluster?.preferences.clusterAlias || cluster?.preferences.clusterName;
  const mainTitle = alias || clusterEntity.getName();
  const contextName = cluster?.contextName.get();

  return (
    <div
      id={id}
      className={cssNames(styles.SidebarCluster, {
        [styles.isProductionSidebar]: isProd,
      })}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="menubar"
      data-testid="sidebar-cluster-dropdown"
    >
      <Avatar
        title={mainTitle}
        colorHash={`${mainTitle}-${clusterEntity.metadata.source}`}
        size={40}
        src={clusterEntity.spec.icon?.src}
        background={clusterEntity.spec.icon?.background || (envConfig && envConfig.id !== "none" ? `var(${envConfig.cssVar})` : undefined)}
        className={styles.avatar}
      >
        {clusterEntity.spec.icon?.material ? (
          <Icon material={clusterEntity.spec.icon.material} />
        ) : undefined}
      </Avatar>

      <div className={styles.clusterInfoWrapper}>
        <div className={styles.clusterName} id={tooltipId}>
          {mainTitle}
        </div>
        {alias && contextName && (
          <div className={styles.clusterContextName} title={contextName}>
            {contextName}
          </div>
        )}
        <div className={styles.badgeRow}>
          {envConfig && <EnvironmentBadge environment={envConfig} size="md" />}
        </div>
      </div>

      <Tooltip targetId={tooltipId}>
        {isProd ? `[PRODUCTION] ${mainTitle}` : mainTitle}
        {contextName ? ` (${contextName})` : ""}
      </Tooltip>
      <Icon material="arrow_drop_down" className={styles.dropdown} />
      <Menu
        usePortal
        htmlFor={id}
        isOpen={opened}
        open={onMenuOpen}
        closeOnClickItem
        closeOnClickOutside
        close={toggle}
        className={styles.menu}
      >
        {
          menuItems
            .map(normalizeMenuItem)
            .map((menuItem) => (
              <MenuItem key={menuItem.title} onClick={menuItem.onClick}>
                {menuItem.title}
              </MenuItem>
            ))
        }
      </Menu>
    </div>
  );
});

export const SidebarCluster = withInjectables<Dependencies, SidebarClusterProps>(NonInjectedSidebarCluster, {
  getProps: (di, props) => ({
    ...props,
    visitEntityContextMenu: di.inject(visitEntityContextMenuInjectable),
    navigate: di.inject(navigateInjectable),
    normalizeMenuItem: di.inject(normalizeCatalogEntityContextMenuInjectable),
    entityInActiveHotbar: di.inject(activeHotbarInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
  }),
});
