/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../preference-item-injection-token";
import { EnvironmentColors } from "./environment-colors";

const environmentColorsPreferenceBlockInjectable = getInjectable({
  id: "environment-colors-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "environment-colors",
    parentId: "appearance-page",
    orderNumber: 20,
    Component: EnvironmentColors,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default environmentColorsPreferenceBlockInjectable;
