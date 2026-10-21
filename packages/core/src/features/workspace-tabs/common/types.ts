/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterEnvironment } from "../../../common/cluster/environment-types";
import type { WorkspaceId } from "../../../common/workspace/workspace-types";

/**
 * High-level cluster tab within an active workspace tab strip.
 * Invariant: workspaceId, tabId, and clusterId are immutable.
 */
export interface WorkspaceClusterTab {
  readonly tabId: string;
  readonly workspaceId: WorkspaceId;
  readonly clusterId: string;
  title: string;
  environment: ClusterEnvironment;
  isProduction: boolean;
  accentColor?: string;
  customEnvironmentName?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface WorkspaceTabsState {
  activeWorkspaceId: WorkspaceId;
  tabs: WorkspaceClusterTab[];
  activeTabId?: string;
}

export interface WorkspaceNavigationOptions {
  preservePath?: boolean;
}
