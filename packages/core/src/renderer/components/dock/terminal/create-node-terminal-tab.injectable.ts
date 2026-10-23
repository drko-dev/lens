/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import dockStoreInjectable from "../dock/store.injectable";
import type { TabId } from "../dock/store";
import { TabKind } from "../dock/store";

export interface NodeTerminalTabData {
  nodeName: string;
  tabId?: string;
}

export type CreateNodeTerminalTab = (data: NodeTerminalTabData) => TabId;

const createNodeTerminalTabInjectable = getInjectable({
  id: "create-node-terminal-tab",

  instantiate: (di): CreateNodeTerminalTab => {
    const dockStore = di.inject(dockStoreInjectable);

    return ({ nodeName, tabId }): TabId => {
      const tab = dockStore.createTab({
        id: tabId,
        title: `Node: ${nodeName}`,
        kind: TabKind.TERMINAL,
        node: nodeName,
      });

      return tab.id;
    };
  },
});

export default createNodeTerminalTabInjectable;
