/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { onQuitOfBackEndInjectionToken } from "../start-main-application/runnable-tokens/phases";
import detachedToolSessionManagerInjectable from "./detached-tool-session-manager.injectable";

/** R4-06: app quit aborts every Main-owned detached log/inspector stream. */
const stopDetachedToolSessionsOnQuitInjectable = getInjectable({
  id: "stop-detached-tool-sessions-on-quit",

  instantiate: (di) => ({
    run: () => {
      di.inject(detachedToolSessionManagerInjectable).disposeAll();
    },
  }),

  injectionToken: onQuitOfBackEndInjectionToken,
  causesSideEffects: true,
});

export default stopDetachedToolSessionsOnQuitInjectable;
