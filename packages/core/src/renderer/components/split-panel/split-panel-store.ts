/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, computed, makeObservable, observable, runInAction } from "mobx";
import type {
  DetachedPanelState,
  LayoutV1,
  PanelId,
  PanelKind,
  PanelResourceBinding,
  PersistedDetachedWindow,
  SerializedSplitLayout,
  SerializedSplitLayoutV1,
  SerializedSplitLayoutV2,
  SplitLayoutGroup,
  SplitLayoutLeaf,
  SplitLayoutNode,
  SplitOrientation,
  WindowGeometry,
  WorkspaceTemplateId,
} from "./split-panel-types";
import {
  isBranchNode,
  isGroupNode,
  isLayoutV1,
  isLeafNode,
} from "./split-panel-types";
import {
  createBranchNode,
  createGroupNode,
  createLeafNode,
  getCatalogItem,
  WORKSPACE_TEMPLATES,
} from "./panel-catalog";
import {
  assertNoSensitiveFields,
  sanitizeSplitLayout,
} from "../../../common/workspace/session-snapshot";

/**
 * Optional restriction of which panels a store may add. Absent (Kubetail) means
 * every catalog kind, unlimited instances: the pre-H7.2 behavior.
 */
export interface PanelPolicy {
  readonly allowedKinds: readonly PanelKind[];
  readonly singleInstance: boolean;
}

export const DEFAULT_SPLIT_RATIO = 0.58;
export const MIN_SPLIT_RATIO = 0.20;
export const MAX_SPLIT_RATIO = 0.80;

export interface SplitPanelStoreDependencies {
  readonly initialClusterId?: string;
  readonly getLocalStorageItem?: (key: string) => string | null;
  readonly setLocalStorageItem?: (key: string, value: string) => void;
  readonly invoke?: (channel: string, payload: unknown) => Promise<unknown>;
  readonly onRedocked?: (callback: (notice: any) => void) => () => void;
  readonly onStreamStopRequested?: (leafId: string) => void;
  readonly onStreamResumeRequested?: (leafId: string) => void;
  readonly panelPolicy?: PanelPolicy;
  /** H7.5: workspace id sent to Main for detached windows (Kubetail keeps its active workspace id). */
  readonly detachWorkspaceId?: string;
}

/** H7.5: list panels Main can show in a read-only detached window, and their Kubernetes kind. */
const detachedListKinds: Partial<Record<PanelKind, "Pod" | "Deployment">> = { pods: "Pod", deployments: "Deployment" };

export function canDetachAsList(panelKind: PanelKind): boolean {
  return detachedListKinds[panelKind] !== undefined;
}

/** The Main tool kind of a detached panel (see detached-tool-channels). */
function detachedToolKindOf(panelKind: PanelKind): "inspector" | "logs" | "resource-list" {
  if (panelKind === "resource-details") return "inspector";

  return canDetachAsList(panelKind) ? "resource-list" : "logs";
}

/** List panels are single-instance per cluster frame, so their kind is a stable tab id across re-mounts. */
function detachedTabIdOf(state: { panelKind: PanelKind; panelId: string }): string {
  return canDetachAsList(state.panelKind) ? state.panelKind : state.panelId;
}

// Tree helper functions
export function findNodeById(root: SplitLayoutNode, id: string): SplitLayoutNode | undefined {
  if (root.id === id) return root;

  if (isBranchNode(root)) {
    return findNodeById(root.first, id) || findNodeById(root.second, id);
  }

  if (isGroupNode(root)) {
    return root.panels.find(p => p.id === id);
  }

  return undefined;
}

export function getAllLeaves(root: SplitLayoutNode): SplitLayoutLeaf[] {
  if (isLeafNode(root)) {
    return [root];
  }

  if (isGroupNode(root)) {
    return [...root.panels];
  }

  if (isBranchNode(root)) {
    return [...getAllLeaves(root.first), ...getAllLeaves(root.second)];
  }

  return [];
}

export function removeLeafFromTree(root: SplitLayoutNode, leafId: string): SplitLayoutNode {
  if (isLeafNode(root)) {
    return root; // Cannot remove only remaining leaf
  }

  if (isGroupNode(root)) {
    const remaining = root.panels.filter(p => p.id !== leafId);

    if (remaining.length === 0) return root;
    if (remaining.length === 1) return remaining[0];

    const activeId = root.activePanelId === leafId ? remaining[0].id : root.activePanelId;

    return {
      ...root,
      panels: remaining,
      activePanelId: activeId,
    };
  }

  if (isBranchNode(root)) {
    // If first is the leaf, replace branch with second
    if (root.first.id === leafId) {
      return root.second;
    }
    // If second is the leaf, replace branch with first
    if (root.second.id === leafId) {
      return root.first;
    }

    // Recurse into children
    const newFirst = removeLeafFromTree(root.first, leafId);
    const newSecond = removeLeafFromTree(root.second, leafId);

    return {
      ...root,
      first: newFirst,
      second: newSecond,
    };
  }

  return root;
}

export function splitLeafInTree(
  root: SplitLayoutNode,
  targetLeafId: string,
  newLeaf: SplitLayoutLeaf,
  orientation: SplitOrientation,
): SplitLayoutNode {
  if (root.id === targetLeafId && isLeafNode(root)) {
    return createBranchNode(orientation, 0.5, root, newLeaf);
  }

  // A tab cannot be split on its own: the new panel goes beside its whole group.
  if (isGroupNode(root) && root.panels.some((panel) => panel.id === targetLeafId)) {
    return createBranchNode(orientation, 0.5, root, newLeaf);
  }

  if (isBranchNode(root)) {
    return {
      ...root,
      first: splitLeafInTree(root.first, targetLeafId, newLeaf, orientation),
      second: splitLeafInTree(root.second, targetLeafId, newLeaf, orientation),
    };
  }

  return root;
}

