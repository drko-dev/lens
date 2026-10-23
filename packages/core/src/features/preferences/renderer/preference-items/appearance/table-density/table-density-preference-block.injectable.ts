/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { preferenceItemInjectionToken } from "../../preference-item-injection-token";
import { TableDensity } from "./table-density";

const tableDensityPreferenceBlockInjectable = getInjectable({
  id: "table-density-preference-block",

  instantiate: () => ({
    kind: "block" as const,
    id: "table-density",
    parentId: "appearance-page",
    orderNumber: 10,
    Component: TableDensity,
  }),

  injectionToken: preferenceItemInjectionToken,
});

export default tableDensityPreferenceBlockInjectable;
