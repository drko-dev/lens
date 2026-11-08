/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { LocalIncidentScanner } from "./local-incident-scanner";
import incidentRepositoryInjectable from "../incident-storage/incident-repository.injectable";
import fakeK8sSnapshotSourceInjectable from "./fake-k8s-snapshot-source.injectable";

const localIncidentScannerInjectable = getInjectable({
  id: "local-incident-scanner",

  instantiate: (di) => {
    const incidentRepo = di.inject(incidentRepositoryInjectable);
    const snapshotSource = di.inject(fakeK8sSnapshotSourceInjectable);
    return new LocalIncidentScanner(incidentRepo, undefined, undefined, snapshotSource);
  },
});

export default localIncidentScannerInjectable;