export function updateBranchRatio(root: SplitLayoutNode, branchId: string, newRatio: number): SplitLayoutNode {
  const clamped = Math.max(MIN_SPLIT_RATIO, Math.min(MAX_SPLIT_RATIO, newRatio));

  if (root.id === branchId && isBranchNode(root)) {
    return {
      ...root,
      ratio: clamped,
    };
  }

  if (isBranchNode(root)) {
    return {
      ...root,
      first: updateBranchRatio(root.first, branchId, clamped),
      second: updateBranchRatio(root.second, branchId, clamped),
    };
  }

  return root;
}

export function groupLeavesInTree(
  root: SplitLayoutNode,
  targetLeafId: string,
  movingLeaf: SplitLayoutLeaf,
): SplitLayoutNode {
  if (root.id === targetLeafId && isLeafNode(root)) {
    return createGroupNode([root, movingLeaf], movingLeaf.id);
  }

  if (root.id === targetLeafId && isGroupNode(root)) {
    return {
      ...root,
      panels: [...root.panels, movingLeaf],
      activePanelId: movingLeaf.id,
    };
  }

  if (isGroupNode(root)) {
    const hasTarget = root.panels.some(p => p.id === targetLeafId);

    if (hasTarget) {
      return {
        ...root,
        panels: [...root.panels, movingLeaf],
        activePanelId: movingLeaf.id,
      };
    }

    return root;
  }

  if (isBranchNode(root)) {
    return {
      ...root,
      first: groupLeavesInTree(root.first, targetLeafId, movingLeaf),
      second: groupLeavesInTree(root.second, targetLeafId, movingLeaf),
    };
  }

  return root;
}

export function swapLeavesInTree(
  root: SplitLayoutNode,
  leafId1: string,
  leafId2: string,
): SplitLayoutNode {
  const leaf1 = findNodeById(root, leafId1);
  const leaf2 = findNodeById(root, leafId2);

  if (!leaf1 || !leaf2 || !isLeafNode(leaf1) || !isLeafNode(leaf2)) return root;

  function replaceNode(node: SplitLayoutNode): SplitLayoutNode {
    if (node.id === leafId1) return leaf2 as SplitLayoutLeaf;
    if (node.id === leafId2) return leaf1 as SplitLayoutLeaf;

    if (isBranchNode(node)) {
      return {
        ...node,
        first: replaceNode(node.first),
        second: replaceNode(node.second),
      };
    }

    if (isGroupNode(node)) {
      return {
        ...node,
        panels: node.panels.map(p => {
          if (p.id === leafId1) return leaf2 as SplitLayoutLeaf;
          if (p.id === leafId2) return leaf1 as SplitLayoutLeaf;

          return p;
        }),
      };
    }

    return node;
  }

  return replaceNode(root);
}

export class SplitPanelStore {
  @observable public clusterId: string = "";
  @observable public ratio: number = DEFAULT_SPLIT_RATIO;
  @observable public isSwapped: boolean = false;
  @observable public isLeftClosed: boolean = false;
  @observable public isRightClosed: boolean = false;
  @observable public isClassicMode: boolean = false;
  @observable public activePanelId: PanelId = "kubetail";
  @observable public resourceBinding: PanelResourceBinding | undefined = undefined;

  // H2 Dynamic Tree State
  @observable public activeWorkspaceId: WorkspaceTemplateId = "h1-default";
  @observable public rootNode: SplitLayoutNode = WORKSPACE_TEMPLATES["h1-default"].layout;
  @observable public maximizedPanelId: string | undefined = undefined;
  @observable public isCatalogOpen: boolean = false;
  @observable public catalogTargetLeafId: string | undefined = undefined;

  // H3 Detached Windows State (Native Multimonitor)
  @observable public detachedPanels = new Map<string, DetachedPanelState>();
  // H7.3 collapsed panels (global docking). Never serialized.
  @observable public collapsedLeafIds = new Set<string>();
  @observable public isDisposed: boolean = false;
  private redockDisposer?: () => void;

  constructor(private readonly dependencies: SplitPanelStoreDependencies = {}) {
    makeObservable(this);
    if (dependencies.initialClusterId) {
      this.clusterId = dependencies.initialClusterId;
    }
    if (dependencies.onRedocked) {
      this.redockDisposer = dependencies.onRedocked((notice) => this.onPanelRedocked(notice));
    }
    this.hydrateFromStorage();
  }

  @computed
  public get effectiveLeftWidthPercent(): number {
    if (this.isLeftClosed) return 0;
    if (this.isRightClosed) return 100;

    return Math.round(this.ratio * 1000) / 10;
  }

  @computed
  public get effectiveRightWidthPercent(): number {
    if (this.isRightClosed) return 0;
    if (this.isLeftClosed) return 100;

    return Math.round((1 - this.ratio) * 1000) / 10;
  }

  @computed
  public get isSplitActive(): boolean {
    return !this.isClassicMode && !this.isLeftClosed && !this.isRightClosed;
  }

  @computed
  public get allActiveLeaves(): SplitLayoutLeaf[] {
    return getAllLeaves(this.rootNode);
  }

  @computed
  public get activePanelsCount(): number {
    return this.allActiveLeaves.length;
  }

  @action
  public setClusterId(clusterId: string): void {
    if (this.clusterId === clusterId) return;

    // Reset resource binding on cluster transition to prevent context leakage
    this.clusterId = clusterId;
    this.resourceBinding = undefined;
  }

  @action
  public setRatio(newRatio: number): void {
    if (typeof newRatio !== "number" || isNaN(newRatio)) return;
    this.ratio = Math.max(MIN_SPLIT_RATIO, Math.min(newRatio, MAX_SPLIT_RATIO));

    // Update root branch ratio if applicable
    if (isBranchNode(this.rootNode)) {
      this.rootNode = {
        ...this.rootNode,
        ratio: this.ratio,
      };
    }

    this.persistToStorage();
  }

