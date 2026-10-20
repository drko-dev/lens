/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import isProductionInjectable from "./is-production.injectable";

/**
 * True only when running from a packaged application, where electron-builder places the
 * bundled resources in `process.resourcesPath`.
 *
 * A production build launched unpackaged (`electron .`) has `process.defaultApp` set and must
 * resolve resources like a development run does.
 */
const isPackagedAppInjectable = getInjectable({
  id: "is-packaged-app",
  instantiate: (di) => di.inject(isProductionInjectable) && !process.defaultApp,
  causesSideEffects: true,
});

export default isPackagedAppInjectable;
