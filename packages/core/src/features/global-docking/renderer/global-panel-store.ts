/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import type { PanelPolicy, SplitPanelStoreDependencies } from "../../../renderer/components/split-panel/split-panel-store";
import { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { createBranchNode, createLeafNode } from "../../../renderer/components/split-panel/panel-catalog";

// Only the views validated inside the host; one instance each so no list view is mounted twice.
/** H7.5: workspace id of the global docking panels in Main's detached window registry (Kubetail keeps its own). */
export const globalDockingWorkspaceId = "global-docking";

export const globalPanelPolicy: PanelPolicy = {
  allowedKinds: ["pods", "deployments"],
  singleInstance: true,
};

/**
 * Builds the split-panel store used by the global docking host.
 *
 * Storage accessors are injected on purpose: SplitPanelStore falls back to
 * window.localStorage["openlens:split-layout"] (the Kubetail layout) when they
 * are missing. Restoring a persisted layout also writes the module-level
 * WORKSPACE_TEMPLATES shared with Kubetail.
 *
 * ponytail: in-memory only for H7.1; per-cluster persistence
 * ("openlens:global-layout:<clusterId>") lands in H7.7 behind its own
 * serializer so it never touches the shared templates.
 */
export function createGlobalPanelStore(
  clusterId: string | undefined,
  detachedToolIpc: Pick<SplitPanelStoreDependencies, "invoke" | "onRedocked"> = {},
): SplitPanelStore {
  const store = new SplitPanelStore({
    ...detachedToolIpc,
    detachWorkspaceId: globalDockingWorkspaceId,
    initialClusterId: clusterId,
    getLocalStorageItem: () => null,
    setLocalStorageItem: () => {},
    panelPolicy: globalPanelPolicy,
  });

  runInAction(() => {
    store.rootNode = createBranchNode("horizontal", 0.5, createLeafNode("pods"), createLeafNode("deployments"));
  });

  return store;
}