  @action
  public setBranchRatio(branchId: string, newRatio: number): void {
    if (typeof newRatio !== "number" || isNaN(newRatio)) return;
    this.rootNode = updateBranchRatio(this.rootNode, branchId, newRatio);
    this.persistToStorage();
  }

  @action
  public swapPanels(): void {
    this.isSwapped = !this.isSwapped;

    if (isBranchNode(this.rootNode)) {
      this.rootNode = {
        ...this.rootNode,
        first: this.rootNode.second,
        second: this.rootNode.first,
        ratio: this.ratio,
      };
    }

    this.persistToStorage();
  }

  @action
  public closeLeftPanel(): void {
    this.isLeftClosed = true;
    this.activePanelId = "resource-details";
    this.persistToStorage();
  }

  @action
  public openLeftPanel(): void {
    this.isLeftClosed = false;
    this.persistToStorage();
  }

  @action
  public closeRightPanel(): void {
    this.isRightClosed = true;
    this.activePanelId = "kubetail";
    this.persistToStorage();
  }

  @action
  public openRightPanel(): void {
    this.isRightClosed = false;
    this.persistToStorage();
  }

  @action
  public resetLayout(): void {
    this.ratio = DEFAULT_SPLIT_RATIO;
    this.isSwapped = false;
    this.isLeftClosed = false;
    this.isRightClosed = false;
    this.isClassicMode = false;
    this.maximizedPanelId = undefined;
    this.rootNode = WORKSPACE_TEMPLATES[this.activeWorkspaceId]?.layout || WORKSPACE_TEMPLATES["h1-default"].layout;
    this.persistToStorage();
  }

  @action
  public toggleClassicMode(): void {
    this.isClassicMode = !this.isClassicMode;
    this.persistToStorage();
  }

  @action
  public setClassicMode(enabled: boolean): void {
    this.isClassicMode = Boolean(enabled);
    this.persistToStorage();
  }

  @action
  public setActivePanel(panelId: PanelId): void {
    this.activePanelId = panelId;
  }

  @action
  public setResourceBinding(binding: PanelResourceBinding | undefined): void {
    if (!binding) {
      this.resourceBinding = undefined;

      return;
    }

    this.resourceBinding = {
      apiVersion: binding.apiVersion,
      kind: binding.kind,
      namespace: binding.namespace,
      name: binding.name,
      uid: binding.uid,
    };
  }

  // H2 Dynamic Operations
  @action
  public openCatalog(targetLeafId?: string): void {
    this.catalogTargetLeafId = targetLeafId;
    this.isCatalogOpen = true;
  }

  @action
  public closeCatalog(): void {
    this.isCatalogOpen = false;
    this.catalogTargetLeafId = undefined;
  }

  @action
  public addPanel(kind: PanelKind, targetLeafId?: string, orientation: SplitOrientation = "horizontal"): void {
    if (!this.canAddPanelKind(kind)) {
      return;
    }

    const newLeaf = createLeafNode(kind);
    const target = targetLeafId || this.catalogTargetLeafId || this.allActiveLeaves[0]?.id;

    if (!target) {
      this.rootNode = newLeaf;
    } else {
      this.rootNode = splitLeafInTree(this.rootNode, target, newLeaf, orientation);
    }

    this.closeCatalog();
    this.activeWorkspaceId = "custom";
    this.persistToStorage();
  }

  @action
  public closePanel(leafId: string): void {
    const targetLeaf = this.allActiveLeaves.find(l => l.id === leafId);
    if (!targetLeaf) {
      return;
    }

    if (this.allActiveLeaves.length <= 1) {
      // Don't close the only remaining panel; switch to classic view
      return;
    }

    // Stop active stream for this leaf if any
    this.dependencies.onStreamStopRequested?.(leafId);

    if (this.maximizedPanelId === leafId) {
      this.maximizedPanelId = undefined;
    }

    this.rootNode = removeLeafFromTree(this.rootNode, leafId);
    this.activeWorkspaceId = "custom";
    this.collapsedLeafIds.delete(leafId);

    // Clean up orphaned detached registrations if any
    this.detachedPanels.delete(leafId);
    for (const [key, val] of this.detachedPanels.entries()) {
      if (val.panelId === leafId) {
        this.detachedPanels.delete(key);
      }
    }

    this.persistToStorage();
  }

  public isLeafCollapsed(leafId: string): boolean {
    return this.collapsedLeafIds.has(leafId);
  }

  /** A subtree with no visible leaf: the renderer frees its space. */
  public isSubtreeCollapsed(node: SplitLayoutNode): boolean {
    return getAllLeaves(node).every((leaf) => this.collapsedLeafIds.has(leaf.id));
  }

  @computed
  public get collapsedLeaves(): SplitLayoutLeaf[] {
    return this.allActiveLeaves.filter((leaf) => this.collapsedLeafIds.has(leaf.id));
  }

  /**
   * Collapse (H7.3) hides a panel without removing it from the layout. It is view
   * state only: serializeLayout never includes it, so persisted layouts keep their shape.
   */
  @action
  public collapsePanel(leafId: string): boolean {
    if (!this.allActiveLeaves.some((leaf) => leaf.id === leafId)) {
      return false;
    }

    this.collapsedLeafIds.add(leafId);

    return true;
  }

  @action
  public restorePanel(leafId: string): void {
    if (!this.collapsedLeafIds.delete(leafId)) {
      return;
    }

    const group = findParentGroup(this.rootNode, leafId);

    if (group) {
      this.setActiveTabInGroup(group.id, leafId);
    }
  }

  @action
  public toggleMaximizePanel(leafId: string): void {
    if (this.maximizedPanelId === leafId) {
      this.maximizedPanelId = undefined;
    } else {
      this.maximizedPanelId = leafId;
    }
  }

