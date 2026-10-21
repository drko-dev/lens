/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import path from "path";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import workspaceTabsStoreInjectable from "./workspace-tabs-store.injectable";
import workspaceHistoryManagerInjectable from "../common/workspace-history.injectable";
import workspaceTabsFeatureFlagInjectable from "../common/workspace-tabs-feature-flag.injectable";
import {
  FileWorkspaceSessionStorageAdapter,
  LocalStorageWorkspaceSessionStorageAdapter,
} from "./workspace-session-storage";
import { WorkspacePersistenceStore } from "./workspace-persistence-store";

const workspacePersistenceStoreInjectable = getInjectable({
  id: "workspace-persistence-store",

  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    let storageAdapter;

    try {
      const userDataDir = di.inject(directoryForUserDataInjectable);

      if (userDataDir) {
        storageAdapter = new FileWorkspaceSessionStorageAdapter(
          path.join(userDataDir, "lens-workspace-sessions.json"),
          logger,
        );
      }
    } catch {
      // Fallback if directoryForUserData is not available
    }

    if (!storageAdapter) {
      storageAdapter = new LocalStorageWorkspaceSessionStorageAdapter();
    }

    return new WorkspacePersistenceStore({
      logger,
      workspaceTabsStore: di.inject(workspaceTabsStoreInjectable),
      historyManager: di.inject(workspaceHistoryManagerInjectable),
      getClusterById: di.inject(getClusterByIdInjectable),
      featureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
      storageAdapter,
      debounceMs: 300,
    });
  },
});

export default workspacePersistenceStoreInjectable;
