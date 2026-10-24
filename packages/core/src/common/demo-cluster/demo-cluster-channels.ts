/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getRequestChannel } from "@openlens/messaging";

export interface DemoClusterStatus {
  isRunning: boolean;
  port?: number;
  clusterId?: string;
  kubeconfigPath?: string;
  serverUrl?: string;
}

export const startDemoClusterChannel = getRequestChannel<void, DemoClusterStatus>("start-demo-cluster");
export const stopDemoClusterChannel = getRequestChannel<void, void>("stop-demo-cluster");
export const getDemoClusterStatusChannel = getRequestChannel<void, DemoClusterStatus>("get-demo-cluster-status");
