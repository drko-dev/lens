/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { EphemeralContextManager } from "./ephemeral-context-manager";

const ephemeralContextManagerInjectable = getInjectable({
  id: "ephemeral-context-manager",

  instantiate: () => new EphemeralContextManager(),
});

export default ephemeralContextManagerInjectable;
