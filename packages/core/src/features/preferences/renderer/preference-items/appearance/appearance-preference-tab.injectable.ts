/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";

const appearancePreferenceTabInjectable = getInjectable({
  id: "appearance-preference-tab",

  instantiate: () => ({
    kind: "tab" as const,
    id: "appearance-tab",
    parentId: "general-tab-group" as const,
    pathId: "appearance",
    label: "Appearance",
    orderNumber: 15,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default appearancePreferenceTabInjectable;
