/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { iter } from "@openlens/utilities";
import { getInjectable } from "@ogre-tools/injectable";
import { action, comparer } from "mobx";
import catalogCatalogEntityInjectable from "../../../../common/catalog-entities/general-catalog-entities/implementations/catalog-catalog-entity.injectable";
import { hotbarStoreMigrationInjectionToken } from "./migrations-token";
import { defaultHotbarCells } from "./types";
import createPersistentStorageInjectable from "../../../../common/persistent-storage/create.injectable";
import persistentStorageMigrationsInjectable from "../../../../common/persistent-storage/migrations.injectable";
import activeHotbarIdInjectable from "./active-id.injectable";
import createHotbarInjectable from "./create-hotbar.injectable";
import type { Hotbar, HotbarData } from "./hotbar";
import hotbarsStateInjectable from "./state.injectable";

export interface HotbarStoreModel {
  hotbars: HotbarData[];
  activeHotbarId: string | undefined;
}

const hotbarsPersistentStorageInjectable = getInjectable({
  id: "hotbars-persistent-storage",
  instantiate: (di) => {
    const state = di.inject(hotbarsStateInjectable);
    const createPersistentStorage = di.inject(createPersistentStorageInjectable);
    const catalogCatalogEntity = di.inject(catalogCatalogEntityInjectable);
    const activeHotbarId = di.inject(activeHotbarIdInjectable);
    const createHotbar = di.inject(createHotbarInjectable);

    return createPersistentStorage<HotbarStoreModel>({
      configName: "lens-hotbar-store",
      accessPropertiesByDotNotation: false, // To make dots safe in cluster context names
      syncOptions: {
        equals: comparer.structural,
      },
      projectVersion: "6.5.1",
      migrations: di.inject(persistentStorageMigrationsInjectable, hotbarStoreMigrationInjectionToken),
      fromStore: action((data) => {
        if (!data.hotbars || !data.hotbars.length) {
          const hotbar = createHotbar({
            name: "Default",
          });
          const {
            metadata: {
              uid,
              name,
              source,
            },
          } = catalogCatalogEntity;

          hotbar.items[0] = {
            entity: {
              uid,
              name,
              source,
            },
          };
          state.replace([[hotbar.id, hotbar]]);
        } else {
          state.replace(data.hotbars.map((hotbar) => [hotbar.id, createHotbar(hotbar)]));
        }

        for (const hotbar of state.values()) {
          ensureExactHotbarItemLength(hotbar);
        }

        if (data.activeHotbarId) {
          activeHotbarId.set(data.activeHotbarId);
        }

        const firstHotbarId = iter.first(state.values())?.id;

        if (!activeHotbarId.get()) {
          activeHotbarId.set(firstHotbarId);
        } else if (!iter.find(state.values(), hotbar => hotbar.id === activeHotbarId.get())) {
          activeHotbarId.set(firstHotbarId);
        }
      }),
      toJSON: () => ({
        hotbars: iter.chain(state.values())
          .map(hotbar => hotbar.toJSON())
          .toArray(),
        activeHotbarId: activeHotbarId.get(),
      }),
    });
  },
});

export default hotbarsPersistentStorageInjectable;

/**
 * This function ensures that there are always at least `defaultHotbarCells`
 * cells in the hotbar, without ever discarding a pinned entity.
 * @param hotbar The hotbar to modify
 */
function ensureExactHotbarItemLength(hotbar: Hotbar) {
  // if there are not enough items
  while (hotbar.items.length < defaultHotbarCells) {
    hotbar.items.push(null);
  }

  // The bar scrolls and may hold more than the default cells: only drop surplus
  // empty trailing cells, never pinned entities.
  while (hotbar.items.length > defaultHotbarCells && hotbar.items[hotbar.items.length - 1] === null) {
    hotbar.items.pop();
  }
}
