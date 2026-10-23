/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Node } from "@openlens/kube-object";
import drainNodeDialogStateInjectable from "./state.injectable";

export type OpenDrainNodeDialog = (node: Node) => void;

const openDrainNodeDialogInjectable = getInjectable({
  id: "open-drain-node-dialog",
  instantiate: (di): OpenDrainNodeDialog => {
    const state = di.inject(drainNodeDialogStateInjectable);

    return (node: Node) => state.set(node);
  },
});

export default openDrainNodeDialogInjectable;
