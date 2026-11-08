/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { RealK8sSnapshotSource } from "./real-k8s-snapshot-source";

const realK8sSnapshotSourceInjectable = getInjectable({
  id: "real-k8s-snapshot-source",
  instantiate: () => new RealK8sSnapshotSource({
    // Fail-closed by default: live cluster collection requires explicit operator authorization
    isRealK8sAuthorized: false,
  }),
});

export default realK8sSnapshotSourceInjectable;
