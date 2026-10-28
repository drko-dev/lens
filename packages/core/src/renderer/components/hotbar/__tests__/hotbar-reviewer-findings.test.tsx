/**
 * Focus (reviewer observation R3-remove-all-hotbars, R3-add-to-hidden-active-hotbar):
 * - removing a favorite from the menu removes it from every hotbar that holds it;
 * - adding a favorite from the catalog context menu pins it to the active hotbar
 *   even when the menu merges favorites from every hotbar.
 */
"use strict";
import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { act, fireEvent, waitFor, type RenderResult } from "@testing-library/react";
import { computed, type ObservableMap } from "mobx";
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
import { HotbarToggleMenuItem } from "../../catalog/hotbar-toggle-menu-item";
import { Menu } from "../../menu";
import activeHotbarInjectable from "../../../../features/hotbar/storage/common/active.injectable";

const favorite = (uid: string): HotbarItem => ({ entity: { uid, name: uid }});

describe("<HotbarMenu /> reviewer observations", () => {
  let rendered: RenderResult;
  let hotbarsState: ObservableMap<string, HotbarModel>;

  beforeEach(() => {
    const di = getDiForUnitTesting();
    hotbarsState = di.inject(hotbarsStateInjectable);

    hotbarsState.set("first", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "first", name: "First", items: [favorite("cluster-1"), favorite("cluster-2")] },
    ));
    hotbarsState.set("second", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "second", name: "Second", items: [favorite("other-1"), favorite("cluster-1")] },
    ));

    di.override(catalogEntityRegistryInjectable, () => ({
      getById: () => undefined,
    } as unknown as CatalogEntityRegistry));
    di.override(activeEntityInjectable, () => computed(() => undefined));
    di.override(userPreferencesStateInjectable, () => ({ hotbarCollapsed: false } as any));

    rendered = renderFor(di)(<HotbarMenu />);
  });

  it("removes the favorite from every hotbar that holds it when removed from the menu", async () => {
    const icon = rendered.container.querySelector<HTMLElement>("#hotbarIcon-hotbar-icon-cluster-1");
    expect(icon).not.toBeNull();

    act(() => {
      fireEvent.contextMenu(icon as HTMLElement);
    });

    const removeItems = await waitFor(() => rendered.getAllByText("Remove from Hotbar"));
    act(() => {
      fireEvent.click(removeItems[0]);
    });

    await new Promise(r => setTimeout(r, 50));
    expect(hotbarsState.get("first")?.toJSON().items.some((item: HotbarItem | null) => item?.entity.uid === "cluster-1"))
      .toBe(false);
    expect(hotbarsState.get("second")?.toJSON().items.some((item: HotbarItem | null) => item?.entity.uid === "cluster-1"))
      .toBe(false);
  });
});

describe("<HotbarToggleMenuItem /> reviewer observations", () => {
  it("pins the favorite to the active hotbar only", () => {
    const di = getDiForUnitTesting();
    const hotbarsState = di.inject(hotbarsStateInjectable);

    hotbarsState.set("first", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "first", name: "First", items: [] },
    ));
    hotbarsState.set("second", new HotbarModel(
      { logger: { error: jest.fn() } as any },
      { id: "second", name: "Second", items: [] },
    ));

    di.override(activeHotbarInjectable, () => computed(() => hotbarsState.get("second")));

    const entity = {
      kind: "KubernetesCluster",
      apiVersion: "entity.k8slens.dev/v1alpha1",
      metadata: { uid: "qa-1", name: "qa-1", source: "local" },
      spec: {},
      getId: () => "qa-1",
      getName: () => "qa-1",
    } as any;

    const rendered = renderFor(di)(
      <Menu isOpen={true} open={() => {}} close={() => {}} toggleEvent="click">
        <HotbarToggleMenuItem entity={entity} addContent="Add to Hotbar" removeContent="Remove from Hotbar" />
      </Menu>,
    );

    act(() => {
      fireEvent.click(rendered.getByText("Add to Hotbar"));
    });
    expect(hotbarsState.get("second")?.hasEntity("qa-1")).toBe(true);
    expect(hotbarsState.get("first")?.hasEntity("qa-1")).toBe(false);
  });
});
