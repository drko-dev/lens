/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";

const externalToolsPreferenceTabInjectable = getInjectable({
  id: "external-tools-preference-tab",

  instantiate: () => ({
    kind: "tab" as const,
    id: "external-tools-tab",
    parentId: "general-tab-group" as const,
    pathId: "external-tools",
    label: "External Tools",
    orderNumber: 70,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default externalToolsPreferenceTabInjectable;
