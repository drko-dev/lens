/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { TabId } from "../dock/store";
import terminalProdAuthorizationInjectable from "./prod-authorization.injectable";
import terminalStoreInjectable from "./store.injectable";

const clearTerminalTabDataInjectable = getInjectable({
  id: "clear-terminal-tab-data",

  instantiate: (di) => {
    const terminalStore = di.inject(terminalStoreInjectable);
    const auth = di.inject(terminalProdAuthorizationInjectable);

    return (tabId: TabId): void => {
      terminalStore.destroy(tabId);
      auth.revoke(tabId);
    };
  },
});

export default clearTerminalTabDataInjectable;
