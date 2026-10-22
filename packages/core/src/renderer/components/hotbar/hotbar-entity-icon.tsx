/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./hotbar-entity-icon.module.scss";

import React from "react";
import type { IComputedValue } from "mobx";
import { observable } from "mobx";
import { observer } from "mobx-react";

import type { CatalogCategoryRegistry, CatalogEntity, CatalogEntityContextMenu } from "../../../common/catalog";
import type { IClassName } from "@openlens/utilities";
import { cssNames } from "@openlens/utilities";
import { Icon } from "../icon";
import { HotbarIcon } from "./hotbar-icon";
import { isKubernetesCluster, LensKubernetesClusterStatus } from "../../../common/catalog-entities/kubernetes-cluster";
import type { VisitEntityContextMenu } from "../../../common/catalog/visit-entity-context-menu.injectable";
import { withInjectables } from "@ogre-tools/injectable-react";
import catalogCategoryRegistryInjectable from "../../../common/catalog/category-registry.injectable";
import visitEntityContextMenuInjectable from "../../../common/catalog/visit-entity-context-menu.injectable";
import activeEntityInjectable from "../../api/catalog/entity/active.injectable";
import type { Navigate } from "../../navigation/navigate.injectable";
import navigateInjectable from "../../navigation/navigate.injectable";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { ClusterAppearanceDialog } from "../cluster-settings/cluster-appearance-dialog";
import type { ClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import { resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import { EnvironmentBadge } from "../environment-badge";

export interface HotbarEntityIconProps {
  entity: CatalogEntity;
  index: number;
  errorClass?: IClassName;
  add: (item: CatalogEntity, index: number) => void;
  remove: (uid: string) => void;
  size?: number;
  onClick?: () => void;
  className?: string;
}

interface Dependencies {
  visitEntityContextMenu: VisitEntityContextMenu;
  catalogCategoryRegistry: CatalogCategoryRegistry;
  activeEntity: IComputedValue<CatalogEntity | undefined>;
  navigate: Navigate;
  getClusterById: GetClusterById;
}

@observer
class NonInjectedHotbarEntityIcon extends React.Component<HotbarEntityIconProps & Dependencies> {
  private readonly menuItems = observable.array<CatalogEntityContextMenu>();
  @observable isAppearanceDialogOpen = false;

  private renderKindIcon() {
    const className = styles.badge;
    const category = this.props.catalogCategoryRegistry.getCategoryForEntity(this.props.entity);

    if (!category) {
      return <Icon material="bug_report" className={className} />;
    }

    if (Icon.isSvg(category.metadata.icon)) {
      return <Icon svg={category.metadata.icon} className={className} />;
    }

    return <Icon material={category.metadata.icon} className={className} />;
  }

  private renderLedIcon() {
    if (this.props.entity.kind !== "KubernetesCluster") {
      return null;
    }

    const phase = this.props.entity.status.phase;

    return (
      <div
        className={cssNames(styles.led, {
          [styles.online]: phase === LensKubernetesClusterStatus.CONNECTED,
          [styles.connecting]: phase === LensKubernetesClusterStatus.CONNECTING,
          [styles.disconnected]: phase === LensKubernetesClusterStatus.DISCONNECTED,
          [styles.deleting]: phase === LensKubernetesClusterStatus.DELETING,
        })}
      />
    );
  }

  private renderEnvTag(envConfig?: ClusterEnvironmentConfig) {
    if (!envConfig || envConfig.id === "none") {
      return null;
    }

    return (
      <div className={styles.envTag}>
        <EnvironmentBadge environment={envConfig} size="sm" />
      </div>
    );
  }

  isActive(item: CatalogEntity) {
    return this.props.activeEntity.get()?.metadata?.uid == item.getId();
  }

  onMenuOpen() {
    this.menuItems.replace([{
      title: "Remove from Hotbar",
      onClick: () => this.props.remove(this.props.entity.getId()),
    }]);

    if (isKubernetesCluster(this.props.entity)) {
      this.menuItems.push({
        title: "Change Color, Icon & Environment...",
        icon: "palette",
        onClick: () => {
          this.isAppearanceDialogOpen = true;
        },
      });
    }

    this.props.visitEntityContextMenu(this.props.entity, {
      menuItems: this.menuItems,
      navigate: this.props.navigate,
    });
  }

  render() {
    const { entity, className, onClick } = this.props;
    const cluster = isKubernetesCluster(entity) ? this.props.getClusterById(entity.getId()) : undefined;
    const envConfig = isKubernetesCluster(entity)
      ? resolveClusterEnvironment({ preferences: cluster?.preferences, spec: { environment: entity.spec.environment, customEnvironmentName: entity.spec.customEnvironmentName }})
      : undefined;
    const isProd = envConfig?.isProduction === true;

    const displayName = cluster?.preferences.clusterAlias
      || cluster?.preferences.clusterName
      || entity.getName();

    let tooltip = displayName;

    if (isProd) {
      tooltip = `[PRODUCTION] ${displayName}`;
    } else if (envConfig && envConfig.id !== "none") {
      tooltip = `[${envConfig.label.toUpperCase()}] ${displayName}`;
    }

    if (entity.metadata.source) {
      tooltip += ` (${entity.metadata.source})`;
    }

    return (
      <>
        <HotbarIcon
          uid={entity.getId()}
          title={displayName}
          source={entity.metadata.source}
          src={entity.spec.icon?.src}
          material={entity.spec.icon?.material}
          background={entity.spec.icon?.background || (envConfig && envConfig.id !== "none" ? `var(${envConfig.cssVar})` : undefined)}
          className={className}
          active={this.isActive(entity)}
          onMenuOpen={() => this.onMenuOpen()}
          disabled={!entity}
          menuItems={this.menuItems}
          tooltip={tooltip}
          onClick={onClick}
        >
          {isProd && <div className={styles.productionIndicator} />}
          {this.renderLedIcon()}
          {this.renderKindIcon()}
          {this.renderEnvTag(envConfig)}
        </HotbarIcon>
        {cluster && isKubernetesCluster(entity) && (
          <ClusterAppearanceDialog
            cluster={cluster}
            entity={entity}
            isOpen={this.isAppearanceDialogOpen}
            close={() => {
              this.isAppearanceDialogOpen = false;
            }}
          />
        )}
      </>
    );
  }
}

export const HotbarEntityIcon = withInjectables<Dependencies, HotbarEntityIconProps>(NonInjectedHotbarEntityIcon, {
  getProps: (di, props) => ({
    ...props,
    catalogCategoryRegistry: di.inject(catalogCategoryRegistryInjectable),
    visitEntityContextMenu: di.inject(visitEntityContextMenuInjectable),
    activeEntity: di.inject(activeEntityInjectable),
    navigate: di.inject(navigateInjectable),
    getClusterById: di.inject(getClusterByIdInjectable),
  }),
});
