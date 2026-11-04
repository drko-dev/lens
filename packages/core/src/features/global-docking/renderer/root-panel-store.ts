/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import type { PanelPolicy } from "../../../renderer/components/split-panel/split-panel-store";
import { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { createLeafNode } from "../../../renderer/components/split-panel/panel-catalog";

/**
 * H7.6.4: the views of the ROOT frame (no cluster) hosted by RootPanelHost.
 * Single source for the policy and for the route gate (active-root-panel-kind).
 */
export const rootPanelKinds = ["settings", "catalog"] as const;

export type RootPanelKind = typeof rootPanelKinds[number];

// One instance each: Settings and the Catalog are route-dependent singletons.
export const rootPanelPolicy: PanelPolicy = {
  allowedKinds: rootPanelKinds,
  singleInstance: true,
};

/**
 * Builds the docking store of the root frame. It has no clusterId (so no cluster identity, and
 * detach/redock are refused by the engine) and no persistence: it never reads or writes the
 * Kubetail layout key nor the shared workspace templates. It starts with the opened view only.
 */
export function createRootPanelStore(initialKind: RootPanelKind = "settings"): SplitPanelStore {
  const store = new SplitPanelStore({
    getLocalStorageItem: () => null,
    setLocalStorageItem: () => {},
    panelPolicy: rootPanelPolicy,
  });

  runInAction(() => {
    store.rootNode = createLeafNode(initialKind);
  });

  return store;
}
