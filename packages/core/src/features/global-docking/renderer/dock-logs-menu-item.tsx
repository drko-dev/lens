/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { KubeObject, Pod } from "@openlens/kube-object";
import { Icon } from "../../../renderer/components/icon";
import { MenuItem } from "../../../renderer/components/menu";
import type { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import shouldUseGlobalPanelHostInjectable from "./should-use-global-panel-host.injectable";
import globalPanelStoreInjectable from "./global-panel-store.injectable";
import { openLogsPanel } from "./global-panel-store";

export interface DockLogsMenuItemProps {
  object: KubeObject;
  toolbar?: boolean;
}

interface Dependencies {
  hostActive: IComputedValue<boolean>;
  store: SplitPanelStore;
}

/** H7.6.3B: opens the logs of one container of a Pod as a docked panel; shown only while the global host is rendered. */
const NonInjectedDockLogsMenuItem = observer(({ object, toolbar, hostActive, store }: DockLogsMenuItemProps & Dependencies) => {
  if (!hostActive.get() || object?.kind !== "Pod") {
    return null;
  }

  const pod = object as Pod;
  const containers = pod.getAllContainers?.() ?? [];

  return (
    <>
      {containers.map((container) => (
        <MenuItem
          key={container.name}
          data-testid={`dock-logs-btn-${container.name}`}
          onClick={() => openLogsPanel(store, {
            podId: pod.getId(),
            podName: pod.getName(),
            namespace: pod.getNs(),
            container: container.name,
          })}
        >
          <Icon material="subject" tooltip={`Show logs of ${container.name} in a docked panel`} interactive={toolbar} />
          <span className="title">{containers.length > 1 ? `Logs (docked): ${container.name}` : "Logs (docked)"}</span>
        </MenuItem>
      ))}
    </>
  );
});

export const DockLogsMenuItem = withInjectables<Dependencies, DockLogsMenuItemProps>(NonInjectedDockLogsMenuItem, {
  getProps: (di, props) => ({
    ...props,
    hostActive: di.inject(shouldUseGlobalPanelHostInjectable),
    store: di.inject(globalPanelStoreInjectable),
  }),
});
