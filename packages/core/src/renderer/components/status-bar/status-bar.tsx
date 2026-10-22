/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./status-bar.module.scss";

import React from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { StatusBarItems } from "./status-bar-items.injectable";
import statusBarItemsInjectable from "./status-bar-items.injectable";
import type { IComputedValue, IObservableValue } from "mobx";
import type { StatusBarStatus } from "./current-status.injectable";
import statusBarCurrentStatusInjectable from "./current-status.injectable";
import { cssNames } from "@openlens/utilities";
import type { CatalogEntity } from "../../../common/catalog";
import activeEntityInjectable from "../../api/catalog/entity/active.injectable";
import { resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import { EnvironmentBadge } from "../environment-badge";

export interface StatusBarProps {}

interface Dependencies {
  items: IComputedValue<StatusBarItems>;
  status: IObservableValue<StatusBarStatus>;
  activeEntity: IComputedValue<CatalogEntity | undefined>;
}

const NonInjectedStatusBar = observer(({
  items,
  status,
  activeEntity,
}: Dependencies & StatusBarProps) => {
  const { left, right } = items.get();
  const barStatus = status.get();
  const barStyle = barStatus === "default"
    ? undefined
    : styles[`status-${barStatus}`];
  const entity = activeEntity.get();
  const environment = entity?.kind === "KubernetesCluster"
    ? resolveClusterEnvironment({ spec: entity.spec as { environment?: string } })
    : undefined;
  const showEnvironment = environment && environment.id !== "none";

  return (
    <div className={cssNames(styles.StatusBar, barStyle, showEnvironment && environment.id === "production" && styles.production)} data-testid="status-bar">
      <div className={styles.leftSide} data-testid="status-bar-left">
        {showEnvironment && entity && (
          <div className={styles.environment} data-testid="status-bar-environment">
            <EnvironmentBadge environment={environment} />
            <span className={styles.environmentName}>{entity.getName()}</span>
          </div>
        )}
        {left.map((Item, index) => (
          <div
            className={styles.item}
            key={index}
            data-origin={Item.origin}>
            {<Item.component/>}
          </div>
        ))}
      </div>
      <div className={styles.rightSide} data-testid="status-bar-right">
        {right.map((Item, index) => (
          <div
            className={styles.item}
            key={index}
            data-origin={Item.origin}>
            {<Item.component/>}
          </div>
        ))}
      </div>
    </div>
  );

});

export const StatusBar = withInjectables<Dependencies, StatusBarProps>(NonInjectedStatusBar, {
  getProps: (di, props) => ({
    ...props,
    items: di.inject(statusBarItemsInjectable),
    status: di.inject(statusBarCurrentStatusInjectable),
    activeEntity: di.inject(activeEntityInjectable),
  }),
});
