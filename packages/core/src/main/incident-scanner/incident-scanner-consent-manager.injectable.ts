/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { IncidentScannerConsentManager } from "./incident-scanner-consent-manager";

const incidentScannerConsentManagerInjectable = getInjectable({
  id: "incident-scanner-consent-manager",
  instantiate: () => new IncidentScannerConsentManager(),
});

export default incidentScannerConsentManagerInjectable;
