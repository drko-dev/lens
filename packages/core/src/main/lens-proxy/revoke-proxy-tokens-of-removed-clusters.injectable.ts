/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { reaction } from "mobx";
import clustersStateInjectable from "../../features/cluster/storage/common/state.injectable";
import proxyAuthTokensInjectable from "./proxy-auth-tokens.injectable";

/**
 * R4-09: single point that revokes the proxy token of a cluster that left the clusters state,
 * whatever removed it (delete dialog, kubeconfig sync, store reload).
 */
const revokeProxyTokensOfRemovedClustersInjectable = getInjectable({
  id: "revoke-proxy-tokens-of-removed-clusters",
  instantiate: (di) => {
    const clustersState = di.inject(clustersStateInjectable);
    const proxyAuthTokens = di.inject(proxyAuthTokensInjectable);

    return {
      run: () => {
        reaction(
          () => [...clustersState.keys()],
          (ids, previousIds) => {
            for (const id of previousIds) {
              if (!ids.includes(id)) {
                proxyAuthTokens.revoke(id);
              }
            }
          },
        );
      },
    };
  },
  injectionToken: onLoadOfApplicationInjectionToken,
});

export default revokeProxyTokensOfRemovedClustersInjectable;