  @action
  public movePanel(
    sourceLeafId: string,
    targetLeafId: string,
    mode: "group" | "split-horizontal" | "split-vertical" = "group",
  ): void {
    if (sourceLeafId === targetLeafId) return;

    const sourceLeaf = findNodeById(this.rootNode, sourceLeafId);

    if (!sourceLeaf || !isLeafNode(sourceLeaf)) return;

    // Remove source leaf from tree
    const treeWithoutSource = removeLeafFromTree(this.rootNode, sourceLeafId);

    // Insert into target
    if (mode === "group") {
      this.rootNode = groupLeavesInTree(treeWithoutSource, targetLeafId, sourceLeaf);
    } else {
      const orientation = mode === "split-vertical" ? "vertical" : "horizontal";

      this.rootNode = splitLeafInTree(treeWithoutSource, targetLeafId, sourceLeaf, orientation);
    }

    this.activeWorkspaceId = "custom";
    this.persistToStorage();
  }

  public canAddPanelKind(kind: PanelKind): boolean {
    const policy = this.dependencies.panelPolicy;

    if (!policy) {
      return !getCatalogItem(kind)?.policyOnly;
    }

    return policy.allowedKinds.includes(kind)
      && !(policy.singleInstance && this.allActiveLeaves.some((leaf) => leaf.panelKind === kind));
  }

  /**
   * Drag & drop move (H7.2). Unlike movePanel it supports the four sides and
   * grouped targets, and leaves the layout untouched on any invalid move.
   * Returns whether the layout changed.
   */
  @action
  public dockPanel(sourceLeafId: string, targetLeafId: string, position: DockPosition, sourceClusterId: string): boolean {
    if (sourceClusterId !== this.clusterId) {
      return false;
    }

    const next = dockLeafInTree(this.rootNode, sourceLeafId, targetLeafId, position);

    if (!next) {
      return false;
    }

    this.rootNode = next;
    this.activeWorkspaceId = "custom";
    this.persistToStorage();

    return true;
  }

  @action
  public swapLeaves(leafId1: string, leafId2: string): void {
    if (leafId1 === leafId2) return;
    this.rootNode = swapLeavesInTree(this.rootNode, leafId1, leafId2);
    this.activeWorkspaceId = "custom";
    this.persistToStorage();
  }

  @action
  public setActiveTabInGroup(groupId: string, panelId: string): void {
    const group = findNodeById(this.rootNode, groupId);

    if (group && isGroupNode(group)) {
      (group as any).activePanelId = panelId;
      this.persistToStorage();
    }
  }

  @action
  public extractTabFromGroup(groupId: string, panelId: string): void {
    const group = findNodeById(this.rootNode, groupId);

    if (group && isGroupNode(group)) {
      const leaf = group.panels.find(p => p.id === panelId);

      if (!leaf) return;

      const treeWithoutLeaf = removeLeafFromTree(this.rootNode, panelId);

      if (isLeafNode(treeWithoutLeaf)) {
        this.rootNode = createBranchNode("horizontal", 0.5, treeWithoutLeaf, leaf);
      } else {
        const targetId = findNodeById(treeWithoutLeaf, groupId) ? groupId : getAllLeaves(treeWithoutLeaf)[0]?.id;

        if (targetId) {
          this.rootNode = splitLeafInTree(treeWithoutLeaf, targetId, leaf, "horizontal");
        }
      }

      this.activeWorkspaceId = "custom";
      this.persistToStorage();
    }
  }

  @action
  public selectWorkspace(templateId: WorkspaceTemplateId): void {
    const template = WORKSPACE_TEMPLATES[templateId];

    if (!template) return;

    // Clean up streams for leaves that won't exist in the new template
    const previousLeaves = this.allActiveLeaves;
    this.activeWorkspaceId = templateId;
    this.rootNode = JSON.parse(JSON.stringify(template.layout));
    this.maximizedPanelId = undefined;
    this.isLeftClosed = false;
    this.isRightClosed = false;
    this.isClassicMode = false;

    const newLeafIds = new Set(this.allActiveLeaves.map(l => l.id));
    for (const prev of previousLeaves) {
      if (!newLeafIds.has(prev.id)) {
        this.dependencies.onStreamStopRequested?.(prev.id);
      }
    }

    if (isBranchNode(this.rootNode)) {
      this.ratio = this.rootNode.ratio;
    }

    this.persistToStorage();
  }

  @action
  public saveCustomWorkspace(): void {
    this.activeWorkspaceId = "custom";
    WORKSPACE_TEMPLATES["custom"] = {
      id: "custom",
      name: "Personalizado",
      description: "Distribución guardada por el usuario.",
      icon: "tune",
      layout: JSON.parse(JSON.stringify(this.rootNode)),
    };
    this.persistToStorage(true);
  }

  // H3 Detached Panels Actions
  public isPanelDetached(leafId: string): boolean {
    if (this.detachedPanels.has(leafId)) return true;
    for (const state of this.detachedPanels.values()) {
      if (state.panelId === leafId || state.panelKind === leafId) {
        return true;
      }
    }
    return false;
  }

  public getDetachedState(leafId: string): DetachedPanelState | undefined {
    if (this.detachedPanels.has(leafId)) return this.detachedPanels.get(leafId);
    for (const state of this.detachedPanels.values()) {
      if (state.panelId === leafId || state.panelKind === leafId) {
        return state;
      }
    }
    return undefined;
  }

