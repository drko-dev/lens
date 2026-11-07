/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createContainer } from "@ogre-tools/injectable";
import sqliteClientInjectable from "../sqlite-client.injectable";
import incidentRepositoryInjectable from "../incident-repository.injectable";
import getElectronAppPathInjectable from "../../app-paths/get-electron-app-path/get-electron-app-path.injectable";

describe("Incident Storage DI Integration (H8-005 & H8-006)", () => {
  it("resolves incidentRepositoryInjectable using in-memory path when userData is empty", () => {
    const di = createContainer("test-di");

    di.register(getElectronAppPathInjectable);
    di.override(getElectronAppPathInjectable, () => () => "");

    di.register(sqliteClientInjectable);
    di.register(incidentRepositoryInjectable);

    const repo = di.inject(incidentRepositoryInjectable);

    expect(repo).toBeDefined();

    const created = repo.createIncident({
      clusterId: "c-di",
      namespace: "default",
      title: "DI Incident",
      severity: "low",
      creator: {
        type: "human",
        id: "user:tester",
        name: "Tester",
      },
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe("DETECTADO");

    const found = repo.getIncidentById(created.id);

    expect(found?.title).toBe("DI Incident");

    const client = di.inject(sqliteClientInjectable);

    client.close();
  });
});
