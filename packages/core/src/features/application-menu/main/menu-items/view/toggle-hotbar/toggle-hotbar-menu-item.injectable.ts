/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import applicationMenuItemInjectionToken from "../../application-menu-item-injection-token";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";

const toggleHotbarMenuItemInjectable = getInjectable({
  id: "toggle-hotbar-menu-item",

  instantiate: (di) => {
    const userPreferencesState = di.inject(userPreferencesStateInjectable);

    return {
      kind: "clickable-menu-item" as const,
      parentId: "view",
      id: "toggle-hotbar",
      orderNumber: 5,
      label: "Toggle Hotbar",
      keyboardShortcut: "CmdOrCtrl+Shift+B",

      onClick: () => {
        userPreferencesState.hotbarCollapsed = !userPreferencesState.hotbarCollapsed;
      },
    };
  },

  injectionToken: applicationMenuItemInjectionToken,
});

export default toggleHotbarMenuItemInjectable;
