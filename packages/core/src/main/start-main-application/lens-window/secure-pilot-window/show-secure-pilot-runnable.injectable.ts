/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { afterApplicationIsLoadedInjectionToken } from "@openlens/application";
import commandLineArgumentsInjectable from "../../../utils/command-line-arguments.injectable";
import openSecurePilotWindowInjectable from "./open-secure-pilot-window.injectable";
import { loggerInjectionToken } from "@openlens/logger";

const showSecurePilotRunnableInjectable = getInjectable({
  id: "show-secure-pilot-runnable",

  instantiate: (di) => ({
    run: async () => {
      const logger = di.inject(loggerInjectionToken);
      const commandLineArguments = di.inject(commandLineArgumentsInjectable) as string[];
      const openSecurePilotWindow = di.inject(openSecurePilotWindowInjectable);

      const isFlagPresent =
        commandLineArguments.includes("--enable-secure-pilot") ||
        commandLineArguments.includes("--r4-pilot") ||
        process.env.OPENLENS_R4_PILOT === "true";

      if (isFlagPresent) {
        logger.info("[SECURE-PILOT]: Feature flag detected. Launching R4-01 Secure Pilot Window...");

        try {
          await openSecurePilotWindow();
          logger.info("[SECURE-PILOT]: R4-01 Secure Pilot Window launched successfully.");
        } catch (err) {
          logger.error("[SECURE-PILOT]: Failed to launch Secure Pilot Window:", err);
        }
      }
    },
  }),

  injectionToken: afterApplicationIsLoadedInjectionToken,
});

export default showSecurePilotRunnableInjectable;
