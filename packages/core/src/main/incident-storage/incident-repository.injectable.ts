/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "./sqlite-client.injectable";
import { IncidentRepository } from "./incident-repository";

const incidentRepositoryInjectable = getInjectable({
  id: "incident-repository",

  instantiate: (di) => {
    const sqliteClient = di.inject(sqliteClientInjectable);

    return new IncidentRepository(sqliteClient);
  },
});

export default incidentRepositoryInjectable;
