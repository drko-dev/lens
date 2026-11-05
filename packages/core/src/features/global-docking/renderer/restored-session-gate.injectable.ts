/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { RestoredSessionGate } from "./restored-session-gate";

const restoredSessionGateInjectable = getInjectable({
  id: "restored-session-gate",
  instantiate: () => new RestoredSessionGate(),
});

export default restoredSessionGateInjectable;
