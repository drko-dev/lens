/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";

const experimentalPreferenceTabInjectable = getInjectable({
  id: "experimental-preference-tab",

  instantiate: () => ({
    kind: "tab" as const,
    id: "experimental-tab",
    parentId: "general-tab-group" as const,
    pathId: "experimental",
    label: "Experimental",
    orderNumber: 65,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default experimentalPreferenceTabInjectable;
