/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import createSecurePilotWindowInjectable from "./create-secure-pilot-window.injectable";
import type { SecurePilotWindow } from "./create-secure-pilot-window.injectable";

const openSecurePilotWindowInjectable = getInjectable({
  id: "open-secure-pilot-window",

  instantiate: (di) => {
    const createSecurePilotWindow = di.inject(createSecurePilotWindowInjectable);
    let pilotWindow: SecurePilotWindow | undefined;

    return async (): Promise<SecurePilotWindow> => {
      if (!pilotWindow || pilotWindow.isDestroyed()) {
        pilotWindow = createSecurePilotWindow();
      }

      pilotWindow.show();

      return pilotWindow;
    };
  },
});

export default openSecurePilotWindowInjectable;
