/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import navigateToClusterViewInjectable from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import navigateToCatalogInjectable from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import workspaceHistoryManagerInjectable from "../common/workspace-history.injectable";
import { WorkspaceTabsStore } from "./workspace-tabs-store";

const workspaceTabsStoreInjectable = getInjectable({
  id: "workspace-tabs-store",

  instantiate: (di) =>
    new WorkspaceTabsStore({
      logger: di.inject(loggerInjectionToken),
      getClusterById: di.inject(getClusterByIdInjectable),
      navigateToClusterView: di.inject(navigateToClusterViewInjectable),
      navigateToCatalog: di.inject(navigateToCatalogInjectable),
      historyManager: di.inject(workspaceHistoryManagerInjectable),
    }),
});

export default workspaceTabsStoreInjectable;
