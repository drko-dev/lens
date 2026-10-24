/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import type { Pod } from "@openlens/kube-object";
import attachDebugContainerDialogStateInjectable from "./attach-debug-container-dialog-state.injectable";

export type OpenAttachDebugContainerDialog = (pod: Pod) => void;

const openAttachDebugContainerDialogInjectable = getInjectable({
  id: "open-attach-debug-container-dialog",
  instantiate: (di): OpenAttachDebugContainerDialog => {
    const state = di.inject(attachDebugContainerDialogStateInjectable);

    return (pod: Pod) => {
      state.set(pod);
    };
  },
});

export default openAttachDebugContainerDialogInjectable;
