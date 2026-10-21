/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { WorkspaceHistoryManager } from "./workspace-history";

const workspaceHistoryManagerInjectable = getInjectable({
  id: "workspace-history-manager",
  instantiate: () => new WorkspaceHistoryManager(),
});

export default workspaceHistoryManagerInjectable;
