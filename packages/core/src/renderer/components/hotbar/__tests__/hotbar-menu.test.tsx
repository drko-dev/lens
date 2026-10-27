/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { act, type RenderResult } from "@testing-library/react";
import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { Hotbar as HotbarModel } from "../../../../features/hotbar/storage/common/hotbar";
import type { HotbarItem } from "../../../../features/hotbar/storage/common/types";
import hotbarsStateInjectable from "../../../../features/hotbar/storage/common/state.injectable";
import type { CatalogEntityRegistry } from "../../../api/catalog/entity/registry";
import catalogEntityRegistryInjectable from "../../../api/catalog/entity/registry.injectable";
import activeEntityInjectable from "../../../api/catalog/entity/active.injectable";
import userPreferencesStateInjectable from "../../../../features/user-preferences/common/state.injectable";
import { HotbarMenu } from "../hotbar-menu";

const favorite = (uid: string): HotbarItem => ({ entity: { uid, name: uid }});

describe("<HotbarMenu />", () => {
  let rendered: RenderResult;
  let addDuplicateFavorite: () => void;

  beforeEach(() => {
    const di = getDiForUnitTesting();
    const hotbarsState = di.inject(hotbarsStateInjectable);
    const items = Array.from({ length: 25 }, (_, index) => favorite(`cluster-${index + 1}`));

    hotbarsState.set("first", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "first", name: "First", items: items.slice(0, 12) },
    ));
    hotbarsState.set("second", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "second", name: "Second", items: items.slice(12, 24) },
    ));
    hotbarsState.set("third", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "third", name: "Third", items: items.slice(24) },
    ));

    addDuplicateFavorite = () => {
      hotbarsState.set("fourth", new HotbarModel(
        { logger: { error: jest.fn() } as any },
        { id: "fourth", name: "Fourth", items: [favorite("cluster-1")] },
      ));
    };

    di.override(catalogEntityRegistryInjectable, () => ({
      getById: () => undefined,
    } as unknown as CatalogEntityRegistry));
    di.override(activeEntityInjectable, () => computed(() => undefined));
    di.override(userPreferencesStateInjectable, () => ({ hotbarCollapsed: false } as any));

    rendered = renderFor(di)(<HotbarMenu />);
  });

  it("renders all favorites as one scrollable list without page controls", () => {
    expect(rendered.container.querySelectorAll(".HotbarItems > .HotbarCell")).toHaveLength(26);
    expect(rendered.container.querySelectorAll(".HotbarItems .HotbarIcon")).toHaveLength(25);
    expect(rendered.container.querySelector(".HotbarItems")).not.toBeNull();
    expect(rendered.queryByTestId("hotbarIndex")).toBeNull();
    expect(rendered.container.querySelector("#hotbarIcon-hotbar-icon-cluster-25")).not.toBeNull();
  });

  it("keeps React keys and drag identifiers unique for duplicate favorites across hotbars", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      act(() => {
        addDuplicateFavorite();
      });

      const draggableIds = Array.from(
        rendered.container.querySelectorAll<HTMLElement>("[data-rbd-draggable-id]"),
        element => element.dataset.rbdDraggableId,
      );

      expect(draggableIds).toHaveLength(26);
      expect(new Set(draggableIds).size).toBe(draggableIds.length);
      expect(consoleError.mock.calls.some(([message]) => (
        String(message).includes("Encountered two children with the same key")
      ))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
