/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { FakeK8sSnapshotSource } from "./fake-k8s-snapshot-source";

const fakeK8sSnapshotSourceInjectable = getInjectable({
  id: "fake-k8s-snapshot-source",
  instantiate: () => new FakeK8sSnapshotSource(),
});

export default fakeK8sSnapshotSourceInjectable;
