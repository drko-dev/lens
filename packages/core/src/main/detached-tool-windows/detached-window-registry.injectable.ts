/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { DetachedWindowRegistry } from "./detached-window-registry";

const detachedWindowRegistryInjectable = getInjectable({
  id: "detached-window-registry",
  instantiate: () => new DetachedWindowRegistry(),
});

export default detachedWindowRegistryInjectable;
