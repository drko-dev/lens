/**
 * Focus (reviewer observation R3-quickfilters-tied-to-header): quick filters render
 * inside the list header, so they disappear together with the header when
 * showHeader is false. Pins the current coupling so a future decoupling is conscious.
 */
import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { ItemListLayoutHeader } from "../header";

const storeStub = {
  getTotalCount: () => 3,
} as any;

describe("<ItemListLayoutHeader />", () => {
  let rendered: RenderResult;

  it("renders quick filters inside the header when the header is shown", () => {
    rendered = render((
      <ItemListLayoutHeader
        getItems={() => []}
        getFilters={() => []}
        toggleFilters={() => {}}
        store={storeStub}
        showHeader={true}
        quickFilters={<div data-testid="quick-filters-probe" />}
        searchFilters={[]}
      />
    ));

    expect(rendered.getByTestId("quick-filters-probe").closest(".header")).not.toBeNull();
  });

  it("drops quick filters together with the header when the header is suppressed", () => {
    rendered = render((
      <ItemListLayoutHeader
        getItems={() => []}
        getFilters={() => []}
        toggleFilters={() => {}}
        store={storeStub}
        showHeader={false}
        quickFilters={<div data-testid="quick-filters-probe" />}
        searchFilters={[]}
      />
    ));

    expect(rendered.container.querySelector(".header")).toBeNull();
    expect(rendered.queryByTestId("quick-filters-probe")).toBeNull();
  });
});
