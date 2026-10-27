/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import userPreferencesStateInjectable from "./state.injectable";

export type TableDensity = "compact" | "lens" | "comfortable";

const tableDensityInjectable = getInjectable({
  id: "table-density",
  instantiate: (di) => {
    const state = di.inject(userPreferencesStateInjectable);

    return computed((): TableDensity => state.tableDensity ?? "lens");
  },
});

export default tableDensityInjectable;
