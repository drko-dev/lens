/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { HotbarItem } from "../../../../features/hotbar/storage/common/types";
import { Hotbar } from "../../../../features/hotbar/storage/common/hotbar";
import { getHotbarFavoriteItems, reorderHotbarFavoriteItems } from "../hotbar-menu-items";

const item = (uid: string): HotbarItem => ({ entity: { uid, name: uid }});

const hotbar = (id: string, items: (HotbarItem | null)[]) => new Hotbar(
  { logger: { error: jest.fn() } as any },
  { id, name: id, items },
);

describe("hotbar menu items", () => {
  it("exposes every favorite in hotbar order while skipping empty cells", () => {
    const hotbars = [
      hotbar("first", [item("a"), null, item("b")]),
      hotbar("second", [item("c"), item("d")]),
    ];

    expect(getHotbarFavoriteItems(hotbars).map(favorite => favorite.entity.uid))
      .toEqual(["a", "b", "c", "d"]);
  });

  it("keeps twenty-five favorites in one continuous ordered list", () => {
    const favorites = Array.from({ length: 25 }, (_, index) => item(`cluster-${index + 1}`));
    const hotbars = [
      hotbar("first", favorites.slice(0, 12)),
      hotbar("second", favorites.slice(12, 24)),
      hotbar("third", favorites.slice(24)),
    ];

    expect(getHotbarFavoriteItems(hotbars).map(({ entity }) => entity.uid))
      .toEqual(favorites.map(({ entity }) => entity.uid));
  });

  it("reorders favorites across hotbars without losing order or persisted entries", () => {
    const hotbars = [
      hotbar("first", [item("a"), null]),
      hotbar("second", [item("b"), item("c")]),
    ];

    reorderHotbarFavoriteItems(hotbars, 0, 3);

    expect(getHotbarFavoriteItems(hotbars).map(favorite => favorite.entity.uid))
      .toEqual(["b", "c", "a"]);
    expect(hotbars.map(value => value.toJSON().items)).toEqual([
      [item("b"), item("c")],
      [item("a"), null],
    ]);
  });

  it("rejects invalid reorder indices without changing persisted favorites", () => {
    const hotbars = [
      hotbar("first", [item("a"), null]),
      hotbar("second", [item("b"), item("c")]),
    ];
    const before = hotbars.map(value => value.toJSON());

    expect(() => reorderHotbarFavoriteItems(hotbars, 0, 4))
      .toThrow("Invalid 'from' or 'to' favorite index");
    expect(hotbars.map(value => value.toJSON())).toEqual(before);
  });
});
