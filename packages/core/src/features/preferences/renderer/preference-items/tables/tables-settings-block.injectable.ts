/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../preference-item-injection-token";
import { TablesSettings } from "./tables-settings";

const tablesSettingsBlockInjectable = getInjectable({
  id: "tables-settings-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "tables-settings",
    parentId: "tables-page",
    orderNumber: 10,
    Component: TablesSettings,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default tablesSettingsBlockInjectable;
