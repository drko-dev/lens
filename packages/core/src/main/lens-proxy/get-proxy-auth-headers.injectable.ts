/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { getProxyAuthHeadersInjectionToken, proxyAuthHeaderName } from "../../common/lens-proxy-auth/proxy-auth";
import proxyAuthTokensInjectable from "./proxy-auth-tokens.injectable";
import { APP_SCOPE } from "./proxy-auth-tokens";

const getProxyAuthHeadersInjectable = getInjectable({
  id: "get-proxy-auth-headers-for-main",
  instantiate: (di) => {
    const tokens = di.inject(proxyAuthTokensInjectable);

    return (clusterId: string | undefined) => ({
      [proxyAuthHeaderName]: tokens.get(clusterId ?? APP_SCOPE),
    });
  },
  injectionToken: getProxyAuthHeadersInjectionToken,
});

export default getProxyAuthHeadersInjectable;
