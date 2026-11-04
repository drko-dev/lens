/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { TabId } from "../dock/store";
import { ipcRenderer } from "electron";
import hostedClusterIdInjectable from "../../../cluster-frame-context/hosted-cluster-id.injectable";
import { TERMINAL_RELEASE_CHANNEL } from "../../../../common/terminal-shell-channels";
import terminalProdAuthorizationInjectable from "./prod-authorization.injectable";
import terminalStoreInjectable from "./store.injectable";

const clearTerminalTabDataInjectable = getInjectable({
  id: "clear-terminal-tab-data",

  instantiate: (di) => {
    const terminalStore = di.inject(terminalStoreInjectable);
    const auth = di.inject(terminalProdAuthorizationInjectable);
    const hostedClusterId = di.inject(hostedClusterIdInjectable);

    return (tabId: TabId): void => {
      terminalStore.destroy(tabId);
      auth.revoke(tabId);

    // Main also drops a grant that was never used; best effort, a failure only means the 60 s TTL applies.
    try {
      void ipcRenderer.invoke(TERMINAL_RELEASE_CHANNEL, { clusterId: hostedClusterId, tabId })?.catch?.(() => undefined);
    } catch {
      // not available (tests)
    }
    };
  },
});

export default clearTerminalTabDataInjectable;
