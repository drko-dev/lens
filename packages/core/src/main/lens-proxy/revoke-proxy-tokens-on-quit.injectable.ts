/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { onQuitOfBackEndInjectionToken } from "../start-main-application/runnable-tokens/phases";
import proxyAuthTokensInjectable from "./proxy-auth-tokens.injectable";

const revokeProxyTokensOnQuitInjectable = getInjectable({
  id: "revoke-proxy-tokens-on-quit",
  instantiate: (di) => {
    const proxyAuthTokens = di.inject(proxyAuthTokensInjectable);

    return {
      run: () => {
        proxyAuthTokens.revokeAll();
      },
    };
  },
  injectionToken: onQuitOfBackEndInjectionToken,
});

export default revokeProxyTokensOnQuitInjectable;
