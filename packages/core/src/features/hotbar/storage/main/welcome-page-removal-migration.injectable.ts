/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { hotbarStoreMigrationInjectionToken } from "../common/migrations-token";
import type { HotbarData } from "../common/hotbar";
import type { HotbarItem } from "../common/types";
import welcomeCatalogEntityInjectable from "../../../../common/catalog-entities/general-catalog-entities/implementations/welcome-catalog-entity.injectable";

const removeWelcomePagePinInjectable = getInjectable({
  id: "hotbar-store-remove-welcome-page-pin-migration",
  instantiate: (di) => ({
    version: "6.5.1",
    run: (store) => {
      const welcomePageId = di.inject(welcomeCatalogEntityInjectable).metadata.uid;
      const hotbars = (store.get("hotbars") ?? []) as HotbarData[];
      let changed = false;
      const updatedHotbars = hotbars.map((hotbar) => {
        if (!hotbar.items.some(item => item?.entity.uid === welcomePageId)) {
          return hotbar;
        }

        changed = true;
        const favoriteItems = hotbar.items.filter((item): item is HotbarItem => (
          item !== null && item.entity.uid !== welcomePageId
        ));

        return {
          ...hotbar,
          items: [
            ...favoriteItems,
            ...Array<HotbarItem | null>(hotbar.items.length - favoriteItems.length).fill(null),
          ],
        };
      });

      if (changed) {
        store.set("hotbars", updatedHotbars);
      }
    },
  }),
  injectionToken: hotbarStoreMigrationInjectionToken,
});

export default removeWelcomePagePinInjectable;
