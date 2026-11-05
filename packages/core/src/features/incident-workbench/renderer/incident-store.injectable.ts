/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import ipcRendererInjectable from "../../../renderer/utils/channel/ipc-renderer.injectable";
import { IncidentStore } from "./incident-store";

const incidentStoreInjectable = getInjectable({
  id: "incident-store",

  instantiate: (di) => {
    let ipc;

    try {
      ipc = di.inject(ipcRendererInjectable);
    } catch {
      ipc = {
        invoke: async () => [],
      };
    }

    return new IncidentStore(ipc);
  },
});

export default incidentStoreInjectable;
