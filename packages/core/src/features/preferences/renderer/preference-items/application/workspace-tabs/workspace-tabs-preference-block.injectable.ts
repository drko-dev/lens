/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../preference-item-injection-token";
import { WorkspaceTabsPreference } from "./workspace-tabs-preference";

const workspaceTabsPreferenceBlockInjectable = getInjectable({
  id: "workspace-tabs-preference-item",

  instantiate: () => ({
    kind: "block" as const,
    id: "workspace-tabs",
    parentId: "application-page",
    orderNumber: 35,
    Component: WorkspaceTabsPreference,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default workspaceTabsPreferenceBlockInjectable;
