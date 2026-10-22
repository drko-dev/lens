/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import styles from "../catalog.module.scss";
import React from "react";
import activeHotbarInjectable from "../../../../features/hotbar/storage/common/active.injectable";
import { Avatar } from "../../avatar";
import type { RegisteredAdditionalCategoryColumn } from "../custom-category-columns";
import { Icon } from "../../icon";
import { isKubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";
import { resolveClusterEnvironment } from "../../../../common/cluster/environment-types";
import getClusterByIdInjectable from "../../../../features/cluster/storage/common/get-by-id.injectable";
import { prevDefault } from "@openlens/utilities";

const renderNamedCategoryColumnCellInjectable = getInjectable({
  id: "render-named-category-column-cell",
  instantiate: (di): RegisteredAdditionalCategoryColumn["renderCell"] => {
    const activeHotbar = di.inject(activeHotbarInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);

    return (entity) => {
      const hotbar = activeHotbar.get();

      if (!hotbar) {
        return null;
      }

      const isItemInHotbar = hotbar.hasEntity(entity.getId());
      const onClick = prevDefault((
        isItemInHotbar
          ? () => hotbar.removeEntity(entity.getId())
          : () => hotbar.addEntity(entity)
      ));

      const env = isKubernetesCluster(entity)
        ? resolveClusterEnvironment({ preferences: getClusterById(entity.getId())?.preferences, spec: { environment: entity.spec.environment, customEnvironmentName: entity.spec.customEnvironmentName }})
        : undefined;

      return (
        <>
          <Avatar
            title={entity.getName()}
            colorHash={`${entity.getName()}-${entity.getSource()}`}
            src={entity.spec.icon?.src}
            background={entity.spec.icon?.background || (env && env.id !== "none" ? `var(${env.cssVar})` : undefined)}
            className={styles.catalogAvatar}
            size={24}
          >
            {entity.spec.icon?.material && <Icon material={entity.spec.icon?.material} small/>}
          </Avatar>
          <span>{entity.getName()}</span>
          <Icon
            small
            className={styles.pinIcon}
            svg={isItemInHotbar ? "push_off" : "push_pin"}
            tooltip={isItemInHotbar ? "Remove from Hotbar" : "Add to Hotbar"}
            onClick={onClick}
          />
        </>
      );
    };
  },
});

export default renderNamedCategoryColumnCellInjectable;
