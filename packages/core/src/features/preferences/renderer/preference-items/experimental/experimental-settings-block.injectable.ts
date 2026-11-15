/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";
import { ExperimentalSettings } from "./experimental-settings";

const experimentalSettingsBlockInjectable = getInjectable({
  id: "experimental-settings-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "experimental-settings",
    parentId: "experimental-page",
    orderNumber: 10,
    Component: ExperimentalSettings,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default experimentalSettingsBlockInjectable;
