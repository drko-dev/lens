/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterIdInjectable from "../cluster-frame-context/hosted-cluster-id.injectable";
import { FrameProxyAuth } from "./frame-proxy-auth";

const frameProxyAuthInjectable = getInjectable({
  id: "frame-proxy-auth",
  instantiate: (di) => new FrameProxyAuth(di.inject(hostedClusterIdInjectable)),
});

export default frameProxyAuthInjectable;
