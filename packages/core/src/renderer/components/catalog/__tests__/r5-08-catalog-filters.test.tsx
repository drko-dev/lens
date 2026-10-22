/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CatalogEntity } from "../../../../common/catalog";
import { CLUSTER_ENVIRONMENTS } from "../../../../common/cluster/environment-types";
import { CatalogFilterState } from "../catalog-filters/catalog-filter-state.injectable";
import { CatalogFilterEmpty, CatalogFilters } from "../catalog-filters/catalog-filters";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { type DiRender, renderFor } from "../../test-utils/renderFor";

const entity = (id: string) => ({ getId: () => id }) as CatalogEntity;
const envById: Record<string, keyof typeof CLUSTER_ENVIRONMENTS | undefined> = { a: "production", b: "staging", c: undefined };
const resolve = (e: CatalogEntity) => {
  const id = envById[e.getId()];

  return id ? CLUSTER_ENVIRONMENTS[id] : undefined;
};

describe("R5-08 catalog filters", () => {
  let render: DiRender;
  let state: CatalogFilterState;
  const entities = [entity("a"), entity("b"), entity("c")];
  const ids = () => state.apply(entities, resolve, e => e.getId() === "b").map(e => e.getId());

  beforeEach(() => {
    render = renderFor(getDiForUnitTesting());
    state = new CatalogFilterState();
  });

  it("environment filter narrows rows and hides non-cluster entities", () => {
    expect(ids()).toEqual(["a", "b", "c"]);
    state.setEnvironment("production");
    expect(ids()).toEqual(["a"]);
  });

  it("pinned-only shows only hotbar entities", () => {
    state.setPinnedOnly(true);
    expect(ids()).toEqual(["b"]);
  });

  it("controls drive state and Show all resets it", async () => {
    render((
      <>
        <CatalogFilters
          state={state}
          showFilters
        />
        <CatalogFilterEmpty onShowAll={() => state.reset()} />
      </>
    ));

    await userEvent.click(screen.getByTestId("catalog-filter-env-staging"));
    await userEvent.click(screen.getByTestId("catalog-filter-pinned"));
    expect(state.environment).toBe("staging");
    expect(state.pinnedOnly).toBe(true);
    await userEvent.click(screen.getByText("Show all"));
    expect(state.isActive).toBe(false);
  });

  it("add button calls onAddCluster", async () => {
    const onAdd = jest.fn();

    render(<CatalogFilters
      state={state}
      showFilters={false}
      onAddCluster={onAdd} />);
    expect(screen.queryByTestId("catalog-filter-pinned")).toBeNull();
    await userEvent.click(screen.getByTestId("catalog-add-cluster-button"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
