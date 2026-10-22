/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { getProxyAuthHeadersInjectionToken } from "../../common/lens-proxy-auth/proxy-auth";
import frameProxyAuthInjectable from "./frame-proxy-auth.injectable";

const getProxyAuthHeadersInjectable = getInjectable({
  id: "get-proxy-auth-headers-for-frame",
  instantiate: (di) => di.inject(frameProxyAuthInjectable).getHeaders,
  injectionToken: getProxyAuthHeadersInjectionToken,
});

export default getProxyAuthHeadersInjectable;
