/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { nodeEnvInjectionToken } from "../../../common/vars/node-env-injection-token";
import { loggerInjectionToken } from "@openlens/logger";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";

const setupDeveloperToolsInDevelopmentEnvironmentInjectable = getInjectable({
  id: "setup-developer-tools-in-development-environment",

  instantiate: (di) => ({
    run: () => {
      const logger = di.inject(loggerInjectionToken);
      const nodeEnv = di.inject(nodeEnvInjectionToken);

      if (nodeEnv !== "development") {
        return;
      }

      // electron-devtools-installer downloads a CRX that unzip-crx-3 rejects on
      // Electron 45 ("Invalid header: Does not start with Cr24"). Skip so startup
      // is not blocked / spammed with a fatal-looking error.
      logger.info("🤓 Skipping developer tools installer (incompatible CRX on this Electron)");
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
});

export default setupDeveloperToolsInDevelopmentEnvironmentInjectable;
