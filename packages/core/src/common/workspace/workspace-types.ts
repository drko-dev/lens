/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterEnvironment } from "../cluster/environment-types";

export type WorkspaceId = string;

/**
 * Metadata and cluster associations for a logical workspace.
 */
export interface WorkspaceContext {
  readonly id: WorkspaceId;
  readonly name: string;
  readonly activeClusterId?: string;
  readonly clusterIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * Immutable cluster context bound to an explicit cluster identifier.
 * Prevents dynamic drift or fallback to global currentCluster.
 */
export interface ClusterContext {
  readonly clusterId: string;
  readonly name: string;
  readonly environment: ClusterEnvironment;
  readonly isProduction: boolean;
  readonly accessibleNamespaces?: readonly string[];
}

/**
 * Base properties shared across all workspace tabs.
 * Invariant: workspaceId and clusterId are immutable.
 */
export interface BaseWorkspaceTab {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly clusterId: string;
  title: string;
  pinned?: boolean;
  createdAt: number;
}

export interface ResourceWorkspaceTab extends BaseWorkspaceTab {
  kind: "resource";
  resourceKind: string;
  apiGroup?: string;
  namespace?: string;
  resourceName?: string;
  resourceUid?: string;
}

export interface EditorWorkspaceTab extends BaseWorkspaceTab {
  kind: "editor";
  resourceKind: string;
  namespace?: string;
  resourceName?: string;
  mode: "view" | "edit" | "diff";
}

export interface LogsWorkspaceTab extends BaseWorkspaceTab {
  kind: "logs";
  podName: string;
  namespace: string;
  container?: string;
  sinceTime?: string;
}

export interface TerminalWorkspaceTab extends BaseWorkspaceTab {
  kind: "terminal";
  podName?: string;
  namespace?: string;
  container?: string;
}

export interface PortForwardWorkspaceTab extends BaseWorkspaceTab {
  kind: "port-forward";
  resourceKind?: "pod" | "service";
  resourceName?: string;
  namespace?: string;
  port?: number;
}

export interface InspectorWorkspaceTab extends BaseWorkspaceTab {
  kind: "inspector";
  subjectKind: string;
  subjectName: string;
  namespace?: string;
}

export interface ClusterWorkspaceTab extends BaseWorkspaceTab {
  kind: "cluster";
  environment?: ClusterEnvironment;
  isProduction?: boolean;
  accentColor?: string;
  customEnvironmentName?: string;
  path?: string;
}

/**
 * Discriminated union of all workspace tab variants.
 */
export type WorkspaceTab =
  | ClusterWorkspaceTab
  | ResourceWorkspaceTab
  | EditorWorkspaceTab
  | LogsWorkspaceTab
  | TerminalWorkspaceTab
  | PortForwardWorkspaceTab
  | InspectorWorkspaceTab;

export type WorkspaceTabKind = WorkspaceTab["kind"];

/**
 * Layout configuration for a specific workspace.
 */
export interface WorkspaceLayout {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId?: string;
  readonly splitDirection?: "horizontal" | "vertical";
  readonly dockHeight?: number;
  readonly dockOpen?: boolean;
  readonly sidebarPinned?: boolean;
}

/**
 * Navigation history entries for tab switching.
 */
export interface NavigationHistoryEntry {
  readonly tabId: string;
  readonly workspaceId: WorkspaceId;
  readonly clusterId: string;
  readonly path?: string;
  readonly timestamp: number;
}

export interface WorkspaceNavigationHistory {
  readonly workspaceId: WorkspaceId;
  readonly entries: readonly NavigationHistoryEntry[];
  readonly currentIndex: number;
}

/**
 * Security context for a BrowserWindow instance.
 */
export interface WindowContext {
  readonly windowId: string;
  readonly windowType: "main" | "pilot" | "detached-dock" | "detached-terminal";
  readonly workspaceId: WorkspaceId;
  readonly allowedClusterIds: readonly string[];
  readonly allowedIpcChannels: readonly string[];
  readonly isIsolated: boolean;
}

/**
 * Canonical Version 1 representation of a persistent session snapshot.
 * Guarantees zero sensitive data (no tokens, credentials, PTY handles, draft YAML, or secret payloads).
 */
export interface SessionSnapshotV1 {
  version: 1;
  timestamp: number;
  activeWorkspaceId: WorkspaceId;
  workspaces: WorkspaceContext[];
  layouts: Record<WorkspaceId, WorkspaceLayout>;
  history?: Record<WorkspaceId, WorkspaceNavigationHistory>;
}

export type SessionSnapshot = SessionSnapshotV1;
