/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";

const showLoadingInjectable = getInjectable({
  id: "show-loading",

  instantiate: () => ({
    run: async () => {
      // Splash is not shown. The main window opens directly.
    },
  }),
  injectionToken: onLoadOfApplicationInjectionToken,
});

export default showLoadingInjectable;