  @action
  public async detachPanel(
    leafId: string,
    options?: { resource?: PanelResourceBinding; clusterId?: string; container?: string; pod?: string; namespace?: string },
  ): Promise<boolean> {
    let leaf = findNodeById(this.rootNode, leafId);
    if (!leaf || !isLeafNode(leaf)) {
      leaf = this.allActiveLeaves.find(l => l.id === leafId || l.panelKind === leafId);
    }

    if (!leaf && leafId !== "kubetail" && leafId !== "resource-details") {
      return false;
    }

    const panelKind: PanelKind = (leaf && isLeafNode(leaf))
      ? leaf.panelKind
      : (leafId === "resource-details" ? "resource-details" : "kubetail");

    const effectiveLeafId = (leaf && isLeafNode(leaf)) ? leaf.id : leafId;

    const existingState = this.getDetachedState(leafId) || this.getDetachedState(effectiveLeafId);
    // H7.5: list windows go back to Main, which focuses (and restores) the owner instead of duplicating it.
    if (existingState && existingState.windowId && !canDetachAsList(panelKind)) {
      return true;
    }

    // Strict cluster context: resolve from options, store, or window location; reject if empty
    const clusterId =
      options?.clusterId ||
      this.clusterId ||
      (typeof location !== "undefined" && location?.host ? location.host.split(":")[0].split(".").slice(-3, -2)[0] : undefined);

    if (!clusterId || typeof clusterId !== "string" || clusterId.trim() === "") {
      return false;
    }

    const listKind = detachedListKinds[panelKind];

    if (listKind) {
      return this.detachListPanel(leafId, effectiveLeafId, panelKind, clusterId, listKind, options?.namespace);
    }

    // Strict resource reference: eliminate all hardcoded demo fallbacks
    const binding = options?.resource || this.resourceBinding;
    if (!binding || !binding.name || !binding.kind || !binding.namespace) {
      return false;
    }

    const workspaceId = this.dependencies.detachWorkspaceId || this.activeWorkspaceId || "default";
    const toolKind = panelKind === "resource-details" ? "inspector" : "logs";

    const resource: any = {
      kind: binding.kind,
      name: binding.name,
      namespace: binding.namespace,
      apiVersion: binding.apiVersion || "apps/v1",
      ...(binding.uid && /^[0-9a-fA-F-]{1,64}$/.test(binding.uid) ? { uid: binding.uid } : {}),
    };

    // Inspector strictly requires a valid Kubernetes UID
    if (toolKind === "inspector" && !resource.uid) {
      return false;
    }

    const sessionKey = [clusterId, workspaceId, effectiveLeafId, toolKind].join("/");
    const state: DetachedPanelState = {
      panelId: effectiveLeafId,
      panelKind,
      workspaceId,
      clusterId,
      namespace: resource.namespace,
      resource,
      sessionKey,
      isDetached: true,
      detachedAt: Date.now(),
    };

    // Safe stream ownership transfer: notify local stream to stop before transfer
    this.dependencies.onStreamStopRequested?.(effectiveLeafId);

    // If IPC invoke is available, do NOT mark panel as detached until BrowserWindow is confirmed
    if (this.dependencies.invoke) {
      try {
        const container = options?.container || (binding as any).container || binding.name;
        const logsPayload = toolKind === "logs" ? {
          container,
          ...(options?.pod ? { pod: options.pod } : {}),
          tailLines: 500,
          previous: false,
          timestamps: true,
        } : undefined;

        const result = (await this.dependencies.invoke("detached-tool:request-detach", {
          clusterId,
          workspaceId,
          tabId: effectiveLeafId,
          toolKind,
          resource,
          logs: logsPayload,
        })) as { windowId?: number } | undefined;

        if (result?.windowId) {
          const confirmedState: DetachedPanelState = {
            ...state,
            windowId: result.windowId,
          };
          this.detachedPanels.set(leafId, confirmedState);
          if (effectiveLeafId !== leafId) {
            this.detachedPanels.set(effectiveLeafId, confirmedState);
          }
          return true;
        } else {
          // Window creation did not confirm a valid windowId: rollback stream ownership
          this.dependencies.onStreamResumeRequested?.(effectiveLeafId);
          return false;
        }
      } catch (err) {
        // Rollback stream ownership and previous state on IPC failure
        this.dependencies.onStreamResumeRequested?.(effectiveLeafId);
        throw err;
      }
    } else {
      // In standalone unit tests without IPC
      this.detachedPanels.set(leafId, state);
      if (effectiveLeafId !== leafId) {
        this.detachedPanels.set(effectiveLeafId, state);
      }
      return true;
    }

    return true;
  }

  /**
   * H7.5: a list panel opens a read-only window fed by Main. It is marked detached (and its
   * docked view unmounted) only once Main confirms the window; any failure leaves it docked.
   */
  private async detachListPanel(
    leafId: string,
    panelId: string,
    panelKind: PanelKind,
    clusterId: string,
    kind: "Pod" | "Deployment",
    namespace?: string,
  ): Promise<boolean> {
    const workspaceId = this.dependencies.detachWorkspaceId || this.activeWorkspaceId || "default";
    const tabId = detachedTabIdOf({ panelKind, panelId });
    const state: DetachedPanelState = {
      panelId,
      panelKind,
      workspaceId,
      clusterId,
      namespace,
      sessionKey: [clusterId, workspaceId, tabId, "resource-list"].join("/"),
      isDetached: true,
      detachedAt: Date.now(),
    };

    if (!this.dependencies.invoke) {
      return false;
    }

    const result = (await this.dependencies.invoke("detached-tool:request-detach", {
      clusterId,
      workspaceId,
      tabId,
      toolKind: "resource-list",
      list: { kind, ...(namespace ? { namespace } : {}) },
    })) as { windowId?: number } | undefined;

    if (!result?.windowId) {
      return false;
    }

    runInAction(() => {
      const confirmed = { ...state, windowId: result.windowId };

      this.detachedPanels.set(panelId, confirmed);
      if (leafId !== panelId) this.detachedPanels.set(leafId, confirmed);
    });

    return true;
  }

