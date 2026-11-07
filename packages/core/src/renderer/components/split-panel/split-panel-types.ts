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
  | "statefulsets"
  | "daemonsets"
  | "replicasets"
  | "jobs"
  | "cronjobs"
  | "configmaps"
  | "services"
  | "ingresses"
  | "persistentvolumeclaims"
  | "nodes"
  | "events"
  | "pod-logs"
  | "terminal"
  | "resource-editor"
  // H7.6.4: root-frame views (no cluster), hosted only by the root panel store.
  | "settings"
  | "catalog"
  // H8: AI Incident Workbench
  | "incident-workbench";

/**
 * Bound Kubernetes resource metadata.
 */
export interface PanelResourceBinding {
  /** H7.6.3: cluster the resource belongs to; a bound panel never renders another cluster's object. */
  readonly clusterId?: string;
  readonly apiVersion?: string;
  readonly kind: string;
  readonly namespace?: string;
  readonly name: string;
  readonly uid?: string;
  /** H7.6.3B: specific container when bound to logs */
  readonly selfLink?: string;
  container?: string;
  /** H7.6.3B: stable dock tab id when bound to logs */
  readonly tabId?: string;
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
  /** H7.6.1: offered only by stores with an explicit panel policy (global docking), never by Kubetail. */
  readonly policyOnly?: boolean;
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

/**
 * Window geometry coordinates and dimensions for multi-monitor persistence (H4).
 */
export interface WindowGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized?: boolean;
  readonly displayId?: number;
}

/**
 * Persisted representation of a detached window intention (H4).
 */
export interface PersistedDetachedWindow {
  readonly panelId: string;
  readonly panelKind: PanelKind;
  readonly workspaceId: string;
  readonly clusterId: string;
  readonly sessionKey: string;
  readonly title?: string;
  readonly resource?: {
    readonly kind: string;
    readonly name: string;
    readonly namespace?: string;
    readonly uid?: string;
    readonly apiVersion?: string;
  };
  readonly geometry?: WindowGeometry;
  readonly detachedAt: number;
}

/**
 * Milestone H4: Global versioned layout persistence schema (LayoutV1).
 * Represents declarative visual intent, panels, splits, tabs, and detached windows.
 * Guarantees zero sensitive data (no tokens, credentials, PTYs, buffers, or secret payloads).
 */
export interface LayoutV1 {
  readonly schemaVersion: "LayoutV1";
  readonly version?: 3; // numeric alias for schema compatibility checks
  readonly updatedAt: number;
  readonly activeWorkspaceId: WorkspaceTemplateId | string;
  readonly isClassicMode: boolean;
  readonly maximizedPanelId?: string;
  readonly rootNode: SplitLayoutNode;
  readonly detachedWindows: PersistedDetachedWindow[];
  readonly customWorkspaces?: Record<string, {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly layout: SplitLayoutNode;
  }>;
}

export type SerializedSplitLayout = SerializedSplitLayoutV1 | SerializedSplitLayoutV2 | LayoutV1;

export function isLayoutV1(data: unknown): data is LayoutV1 {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const raw = data as Record<string, unknown>;

  return raw.schemaVersion === "LayoutV1" || raw.version === 3;
}

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
  readonly geometry?: WindowGeometry;
}
