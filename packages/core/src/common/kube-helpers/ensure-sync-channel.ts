/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { RequestChannel } from "@openlens/messaging";

/** Carries only an absolute path, never kubeconfig content or credentials. */
export const ensureKubeconfigSyncActiveChannel: RequestChannel<string, void> = {
  id: "ensure-kubeconfig-sync-active",
};