  @action
  public async redockPanel(leafId: string): Promise<boolean> {
    let state = this.detachedPanels.get(leafId);
    let matchedKey = leafId;
    if (!state) {
      for (const [key, val] of this.detachedPanels.entries()) {
        if (val.panelId === leafId || val.panelKind === leafId || key === leafId) {
          state = val;
          matchedKey = key;
          break;
        }
      }
    }

    if (!state) return false;

    const clusterId = state.clusterId;
    const workspaceId = state.workspaceId;
    const toolKind = detachedToolKindOf(state.panelKind);
    const tabId = detachedTabIdOf(state);

    if (this.dependencies.invoke) {
      try {
        await this.dependencies.invoke("detached-tool:frame-request-redock", {
          clusterId,
          workspaceId,
          tabId,
          toolKind,
        });
      } catch {
        // Redock cleanup continues even if window was closed via OS
      }
    }

    const { panelId } = state;

    runInAction(() => {
      this.detachedPanels.delete(matchedKey);
      this.detachedPanels.delete(panelId);
      this.detachedPanels.delete(leafId);
    });
    this.dependencies.onStreamResumeRequested?.(panelId);

    return true;
  }

  @action
  public onPanelRedocked(notice: { clusterId?: string; workspaceId?: string; tabId?: string; toolKind?: string; sessionKey?: string }): void {
    if (this.isDisposed) {
      return;
    }

    if (!notice?.tabId) {
      return;
    }

    const { tabId, clusterId, workspaceId, toolKind, sessionKey } = notice;

    // Fail-closed: clusterId mismatch against active store clusterId
    if (clusterId && this.clusterId && clusterId !== this.clusterId) {
      return;
    }

    // Find registered detached session matching this notice
    let matchedKey: string | undefined;
    let matchedState: DetachedPanelState | undefined;

    for (const [key, val] of this.detachedPanels.entries()) {
      const isTabMatch = (key === tabId || val.panelId === tabId || val.panelKind === tabId);
      if (!isTabMatch) continue;

      if (clusterId && val.clusterId && clusterId !== val.clusterId) {
        continue;
      }

      if (workspaceId && val.workspaceId && workspaceId !== val.workspaceId) {
        continue;
      }

      if (toolKind) {
        const expectedToolKind = detachedToolKindOf(val.panelKind);
        if (toolKind !== expectedToolKind && toolKind !== val.panelKind) {
          continue;
        }
      }

      if (sessionKey && val.sessionKey && sessionKey !== val.sessionKey) {
        continue;
      }

      matchedKey = key;
      matchedState = val;
      break;
    }

    // Fail-closed: do not modify registry or resume stream if no registered session matches
    if (!matchedState || !matchedKey) {
      return;
    }

    // Clean up all keys pointing to this session to prevent duplicate redock handling
    const effectivePanelId = matchedState.panelId;
    const keysToDelete: string[] = [];

    for (const [key, val] of this.detachedPanels.entries()) {
      if (val === matchedState || key === matchedKey || val.panelId === effectivePanelId || val.sessionKey === matchedState.sessionKey) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.detachedPanels.delete(key);
    }

    // Resume stream exactly once
    this.dependencies.onStreamResumeRequested?.(effectivePanelId);
  }

  private persistTimer: NodeJS.Timeout | null = null;
  public lastPersistedAt: number = 0;

  @action
  public updateDetachedGeometry(leafId: string, geometry: WindowGeometry): void {
    const state = this.getDetachedState(leafId);

    if (state) {
      const updated: DetachedPanelState = {
        ...state,
        geometry,
      };

      this.detachedPanels.set(leafId, updated);
      if (state.panelId !== leafId) {
        this.detachedPanels.set(state.panelId, updated);
      }
      this.persistToStorage();
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.redockDisposer) {
      this.redockDisposer();
      this.redockDisposer = undefined;
    }
  }

  public serializeLayout(targetVersion: 1): SerializedSplitLayoutV1;
  public serializeLayout(targetVersion: 2): SerializedSplitLayoutV2;
  public serializeLayout(targetVersion?: 3 | "LayoutV1"): LayoutV1;
  public serializeLayout(targetVersion?: 1 | 2 | 3 | "LayoutV1"): SerializedSplitLayout;
  public serializeLayout(targetVersion: 1 | 2 | 3 | "LayoutV1" = "LayoutV1"): SerializedSplitLayout {
    if (targetVersion === 1) {
      return {
        version: 1,
        ratio: this.ratio,
        isSwapped: this.isSwapped,
        isLeftClosed: this.isLeftClosed,
        isRightClosed: this.isRightClosed,
        isClassicMode: this.isClassicMode,
        leftPanelKind: "kubetail",
        rightPanelKind: "resource-details",
        resourceBinding: this.resourceBinding
          ? {
              kind: this.resourceBinding.kind,
              name: this.resourceBinding.name,
              namespace: this.resourceBinding.namespace ?? "",
            }
          : undefined,
      };
    }

    if (targetVersion === 2) {
      return {
        version: 2,
        activeWorkspaceId: this.activeWorkspaceId,
        isClassicMode: this.isClassicMode,
        maximizedPanelId: this.maximizedPanelId,
        rootNode: this.rootNode,
      };
    }

    // Default: LayoutV1 (Milestone H4)
    const uniqueDetached = new Map<string, DetachedPanelState>();

    for (const val of this.detachedPanels.values()) {
      if (!uniqueDetached.has(val.sessionKey)) {
        uniqueDetached.set(val.sessionKey, val);
      }
    }

    const detachedWindows: PersistedDetachedWindow[] = Array.from(uniqueDetached.values()).map(state => ({
      panelId: state.panelId,
      panelKind: state.panelKind,
      workspaceId: state.workspaceId,
      clusterId: state.clusterId,
      sessionKey: state.sessionKey,
      title: state.resource ? `${state.resource.kind}: ${state.resource.name}` : undefined,
      resource: state.resource,
      geometry: state.geometry,
      detachedAt: state.detachedAt || Date.now(),
    }));

    const customWorkspaces: Record<string, any> = {};

    if (WORKSPACE_TEMPLATES["custom"]) {
      customWorkspaces["custom"] = {
        id: "custom",
        name: WORKSPACE_TEMPLATES["custom"].name,
        description: WORKSPACE_TEMPLATES["custom"].description,
        layout: WORKSPACE_TEMPLATES["custom"].layout,
      };
    }

    return {
      schemaVersion: "LayoutV1",
      version: 3,
      updatedAt: Date.now(),
      activeWorkspaceId: this.activeWorkspaceId,
      isClassicMode: this.isClassicMode,
      maximizedPanelId: this.maximizedPanelId,
      rootNode: this.rootNode,
      detachedWindows,
      customWorkspaces: Object.keys(customWorkspaces).length > 0 ? customWorkspaces : undefined,
    };
  }

