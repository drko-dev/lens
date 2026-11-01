/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { LensWindow } from "../application-window/create-lens-window.injectable";

// No BrowserWindow and no splash.html. Callers that still inject this get a no-op.
const splashWindowInjectable = getInjectable({
  id: "splash-window",

  instantiate: (): LensWindow => ({
    id: "splash",
    isVisible: false,
    isStarting: false,
    start: async () => undefined,
    close: () => undefined,
    show: () => undefined,
    send: () => undefined,
    reload: () => undefined,
  }),
});

export default splashWindowInjectable;
