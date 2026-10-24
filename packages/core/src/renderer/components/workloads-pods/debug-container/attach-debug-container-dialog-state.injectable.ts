/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";
import type { Pod } from "@openlens/kube-object";

const attachDebugContainerDialogStateInjectable = getInjectable({
  id: "attach-debug-container-dialog-state",
  instantiate: () => observable.box<Pod | undefined>(undefined),
});

export default attachDebugContainerDialogStateInjectable;