  @action
  public restoreLayout(data: unknown): boolean {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;

    const raw = data as Record<string, unknown>;

    // Handle LayoutV1 (H4)
    if (raw.schemaVersion === "LayoutV1" || raw.version === 3) {
      try {
        const sanitized = sanitizeSplitLayout(raw);

        if (!sanitized || (sanitized as any).schemaVersion !== "LayoutV1") return false;
        const v1 = sanitized as LayoutV1;

        this.rootNode = v1.rootNode;
        this.activeWorkspaceId = (v1.activeWorkspaceId as WorkspaceTemplateId) || "custom";
        this.isClassicMode = Boolean(v1.isClassicMode);
        this.maximizedPanelId = typeof v1.maximizedPanelId === "string" ? v1.maximizedPanelId : undefined;

        if (isBranchNode(this.rootNode)) {
          this.ratio = this.rootNode.ratio;
        }

        if (v1.customWorkspaces) {
          for (const [key, ws] of Object.entries(v1.customWorkspaces)) {
            WORKSPACE_TEMPLATES[key as WorkspaceTemplateId] = {
              id: ws.id as WorkspaceTemplateId,
              name: ws.name,
              description: ws.description,
              icon: "dashboard_customize",
              layout: ws.layout,
            };
          }
        }

        // Inert restoration of detached windows (session intention without alive window handles)
        this.detachedPanels.clear();
        if (Array.isArray(v1.detachedWindows)) {
          for (const win of v1.detachedWindows) {
            const state: DetachedPanelState = {
              panelId: win.panelId,
              panelKind: win.panelKind,
              workspaceId: win.workspaceId,
              clusterId: win.clusterId,
              sessionKey: win.sessionKey,
              resource: win.resource,
              isDetached: true,
              detachedAt: win.detachedAt,
              geometry: win.geometry,
              windowId: undefined, // INERT: not opened yet!
            };

            this.detachedPanels.set(win.panelId, state);
          }
        }

        return true;
      } catch {
        return false;
      }
    }

    // Handle Version 2
    if (raw.version === 2 && raw.rootNode && typeof raw.rootNode === "object") {
      try {
        const sanitized = sanitizeSplitLayout(raw);

        if (!sanitized || sanitized.version !== 2) return false;

        this.rootNode = sanitized.rootNode;
        this.activeWorkspaceId = (sanitized.activeWorkspaceId as WorkspaceTemplateId) || "custom";
        this.isClassicMode = Boolean(sanitized.isClassicMode);
        this.maximizedPanelId = typeof sanitized.maximizedPanelId === "string" ? sanitized.maximizedPanelId : undefined;

        if (isBranchNode(this.rootNode)) {
          this.ratio = this.rootNode.ratio;
        }

        return true;
      } catch {
        return false;
      }
    }

    // Handle Version 1 fallback (H1 migration)
    if (raw.version === 1) {
      const sanitized = sanitizeSplitLayout(raw);

      if (!sanitized || sanitized.version !== 1) return false;

      this.ratio = Math.max(MIN_SPLIT_RATIO, Math.min(sanitized.ratio, MAX_SPLIT_RATIO));
      this.isSwapped = sanitized.isSwapped;
      this.isLeftClosed = sanitized.isLeftClosed;
      this.isRightClosed = sanitized.isRightClosed;
      this.isClassicMode = sanitized.isClassicMode;

      if (sanitized.resourceBinding) {
        this.resourceBinding = {
          kind: sanitized.resourceBinding.kind,
          name: sanitized.resourceBinding.name,
          namespace: sanitized.resourceBinding.namespace,
        };
      }

      const leftKind = sanitized.isSwapped ? "resource-details" : "kubetail";
      const rightKind = sanitized.isSwapped ? "kubetail" : "resource-details";
      const first = createLeafNode(leftKind);
      const second = createLeafNode(rightKind);

      this.rootNode = createBranchNode("horizontal", this.ratio, first, second);
      this.activeWorkspaceId = "h1-default";

      return true;
    }

    return false;
  }

  public persistToStorage(immediate = false): void {
    if (this.isDisposed) return;

    if (immediate) {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
        this.persistTimer = null;
      }
      this.doPersist();

      return;
    }

    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.doPersist();
    }, 300);
  }

  private doPersist(): void {
    if (this.isDisposed) return;

    try {
      const layoutObj = this.serializeLayout("LayoutV1");

      assertNoSensitiveFields(layoutObj, "persistLayout");
      const serialized = JSON.stringify(layoutObj);

      if (this.dependencies.setLocalStorageItem) {
        this.dependencies.setLocalStorageItem("openlens:split-layout", serialized);
      } else if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("openlens:split-layout", serialized);
      }
      this.lastPersistedAt = Date.now();
    } catch {
      // Storage unavailable or sandboxed
    }
  }

  private hydrateFromStorage(): void {
    let raw: string | null = null;

    try {
      if (this.dependencies.getLocalStorageItem) {
        raw = this.dependencies.getLocalStorageItem("openlens:split-layout");
      } else if (typeof window !== "undefined" && window.localStorage) {
        raw = window.localStorage.getItem("openlens:split-layout");
      }

      if (raw) {
        const parsed = JSON.parse(raw);
        const success = this.restoreLayout(parsed);

        if (!success) {
          throw new Error("Invalid or incompatible layout payload");
        }
      }
    } catch {
      if (raw) {
        try {
          if (this.dependencies.setLocalStorageItem) {
            this.dependencies.setLocalStorageItem("openlens:split-layout:corrupted-backup", raw);
          } else if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("openlens:split-layout:corrupted-backup", raw);
          }
        } catch {
          // Ignore secondary storage failure
        }
      }

      this.rootNode = WORKSPACE_TEMPLATES["h1-default"].layout;
      this.activeWorkspaceId = "h1-default";
    }
  }
}

