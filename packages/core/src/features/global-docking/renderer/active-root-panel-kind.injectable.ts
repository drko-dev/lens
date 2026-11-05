/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import preferencesRouteInjectable from "../../preferences/common/preferences-route.injectable";
import catalogRouteInjectable from "../../../common/front-end-routing/routes/catalog/catalog-route.injectable";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import type { RootPanelKind } from "./root-panel-store";

/** The root view of the current route (Preferences or Catalog), or undefined for any other route. */
const activeRootPanelKindInjectable = getInjectable({
  id: "active-root-panel-kind",
  instantiate: (di) => {
    const settingsActive = di.inject(routeIsActiveInjectable, di.inject(preferencesRouteInjectable));
    const catalogActive = di.inject(routeIsActiveInjectable, di.inject(catalogRouteInjectable));

    return computed((): RootPanelKind | undefined => (
      settingsActive.get() ? "settings" : catalogActive.get() ? "catalog" : undefined
    ));
  },
});

export default activeRootPanelKindInjectable;
