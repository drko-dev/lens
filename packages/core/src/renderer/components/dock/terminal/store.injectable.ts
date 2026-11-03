/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { TerminalStore } from "./store";
import createTerminalInjectable from "./create-terminal.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import terminalProdAuthorizationInjectable from "./prod-authorization.injectable";
import { createToolContextFromCluster } from "../../../../common/workspace/tool-context";
import createTerminalApiInjectable from "../../../api/create-terminal-api.injectable";

const terminalStoreInjectable = getInjectable({
  id: "terminal-store",

  instantiate: (di) => {
    const auth = di.inject(terminalProdAuthorizationInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);

    return new TerminalStore({
      createTerminal: di.inject(createTerminalInjectable),
      createTerminalApi: di.inject(createTerminalApiInjectable),
      // Fail closed: a PROD cluster needs an authorization bound to this exact session.
      isConnectAllowed: (tabId) => (
        !createToolContextFromCluster(hostedCluster, tabId).isProduction
        || Boolean(hostedCluster && auth.isAuthorized(hostedCluster.id, tabId))
      ),
    });
  },
});

export default terminalStoreInjectable;
