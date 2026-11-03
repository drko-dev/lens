/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import type { PanelPolicy, SplitPanelStoreDependencies } from "../../../renderer/components/split-panel/split-panel-store";
import { findParentGroup, SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { createBranchNode, createLeafNode } from "../../../renderer/components/split-panel/panel-catalog";
import type { PanelKind } from "../../../renderer/components/split-panel/split-panel-types";

/** H7.5: workspace id of the global docking panels in Main's detached window registry (Kubetail keeps its own). */
export const globalDockingWorkspaceId = "global-docking";

/**
 * Single source of the views hosted by GlobalPanelHost (H7.6.1): the catalog policy
 * and the route gate (active-global-panel-kind) both derive from this list.
 */
export const globalPanelKinds = [
  "pods", "deployments", "statefulsets", "daemonsets", "replicasets", "jobs", "cronjobs",
  // H7.6.2: resources and networking (Secrets is deliberately excluded).
  "events", "configmaps", "services", "ingresses", "persistentvolumeclaims", "nodes",
] as const;

export type GlobalPanelKind = typeof globalPanelKinds[number];

// Only the views validated inside the host; one instance each so no list view is mounted twice.
export const globalPanelPolicy: PanelPolicy = {
  allowedKinds: globalPanelKinds,
  singleInstance: true,
};

/**
 * Navigating to a hosted route shows its panel: added once, restored when collapsed,
 * its tab activated when grouped (H7.6.2), detached left alone.
 */
export function showRoutePanel(store: SplitPanelStore, kind: PanelKind | undefined): void {
  if (!kind) {
    return;
  }

  const leaf = store.allActiveLeaves.find((candidate) => candidate.panelKind === kind);

  if (!leaf) {
    store.addPanel(kind);

    return;
  }

  if (store.isLeafCollapsed(leaf.id)) {
    store.restorePanel(leaf.id);
  }

  const group = findParentGroup(store.rootNode, leaf.id);

  if (group && group.activePanelId !== leaf.id) {
    store.setActiveTabInGroup(group.id, leaf.id);
  }
}

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
