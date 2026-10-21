/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { onQuitOfBackEndInjectionToken } from "../../../start-main-application/runnable-tokens/phases";
import { loggerInjectionToken } from "@openlens/logger";
import { PortForward } from "./port-forward";

const stopPortForwardsOnQuitInjectable = getInjectable({
  id: "stop-port-forwards-on-quit",
  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);

    return {
      run: async () => {
        logger.info("[PORT-FORWARD]: Stopping all active port forwards on backend quit");

        try {
          // Copy: stop() removes entries from the registry while iterating
          await Promise.allSettled([...PortForward.portForwards].map((portForward) => portForward.stop()));
        } catch (error) {
          logger.error("[PORT-FORWARD]: Failed to stop port forwards on quit", error);
        }
      },
    };
  },
  injectionToken: onQuitOfBackEndInjectionToken,
});

export default stopPortForwardsOnQuitInjectable;
