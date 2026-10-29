/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import welcomeCatalogEntityInjectable from "../../../../common/catalog-entities/general-catalog-entities/implementations/welcome-catalog-entity.injectable";
import type { MigrationDeclaration, MigrationStore } from "../../../../common/persistent-storage/migrations.injectable";
import { getDiForUnitTesting } from "../../../../main/getDiForUnitTesting";
import type { HotbarData } from "../common/hotbar";
import type { HotbarItem } from "../common/types";
import removeWelcomePagePinInjectable from "./welcome-page-removal-migration.injectable";

describe("remove welcome page from Hotbar migration", () => {
  const di = getDiForUnitTesting();
  const welcomePageId = di.inject(welcomeCatalogEntityInjectable).metadata.uid;
  const welcomePageItem: HotbarItem = { entity: { uid: welcomePageId, name: "Welcome Page", source: "app" }};
  const personalHomeItem: HotbarItem = { entity: { uid: "personal-home", name: "Home", source: "local" }};
  const favoriteItem: HotbarItem = { entity: { uid: "cluster-a", name: "Cluster A", source: "local" }};

  let migration: MigrationDeclaration;
  let store: MigrationStore;
  const storeModel = new Map();

  beforeEach(() => {
    migration = di.inject(removeWelcomePagePinInjectable);
    storeModel.clear();
    storeModel.set("hotbars", [
      { id: "first", name: "Default", items: [welcomePageItem, personalHomeItem, favoriteItem, null] },
      { id: "second", name: "Work", items: [favoriteItem, welcomePageItem, null] },
    ] as HotbarData[]);
    store = {
      path: "qa-hotbar-store",
      get: (key: string) => storeModel.get(key),
      set: (key: string, value: any) => storeModel.set(key, value),
      delete: (key: string) => storeModel.delete(key),
      has: (key: string) => storeModel.has(key),
      clear: () => storeModel.clear(),
    };
  });

  it("removes only the built-in Welcome Page favorite from every Hotbar", () => {
    expect(migration.version).toBe("6.5.1");
    migration.run(store);

    const hotbars = storeModel.get("hotbars") as HotbarData[];

    expect(hotbars.map(hotbar => hotbar.id)).toEqual(["first", "second"]);
    expect(hotbars[0].items).toEqual([personalHomeItem, favoriteItem, null, null]);
    expect(hotbars[1].items).toEqual([favoriteItem, null, null]);
    expect(hotbars.flatMap(hotbar => hotbar.items).some(item => item?.entity.uid === welcomePageId)).toBe(false);
  });
});
