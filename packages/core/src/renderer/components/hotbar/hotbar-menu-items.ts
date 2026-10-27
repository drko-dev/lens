/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import type { Hotbar } from "../../../features/hotbar/storage/common/hotbar";
import type { HotbarItem } from "../../../features/hotbar/storage/common/types";

export function getHotbarFavoriteItems(hotbars: Hotbar[]): HotbarItem[] {
  return hotbars.flatMap(hotbar => hotbar.items.filter((item): item is HotbarItem => item !== null));
}

export function reorderHotbarFavoriteItems(hotbars: Hotbar[], from: number, to: number): void {
  const favoriteItems = getHotbarFavoriteItems(hotbars);

  if (
    !Number.isInteger(from)
    || !Number.isInteger(to)
    || from < 0
    || from >= favoriteItems.length
    || to < 0
    || to > favoriteItems.length
  ) {
    throw new Error("Invalid 'from' or 'to' favorite index");
  }

  if (from === to) {
    return;
  }

  const [movedItem] = favoriteItems.splice(from, 1);

  favoriteItems.splice(to, 0, movedItem);

  const totalSlots = hotbars.reduce((total, hotbar) => total + hotbar.items.length, 0);

  if (favoriteItems.length > totalSlots) {
    throw new Error("Hotbar capacity is smaller than the favorite list");
  }

  runInAction(() => {
    let offset = 0;

    for (const hotbar of hotbars) {
      const capacity = hotbar.items.length;
      const items = favoriteItems.slice(offset, offset + capacity);

      offset += capacity;
      hotbar.items.replace([
        ...items,
        ...Array<HotbarItem | null>(capacity - items.length).fill(null),
      ]);
    }
  });
}
