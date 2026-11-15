/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";
import { ExternalToolsSettings } from "./external-tools-settings";

const externalToolsSettingsBlockInjectable = getInjectable({
  id: "external-tools-settings-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "external-tools-settings",
    parentId: "external-tools-page",
    orderNumber: 10,
    Component: ExternalToolsSettings,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default externalToolsSettingsBlockInjectable;
