/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { ProxyAuthTokens } from "./proxy-auth-tokens";

const proxyAuthTokensInjectable = getInjectable({
  id: "proxy-auth-tokens",
  instantiate: () => new ProxyAuthTokens(),
});

export default proxyAuthTokensInjectable;
