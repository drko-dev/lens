/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "./sqlite-client.injectable";
import incidentRepositoryInjectable from "./incident-repository.injectable";
import { EvidenceRepository } from "./evidence-repository";

const evidenceRepositoryInjectable = getInjectable({
  id: "evidence-repository",

  instantiate: (di) => {
    const sqliteClient = di.inject(sqliteClientInjectable);
    const incidentRepo = di.inject(incidentRepositoryInjectable);

    return new EvidenceRepository(sqliteClient, incidentRepo);
  },
});

export default evidenceRepositoryInjectable;
