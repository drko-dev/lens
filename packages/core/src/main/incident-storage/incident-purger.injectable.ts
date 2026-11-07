/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import sqliteClientInjectable from "./sqlite-client.injectable";
import { IncidentPurger } from "./incident-purger";

const incidentPurgerInjectable = getInjectable({
  id: "incident-purger",
  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);
    return new IncidentPurger(sqlite);
  },
});

export default incidentPurgerInjectable;
