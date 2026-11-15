/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";
import { IntegrationsSettings } from "./integrations-settings";

const integrationsSettingsBlockInjectable = getInjectable({
  id: "integrations-settings-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "integrations-settings",
    parentId: "integrations-page",
    orderNumber: 10,
    Component: IntegrationsSettings,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default integrationsSettingsBlockInjectable;
