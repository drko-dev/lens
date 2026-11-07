/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import incidentRepositoryInjectable from "../incident-storage/incident-repository.injectable";
import evidenceRepositoryInjectable from "../incident-storage/evidence-repository.injectable";
import { RemediationVerifier } from "./remediation-verifier";

const remediationVerifierInjectable = getInjectable({
  id: "remediation-verifier",

  instantiate: (di) => {
    const incidentRepo = di.inject(incidentRepositoryInjectable);
    const evidenceRepo = di.inject(evidenceRepositoryInjectable);

    return new RemediationVerifier(incidentRepo, evidenceRepo);
  },
});

export default remediationVerifierInjectable;
