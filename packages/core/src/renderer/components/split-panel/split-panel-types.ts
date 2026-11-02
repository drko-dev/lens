/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Unique stable identifier for an instantiated panel.
 */
export type PanelId = string;

/**
 * Recognized variants of dockable/split tools and views.
 */
export type PanelKind =
  | "kubetail"
  | "resource-details"
  | "pods"
  | "deployments"
  | "events"
  | "terminal"
  | "resource-editor";

/**
 * Bound Kubernetes resource metadata.
 */
export interface PanelResourceBinding {
  readonly apiVersion?: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly uid?: string;
}

/**
 * Configuration and lifecycle descriptor for an independent panel.
 */
export interface PanelDescriptor {
  readonly id: PanelId;
  readonly kind: PanelKind;
  readonly clusterId: string;
  readonly title: string;
  readonly icon?: string;
  readonly closable: boolean;
  readonly pinnable?: boolean;
  readonly resourceBinding?: PanelResourceBinding;
  readonly createdAt: number;
}

/**
 * Catalog item descriptor for the "+ Agregar panel" catalog selector.
 */
export interface PanelCatalogItem {
  readonly kind: PanelKind;
  readonly name: string;
  readonly description: string;
  readonly icon: string; // Material icon name
  readonly category: "observability" | "workloads" | "details" | "tools";
  readonly available: boolean;
  readonly unavailableReason?: string;
  readonly defaultTitle: string;
}

/**
 * Group of panels hosted in the same docking slot/region as tabs.
 */
export interface PanelTabGroup {
  readonly id: string;
  readonly panelIds: readonly PanelId[];
  readonly activePanelId: PanelId;
}

/**
 * Direction of split division.
 */
export type SplitOrientation = "horizontal" | "vertical";

/**
 * Branch node representing a split with two children and a relative ratio (0.15 to 0.85).
 */
export interface SplitLayoutBranch {
  readonly type: "branch";
  readonly id: string;
  readonly orientation: SplitOrientation;
  readonly ratio: number;
  readonly first: SplitLayoutNode;
  readonly second: SplitLayoutNode;
}

/**
 * Group node representing multiple panels stacked in tabs within the same region.
 */
export interface SplitLayoutGroup {
  readonly type: "group";
  readonly id: string;
  readonly activePanelId: string;
  readonly panels: SplitLayoutLeaf[];
}

/**
 * Leaf node representing an active panel.
 */
export interface SplitLayoutLeaf {
  readonly type: "leaf";
  readonly id: string;
  readonly panelKind: PanelKind;
  readonly title?: string;
  readonly resourceBinding?: PanelResourceBinding;
  readonly isMaximized?: boolean;
}

/**
 * Recursive tree node for dynamic multi-panel layouts.
 */
export type SplitLayoutNode = SplitLayoutBranch | SplitLayoutGroup | SplitLayoutLeaf;

export function isBranchNode(node: SplitLayoutNode): node is SplitLayoutBranch {
  return node.type === "branch";
}

export function isGroupNode(node: SplitLayoutNode): node is SplitLayoutGroup {
  return node.type === "group";
}

export function isLeafNode(node: SplitLayoutNode): node is SplitLayoutLeaf {
  return node.type === "leaf";
}

/**
 * Identifiers for built-in and user-configured workspace layouts.
 */
export type WorkspaceTemplateId =
  | "operation"
  | "incidents"
  | "development"
  | "h1-default"
  | "custom";

export interface WorkspaceTemplate {
  readonly id: WorkspaceTemplateId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly layout: SplitLayoutNode;
}

/**
 * Safe, versioned, JSON-serializable representation of split panel layout (Version 1).
 */
export interface SerializedSplitLayoutV1 {
  readonly version: 1;
  readonly ratio: number;
  readonly isSwapped: boolean;
  readonly isLeftClosed: boolean;
  readonly isRightClosed: boolean;
  readonly isClassicMode: boolean;
  readonly leftPanelKind: PanelKind;
  readonly rightPanelKind: PanelKind;
  readonly resourceBinding?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace: string;
  };
}

/**
 * Safe, versioned, JSON-serializable representation of dynamic multi-panel layout (Version 2).
 * Guarantees zero sensitive data (no tokens, credentials, secret payloads, buffers).
 */
export interface SerializedSplitLayoutV2 {
  readonly version: 2;
  readonly activeWorkspaceId: WorkspaceTemplateId;
  readonly isClassicMode: boolean;
  readonly rootNode: SplitLayoutNode;
  readonly maximizedPanelId?: string;
}

export type SerializedSplitLayout = SerializedSplitLayoutV1 | SerializedSplitLayoutV2;

/**
 * Descriptor of a panel detached into an external native Electron window.
 */
export interface DetachedPanelState {
  readonly panelId: string;
  readonly panelKind: PanelKind;
  readonly workspaceId: string;
  readonly clusterId: string;
  readonly namespace?: string;
  readonly resource?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly apiVersion?: string;
  };
  readonly sessionKey: string;
  readonly windowId?: number;
  readonly isDetached: boolean;
  readonly detachedAt?: number;
}
