/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";

const tablesPreferenceTabInjectable = getInjectable({
  id: "tables-preference-tab",

  instantiate: () => ({
    kind: "tab" as const,
    id: "tables-tab",
    parentId: "general-tab-group" as const,
    pathId: "tables",
    label: "Tables",
    orderNumber: 45,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default tablesPreferenceTabInjectable;
