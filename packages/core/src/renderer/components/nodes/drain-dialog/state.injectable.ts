/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { observable } from "mobx";
import type { Node } from "@openlens/kube-object";

const drainNodeDialogStateInjectable = getInjectable({
  id: "drain-node-dialog-state",
  instantiate: () => observable.box<Node | undefined>(),
});

export default drainNodeDialogStateInjectable;
