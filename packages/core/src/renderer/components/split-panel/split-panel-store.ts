/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, computed, makeObservable, observable } from "mobx";
import type {
  DetachedPanelState,
  PanelId,
  PanelKind,
  PanelResourceBinding,
  SerializedSplitLayout,
  SerializedSplitLayoutV1,
  SerializedSplitLayoutV2,
  SplitLayoutLeaf,
  SplitLayoutNode,
  SplitOrientation,
  WorkspaceTemplateId,
} from "./split-panel-types";
import {
  isBranchNode,
  isGroupNode,
  isLeafNode,
} from "./split-panel-types";
import {
  createBranchNode,
  createGroupNode,
  createLeafNode,
  WORKSPACE_TEMPLATES,
} from "./panel-catalog";

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
    if (this.allActiveLeaves.length <= 1) {
      // Don't close the only remaining panel; switch to classic view
      return;
    }

    if (this.maximizedPanelId === leafId) {
      this.maximizedPanelId = undefined;
    }

    this.rootNode = removeLeafFromTree(this.rootNode, leafId);
    this.activeWorkspaceId = "custom";
    this.persistToStorage();
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

    this.activeWorkspaceId = templateId;
    this.rootNode = JSON.parse(JSON.stringify(template.layout));
    this.maximizedPanelId = undefined;
    this.isLeftClosed = false;
    this.isRightClosed = false;
    this.isClassicMode = false;

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
    this.persistToStorage();
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
    options?: { resource?: PanelResourceBinding; clusterId?: string; container?: string; pod?: string },
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

    if (this.isPanelDetached(leafId) || this.isPanelDetached(effectiveLeafId)) return true;

    // Strict cluster context: resolve from options, store, or window location; reject if empty
    const clusterId =
      options?.clusterId ||
      this.clusterId ||
      (typeof location !== "undefined" && location?.host ? location.host.split(":")[0].split(".").slice(-3, -2)[0] : undefined);

    if (!clusterId || typeof clusterId !== "string" || clusterId.trim() === "") {
      return false;
    }

    // Strict resource reference: eliminate all hardcoded demo fallbacks
    const binding = options?.resource || this.resourceBinding;
    if (!binding || !binding.name || !binding.kind || !binding.namespace) {
      return false;
    }

    const workspaceId = this.activeWorkspaceId || "default";
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
    const toolKind = state.panelKind === "resource-details" ? "inspector" : "logs";
    const tabId = state.panelId;

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

    this.detachedPanels.delete(matchedKey);
    this.detachedPanels.delete(tabId);
    this.detachedPanels.delete(leafId);
    this.dependencies.onStreamResumeRequested?.(tabId);

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
        const expectedToolKind = val.panelKind === "resource-details" ? "inspector" : "logs";
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

  public dispose(): void {
    this.isDisposed = true;
    if (this.redockDisposer) {
      this.redockDisposer();
      this.redockDisposer = undefined;
    }
  }

  public serializeLayout(targetVersion: 1): SerializedSplitLayoutV1;
  public serializeLayout(targetVersion?: 2): SerializedSplitLayoutV2;
  public serializeLayout(targetVersion?: 1 | 2): SerializedSplitLayout;
  public serializeLayout(targetVersion: 1 | 2 = 2): SerializedSplitLayout {
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

    return {
      version: 2,
      activeWorkspaceId: this.activeWorkspaceId,
      isClassicMode: this.isClassicMode,
      maximizedPanelId: this.maximizedPanelId,
      rootNode: this.rootNode,
    };
  }

  @action
  public restoreLayout(data: unknown): boolean {
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;

    const raw = data as Record<string, unknown>;

    // Handle Version 2
    if (raw.version === 2 && raw.rootNode && typeof raw.rootNode === "object") {
      try {
        this.rootNode = raw.rootNode as SplitLayoutNode;
        this.activeWorkspaceId = (raw.activeWorkspaceId as WorkspaceTemplateId) || "custom";
        this.isClassicMode = Boolean(raw.isClassicMode);
        this.maximizedPanelId = typeof raw.maximizedPanelId === "string" ? raw.maximizedPanelId : undefined;

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
      if (typeof raw.ratio === "number" && !isNaN(raw.ratio)) {
        this.ratio = Math.max(MIN_SPLIT_RATIO, Math.min(raw.ratio, MAX_SPLIT_RATIO));
      }

      if (typeof raw.isSwapped === "boolean") {
        this.isSwapped = raw.isSwapped;
      }

      if (typeof raw.isLeftClosed === "boolean") {
        this.isLeftClosed = raw.isLeftClosed;
      }

      if (typeof raw.isRightClosed === "boolean") {
        this.isRightClosed = raw.isRightClosed;
      }

      if (this.isLeftClosed && this.isRightClosed) {
        this.isLeftClosed = false;
        this.isRightClosed = false;
      }

      if (typeof raw.isClassicMode === "boolean") {
        this.isClassicMode = raw.isClassicMode;
      }

      if (raw.resourceBinding && typeof raw.resourceBinding === "object") {
        const binding = raw.resourceBinding as Record<string, unknown>;

        if (
          typeof binding.kind === "string" &&
          typeof binding.name === "string" &&
          typeof binding.namespace === "string"
        ) {
          this.resourceBinding = {
            kind: binding.kind.slice(0, 64),
            name: binding.name.slice(0, 253),
            namespace: binding.namespace.slice(0, 253),
          };
        }
      }

      // Convert V1 to V2 rootNode
      const leftKind = (raw.leftPanelKind as PanelKind) || "kubetail";
      const rightKind = (raw.rightPanelKind as PanelKind) || "resource-details";
      const first = createLeafNode(this.isSwapped ? rightKind : leftKind);
      const second = createLeafNode(this.isSwapped ? leftKind : rightKind);

      this.rootNode = createBranchNode("horizontal", this.ratio, first, second);
      this.activeWorkspaceId = "h1-default";

      return true;
    }

    return false;
  }

  private persistToStorage(): void {
    const serialized = JSON.stringify(this.serializeLayout());

    try {
      if (this.dependencies.setLocalStorageItem) {
        this.dependencies.setLocalStorageItem("openlens:split-layout", serialized);
      } else if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem("openlens:split-layout", serialized);
      }
    } catch {
      // Storage unavailable or sandboxed
    }
  }

  private hydrateFromStorage(): void {
    try {
      let raw: string | null = null;

      if (this.dependencies.getLocalStorageItem) {
        raw = this.dependencies.getLocalStorageItem("openlens:split-layout");
      } else if (typeof window !== "undefined" && window.localStorage) {
        raw = window.localStorage.getItem("openlens:split-layout");
      }

      if (raw) {
        const parsed = JSON.parse(raw);

        this.restoreLayout(parsed);
      }
    } catch {
      // Fallback to default template
      this.rootNode = WORKSPACE_TEMPLATES["h1-default"].layout;
    }
  }
}