// H7.2 drag & drop tree operations (kept here with the other tree helpers to avoid a circular import).

export type DockPosition = "left" | "right" | "top" | "bottom" | "center";

/**
 * The renderer lays "horizontal" branches out as a row (first | second) and
 * "vertical" branches as a column (first above second).
 */
export function getDockOrientation(position: Exclude<DockPosition, "center">): SplitOrientation {
  return position === "left" || position === "right" ? "horizontal" : "vertical";
}

export function findParentGroup(root: SplitLayoutNode, leafId: string): SplitLayoutGroup | undefined {
  if (isGroupNode(root)) {
    return root.panels.some((panel) => panel.id === leafId) ? root : undefined;
  }

  if (isBranchNode(root)) {
    return findParentGroup(root.first, leafId) ?? findParentGroup(root.second, leafId);
  }

  return undefined;
}

function replaceNode(root: SplitLayoutNode, id: string, replace: (node: SplitLayoutNode) => SplitLayoutNode): SplitLayoutNode {
  if (root.id === id) {
    return replace(root);
  }

  if (isBranchNode(root)) {
    return { ...root, first: replaceNode(root.first, id, replace), second: replaceNode(root.second, id, replace) };
  }

  return root;
}

// Visible structure only (ignores generated branch/group ids and ratios), to detect no-op drops.
function layoutShape(node: SplitLayoutNode): string {
  if (isBranchNode(node)) {
    return `${node.orientation}(${layoutShape(node.first)},${layoutShape(node.second)})`;
  }

  if (isGroupNode(node)) {
    return `tabs(${node.panels.map((panel) => panel.id).join(",")}|${node.activePanelId})`;
  }

  return node.id;
}

function hasSameLeaves(before: SplitLayoutNode, after: SplitLayoutNode): boolean {
  const a = getAllLeaves(before).map((leaf) => leaf.id).sort();
  const b = getAllLeaves(after).map((leaf) => leaf.id).sort();

  return a.length === b.length && new Set(b).size === b.length && a.every((id, index) => id === b[index]);
}

function reorderWithinGroup(root: SplitLayoutNode, group: SplitLayoutGroup, source: SplitLayoutLeaf, targetLeafId: string): SplitLayoutNode | undefined {
  const others = group.panels.filter((panel) => panel.id !== source.id);
  const targetIndex = others.findIndex((panel) => panel.id === targetLeafId);
  const panels = [...others.slice(0, targetIndex), source, ...others.slice(targetIndex)];
  const unchanged = panels.every((panel, index) => panel.id === group.panels[index].id) && group.activePanelId === source.id;

  return unchanged ? undefined : replaceNode(root, group.id, () => ({ ...group, panels, activePanelId: source.id }));
}

/**
 * Moves one leaf next to (or into the tab group of) another leaf.
 *
 * - left/right/top/bottom split the target's container: the tab group holding the
 *   target when there is one, otherwise the target leaf itself. left/top insert the
 *   source as `first`, right/bottom as `second`.
 * - center groups source and target as tabs; inside the same group it reorders the
 *   source before the target.
 * - Removing the source compacts the tree (single-child branches and single-tab
 *   groups collapse), via removeLeafFromTree.
 *
 * Returns undefined for any invalid or no-op move; the input tree is never mutated.
 */
export function dockLeafInTree(
  root: SplitLayoutNode,
  sourceLeafId: string,
  targetLeafId: string,
  position: DockPosition,
): SplitLayoutNode | undefined {
  // Only the active tab of a group is rendered, so a side drop on it means "beside my own group".
  const ownGroupSibling = sourceLeafId === targetLeafId && position !== "center"
    ? findParentGroup(root, sourceLeafId)?.panels.find((panel) => panel.id !== sourceLeafId)
    : undefined;
  const effectiveTargetId = ownGroupSibling?.id ?? targetLeafId;

  if (sourceLeafId === effectiveTargetId || getAllLeaves(root).length < 2) {
    return undefined;
  }

  const source = findNodeById(root, sourceLeafId);
  const target = findNodeById(root, effectiveTargetId);

  if (!source || !target || !isLeafNode(source) || !isLeafNode(target)) {
    return undefined;
  }

  let next: SplitLayoutNode | undefined;

  if (position === "center") {
    const sourceGroup = findParentGroup(root, sourceLeafId);

    next = sourceGroup && sourceGroup === findParentGroup(root, effectiveTargetId)
      ? reorderWithinGroup(root, sourceGroup, source, effectiveTargetId)
      : groupLeavesInTree(removeLeafFromTree(root, sourceLeafId), effectiveTargetId, source);
  } else {
    const withoutSource = removeLeafFromTree(root, sourceLeafId);
    const containerId = findParentGroup(withoutSource, effectiveTargetId)?.id ?? effectiveTargetId;
    const sourceFirst = position === "left" || position === "top";

    next = replaceNode(withoutSource, containerId, (container) => (
      sourceFirst
        ? createBranchNode(getDockOrientation(position), 0.5, source, container)
        : createBranchNode(getDockOrientation(position), 0.5, container, source)
    ));
  }

  return next && hasSameLeaves(root, next) && layoutShape(next) !== layoutShape(root) ? next : undefined;
}
