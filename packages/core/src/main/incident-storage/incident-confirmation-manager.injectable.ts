/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import incidentRepositoryInjectable from "./incident-repository.injectable";
import { IncidentConfirmationManager } from "./incident-confirmation-manager";

const incidentConfirmationManagerInjectable = getInjectable({
  id: "incident-confirmation-manager",
  instantiate: (di) => {
    const incidentRepo = di.inject(incidentRepositoryInjectable);
    return new IncidentConfirmationManager(incidentRepo);
  },
});

export default incidentConfirmationManagerInjectable;
