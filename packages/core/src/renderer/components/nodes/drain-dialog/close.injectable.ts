/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import drainNodeDialogStateInjectable from "./state.injectable";

export type CloseDrainNodeDialog = () => void;

const closeDrainNodeDialogInjectable = getInjectable({
  id: "close-drain-node-dialog",
  instantiate: (di): CloseDrainNodeDialog => {
    const state = di.inject(drainNodeDialogStateInjectable);

    return () => state.set(undefined);
  },
});

export default closeDrainNodeDialogInjectable;
