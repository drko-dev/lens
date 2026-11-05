/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObject } from "@openlens/kube-object";
import { Icon } from "../../../renderer/components/icon";
import { MenuItem } from "../../../renderer/components/menu";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import shouldUseGlobalPanelHostInjectable from "./should-use-global-panel-host.injectable";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import { openDetailsPanel } from "./global-panel-store";

export interface DockDetailsMenuItemProps {
  object: KubeObject;
  toolbar?: boolean;
}

interface Dependencies {
  hostActive: IComputedValue<boolean>;
  store: SplitPanelStore;
}

/** H7.6.3: opens the resource's Details as a docked panel; shown only while the global host is rendered. */
const NonInjectedDockDetailsMenuItem = observer(({ object, toolbar, hostActive, store }: DockDetailsMenuItemProps & Dependencies) => {
  if (!hostActive.get() || !object?.apiVersion || !object.getName()) {
    return null;
  }

  const open = () => openDetailsPanel(store, {
    apiVersion: object.apiVersion,
    kind: object.kind,
    name: object.getName(),
    uid: object.getId(),
    ...(object.getNs() ? { namespace: object.getNs() } : {}),
  });

  return (
    <MenuItem onClick={open} data-testid="dock-details-btn">
      <Icon material="view_sidebar" tooltip="Show details in a docked panel" interactive={toolbar} />
      <span className="title">Details (docked)</span>
    </MenuItem>
  );
});

export const DockDetailsMenuItem = withInjectables<Dependencies, DockDetailsMenuItemProps>(NonInjectedDockDetailsMenuItem, {
  getProps: (di, props) => ({
    ...props,
    hostActive: di.inject(shouldUseGlobalPanelHostInjectable),
    store: di.inject(globalPanelStoreInjectable),
  }),
});
