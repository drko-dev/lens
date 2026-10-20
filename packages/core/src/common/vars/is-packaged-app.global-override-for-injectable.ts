/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getGlobalOverride } from "@openlens/test-utils";
import isPackagedAppInjectable from "./is-packaged-app.injectable";
import isProductionInjectable from "./is-production.injectable";

export default getGlobalOverride(isPackagedAppInjectable, (di) => di.inject(isProductionInjectable));
