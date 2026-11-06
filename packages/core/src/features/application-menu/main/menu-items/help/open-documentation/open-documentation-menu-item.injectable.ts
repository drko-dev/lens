/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import applicationMenuItemInjectionToken from "../../application-menu-item-injection-token";
import navigateToDocumentationInjectable from "../../../../../../common/front-end-routing/routes/documentation/navigate-to-documentation.injectable";

const openDocumentationMenuItemInjectable = getInjectable({
  id: "open-documentation-menu-item",

  instantiate: (di) => {
    const navigateToDocumentation = di.inject(navigateToDocumentationInjectable);

    return {
      kind: "clickable-menu-item" as const,
      parentId: "help",
      id: "open-documentation",
      orderNumber: 20,
      label: "Documentación",
      keyboardShortcut: "F1",

      onClick: () => {
        navigateToDocumentation();
      },
    };
  },

  injectionToken: applicationMenuItemInjectionToken,
});

export default openDocumentationMenuItemInjectable;
