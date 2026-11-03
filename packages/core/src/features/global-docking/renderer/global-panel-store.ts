/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import type { PanelPolicy, SplitPanelStoreDependencies } from "../../../renderer/components/split-panel/split-panel-store";
import { findParentGroup, SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { createBranchNode, createLeafNode } from "../../../renderer/components/split-panel/panel-catalog";
import type { PanelKind, PanelResourceBinding, SplitLayoutLeaf } from "../../../renderer/components/split-panel/split-panel-types";

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

  revealLeaf(store, leaf.id);
}

/** Brings an existing panel into view: restored when collapsed, its tab activated when grouped. */
function revealLeaf(store: SplitPanelStore, leafId: string): void {
  if (store.isLeafCollapsed(leafId)) {
    store.restorePanel(leafId);
  }

  const group = findParentGroup(store.rootNode, leafId);

  if (group && group.activePanelId !== leafId) {
    store.setActiveTabInGroup(group.id, leafId);
  }
}

/** H7.6.3: the stable identity of a docked Details panel (never the active route). */
export type DetailsDescriptor = Required<Pick<PanelResourceBinding, "apiVersion" | "kind" | "name">> & Pick<PanelResourceBinding, "namespace" | "uid">;

/** H7.6.3B: the stable identity of a docked Pod Logs panel. */
export interface LogsDescriptor {
  readonly podId: string;
  readonly podName: string;
  readonly namespace: string;
  readonly container: string;
}

/** Stable dock tab id of a docked Logs panel: derived from the identity, never regenerated per mount. */
export const dockedLogsTabId = (binding: Pick<PanelResourceBinding, "clusterId" | "namespace" | "name" | "uid" | "container">) =>
  `docked-logs:${binding.clusterId ?? ""}:${binding.namespace ?? ""}:${binding.uid ?? binding.name}:${binding.container ?? ""}`;

/** H7.6.3C: the stable identity of a docked Editor panel: one document per cluster and resource. */
export interface EditorDescriptor {
  readonly selfLink: string;
  readonly apiVersion: string;
  readonly kind: string;
  readonly name: string;
  readonly namespace?: string;
  readonly uid?: string;
}

/** Stable edit-session id: derived from cluster + resource, never the random panel id and never regenerated on remount. */
export const dockedEditorTabId = (binding: Pick<PanelResourceBinding, "clusterId" | "selfLink">) =>
  `docked-edit:${binding.clusterId ?? ""}:${binding.selfLink ?? ""}`;

/** Opens (or reveals) the Editor of one resource. One panel, one model and one draft per document. */
export function openEditorPanel(store: SplitPanelStore, desc: EditorDescriptor): string {
  const existing = store.allActiveLeaves.find((leaf) => leaf.panelKind === "resource-editor" && leaf.resourceBinding?.selfLink === desc.selfLink);

  if (existing) {
    revealLeaf(store, existing.id);

    return existing.id;
  }

  const binding = {
    clusterId: store.clusterId,
    apiVersion: desc.apiVersion,
    kind: desc.kind,
    name: desc.name,
    namespace: desc.namespace,
    uid: desc.uid,
    selfLink: desc.selfLink,
  };
  const leaf: SplitLayoutLeaf = {
    ...createLeafNode("resource-editor", `Edit: ${desc.kind}/${desc.name}`),
    resourceBinding: { ...binding, tabId: dockedEditorTabId(binding) },
  };

  store.insertLeaf(leaf);

  return leaf.id;
}

/** H7.6.3D: stable PTY session id: created once per explicit user action, never derived from the route or the panel id. */
export const dockedTerminalTabId = (clusterId: string | undefined, uuid: string) => `docked-terminal:${clusterId ?? ""}:${uuid}`;

/**
 * Opens a NEW terminal session (always an explicit user action; navigation never calls this).
 * The PTY itself is created later by TerminalStore.connect, once, keyed by the returned tab id.
 */
export function openTerminalPanel(store: SplitPanelStore, uuid: string = globalThis.crypto.randomUUID()): string {
  const tabId = dockedTerminalTabId(store.clusterId, uuid);
  const leaf: SplitLayoutLeaf = {
    ...createLeafNode("terminal", "Terminal"),
    resourceBinding: { clusterId: store.clusterId, kind: "Terminal", name: "Terminal", tabId },
  };

  store.insertLeaf(leaf);

  return leaf.id;
}

const sameResource = (a: PanelResourceBinding | undefined, b: DetailsDescriptor) => Boolean(a)
  && a!.kind === b.kind && a!.apiVersion === b.apiVersion && a!.name === b.name && (a!.namespace ?? "") === (b.namespace ?? "");

const sameLogsSession = (binding: PanelResourceBinding | undefined, desc: LogsDescriptor) => Boolean(binding)
  && binding!.kind === "Pod"
  && (binding!.uid ? binding!.uid === desc.podId : binding!.name === desc.podName)
  && (binding!.namespace ?? "") === desc.namespace
  && binding!.container === desc.container;

/**
 * Opens (or reveals) the Logs panel of one container. One panel per container session;
 * reuses the existing panel and tabId if already open.
 */
export function openLogsPanel(store: SplitPanelStore, desc: LogsDescriptor): string {
  const existing = store.allActiveLeaves.find((leaf) => leaf.panelKind === "pod-logs" && sameLogsSession(leaf.resourceBinding, desc));

  if (existing) {
    revealLeaf(store, existing.id);

    return existing.id;
  }

  const binding = {
    clusterId: store.clusterId,
    apiVersion: "v1",
    kind: "Pod",
    name: desc.podName,
    namespace: desc.namespace,
    uid: desc.podId,
    container: desc.container,
  };
  const leaf: SplitLayoutLeaf = {
    ...createLeafNode("pod-logs", `Logs: ${desc.podName} (${desc.container})`),
    resourceBinding: { ...binding, tabId: dockedLogsTabId(binding) },
  };

  store.insertLeaf(leaf);

  return leaf.id;
}

/**
 * Opens (or reveals) the Details panel of one resource. One panel per resource identity;
 * different resources get different panels. The binding carries the host clusterId, so a
 * bound panel is never re-targeted by moves or by the route.
 */
export function openDetailsPanel(store: SplitPanelStore, resource: DetailsDescriptor): string {
  const existing = store.allActiveLeaves.find((leaf) => leaf.panelKind === "resource-details" && sameResource(leaf.resourceBinding, resource));

  if (existing) {
    revealLeaf(store, existing.id);

    return existing.id;
  }

  const leaf: SplitLayoutLeaf = {
    ...createLeafNode("resource-details", `${resource.kind}: ${resource.name}`),
    resourceBinding: { ...resource, clusterId: store.clusterId },
  };

  store.insertLeaf(leaf);

  return leaf.id;
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
  detachedToolIpc: Pick<SplitPanelStoreDependencies, "invoke" | "onRedocked" | "onPanelClosed" | "confirmPanelClose"> = {},
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
