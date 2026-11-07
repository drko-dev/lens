/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import path from "path";
import getElectronAppPathInjectable from "../app-paths/get-electron-app-path/get-electron-app-path.injectable";
import { SqliteClient } from "./sqlite-client";
import { ALL_MIGRATIONS } from "./migrations";

const sqliteClientInjectable = getInjectable({
  id: "sqlite-client",

  instantiate: (di) => {
    const getElectronAppPath = di.inject(getElectronAppPathInjectable);
    const userDataPath = getElectronAppPath("userData");
    const dbPath = userDataPath ? path.join(userDataPath, "openlens-devops-incidents.db") : ":memory:";

    const client = new SqliteClient({
      dbPath,
      synchronous: "NORMAL",
      busyTimeout: 5000,
      migrations: ALL_MIGRATIONS,
    });

    client.init();

    return client;
  },
});

export default sqliteClientInjectable;
