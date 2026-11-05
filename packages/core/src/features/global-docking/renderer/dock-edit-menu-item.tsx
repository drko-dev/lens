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
import { openEditorPanel } from "./global-panel-store";

export interface DockEditMenuItemProps {
  object: KubeObject;
  toolbar?: boolean;
}

interface Dependencies {
  hostActive: IComputedValue<boolean>;
  store: SplitPanelStore;
}

/** H7.6.3C: opens the resource's YAML editor as a docked panel; shown only while the global host is rendered. */
const NonInjectedDockEditMenuItem = observer(({ object, toolbar, hostActive, store }: DockEditMenuItemProps & Dependencies) => {
  if (!hostActive.get() || !object?.selfLink || !object.getName()) {
    return null;
  }

  const open = () => openEditorPanel(store, {
    selfLink: object.selfLink,
    apiVersion: object.apiVersion,
    kind: object.kind,
    name: object.getName(),
    uid: object.getId(),
    ...(object.getNs() ? { namespace: object.getNs() } : {}),
  });

  return (
    <MenuItem onClick={open} data-testid="dock-edit-btn">
      <Icon material="edit" tooltip="Edit in a docked panel" interactive={toolbar} />
      <span className="title">Edit (docked)</span>
    </MenuItem>
  );
});

export const DockEditMenuItem = withInjectables<Dependencies, DockEditMenuItemProps>(NonInjectedDockEditMenuItem, {
  getProps: (di, props) => ({
    ...props,
    hostActive: di.inject(shouldUseGlobalPanelHostInjectable),
    store: di.inject(globalPanelStoreInjectable),
  }),
});
