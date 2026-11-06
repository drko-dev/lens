/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import applicationMenuItemInjectionToken from "../../application-menu-item-injection-token";
import { docsUrl } from "../../../../../../common/vars";
import openLinkInBrowserInjectable from "../../../../../../common/utils/open-link-in-browser.injectable";
import { loggerInjectionToken } from "@openlens/logger";

const openExternalDocumentationMenuItemInjectable = getInjectable({
  id: "open-external-documentation-menu-item",

  instantiate: (di) => {
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectable);
    const logger = di.inject(loggerInjectionToken);

    return {
      kind: "clickable-menu-item" as const,
      parentId: "help",
      id: "open-external-documentation",
      orderNumber: 25,
      label: "Documentación de Lens (externa)",

      onClick: () => {
        openLinkInBrowser(docsUrl).catch((error) => {
          logger.error("[MENU]: failed to open browser", { error });
        });
      },
    };
  },

  injectionToken: applicationMenuItemInjectionToken,
});

export default openExternalDocumentationMenuItemInjectable;
