/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";

const integrationsPreferenceTabInjectable = getInjectable({
  id: "integrations-preference-tab",

  instantiate: () => ({
    kind: "tab" as const,
    id: "integrations-tab",
    parentId: "general-tab-group" as const,
    pathId: "integrations",
    label: "Integrations",
    orderNumber: 55,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default integrationsPreferenceTabInjectable;
