/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import isPackagedAppInjectable from "./is-packaged-app.injectable";
import normalizedPlatformInjectable from "./normalized-platform.injectable";
import lensResourcesDirInjectable from "./lens-resources-dir.injectable";
import joinPathsInjectable from "../path/join-paths.injectable";

const bundledResourcesDirectoryInjectable = getInjectable({
  id: "bundled-resources-directory",
  instantiate: (di) => {
    const isPackagedApp = di.inject(isPackagedAppInjectable);
    const normalizedPlatform = di.inject(normalizedPlatformInjectable);
    const joinPaths = di.inject(joinPathsInjectable);
    const lensResourcesDir = di.inject(lensResourcesDirInjectable);

    return isPackagedApp
      ? lensResourcesDir
      : joinPaths(lensResourcesDir, "binaries", "client", normalizedPlatform);
  },
});

export default bundledResourcesDirectoryInjectable;
