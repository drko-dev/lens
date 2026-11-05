/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import incidentPurgerInjectable from "./incident-purger.injectable";

const scheduleAutomaticPurgeInjectable = getInjectable({
  id: "schedule-automatic-purge",

  instantiate: (di) => ({
    run: () => {
      const purger = di.inject(incidentPurgerInjectable);

      // Execute automatic purge strictly on application startup
      // If policy is not enabled (the default), this is an immediate no-op.
      try {
        purger.executeAutomaticPurge();
      } catch (err) {
        console.error("[INCIDENT PURGER]: Error during startup automatic purge check:", err);
      }
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default scheduleAutomaticPurgeInjectable;
