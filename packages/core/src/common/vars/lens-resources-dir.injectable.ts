/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import isPackagedAppInjectable from "./is-packaged-app.injectable";

const lensResourcesDirInjectable = getInjectable({
  id: "lens-resources-dir",

  instantiate: (di) => {
    const isPackagedApp = di.inject(isPackagedAppInjectable);

    return isPackagedApp
      ? process.resourcesPath
      : process.cwd();
  },

  causesSideEffects: true,
});

export default lensResourcesDirInjectable;
