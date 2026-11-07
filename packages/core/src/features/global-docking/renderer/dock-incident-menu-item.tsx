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
import { openIncidentWorkbenchPanel } from "./global-panel-store";

export interface DockIncidentMenuItemProps {
  object: KubeObject;
  toolbar?: boolean;
}

interface Dependencies {
  hostActive: IComputedValue<boolean>;
  store: SplitPanelStore;
}

/** H8: opens the Incident Workbench as a docked panel bound to the selected resource. */
const NonInjectedDockIncidentMenuItem = observer(({ object, toolbar, hostActive, store }: DockIncidentMenuItemProps & Dependencies) => {
  if (!hostActive.get() || !object?.apiVersion || !object.getName()) {
    return null;
  }

  const open = () => openIncidentWorkbenchPanel(store, {
    apiVersion: object.apiVersion,
    kind: object.kind,
    name: object.getName(),
    uid: object.getId(),
    ...(object.getNs() ? { namespace: object.getNs() } : {}),
  });

  return (
    <MenuItem onClick={open} data-testid="dock-incident-btn">
      <Icon material="warning" tooltip="Diagnosticar en Incident Workbench" interactive={toolbar} />
      <span className="title">Diagnóstico (Workbench)</span>
    </MenuItem>
  );
});

export const DockIncidentMenuItem = withInjectables<Dependencies, DockIncidentMenuItemProps>(NonInjectedDockIncidentMenuItem, {
  getProps: (di, props) => ({
    ...props,
    hostActive: di.inject(shouldUseGlobalPanelHostInjectable),
    store: di.inject(globalPanelStoreInjectable),
  }),
});
