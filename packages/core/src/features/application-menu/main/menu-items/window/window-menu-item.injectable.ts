/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import applicationMenuItemInjectionToken from "../application-menu-item-injection-token";
import isMacInjectable from "../../../../../common/vars/is-mac.injectable";

const windowMenuItemInjectable = getInjectable({
  id: "window-application-menu-item",

  instantiate: (di) => {
    const isMac = di.inject(isMacInjectable);

    return {
      kind: "top-level-menu" as const,
      id: "window",
      parentId: "root" as const,
      orderNumber: 45,
      label: "Window",
      role: "windowMenu" as const,
      isShown: isMac,
    };
  },

  injectionToken: applicationMenuItemInjectionToken,
});

export default windowMenuItemInjectable;
