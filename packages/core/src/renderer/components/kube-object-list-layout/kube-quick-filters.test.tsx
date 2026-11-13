/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent } from "@testing-library/react";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import { KubeQuickFilters } from "./kube-quick-filters";
import pageFiltersStoreInjectable from "../item-object-list/page-filters/store.injectable";
import { FilterType } from "../item-object-list/page-filters/store";
import type { PageFiltersStore } from "../item-object-list/page-filters/store";

describe("kube-quick-filters", () => {
  let di: DiContainer;
  let render: ReturnType<typeof renderFor>;
  let pageFiltersStore: PageFiltersStore;

  beforeEach(() => {
    di = getDiForUnitTesting();
    render = renderFor(di);
    pageFiltersStore = di.inject(pageFiltersStoreInjectable);
  });

  const fakePods = [
    {
      getStatusMessage: () => "Running",
      metadata: { labels: { app: "web", env: "prod" }},
    },
    {
      getStatusMessage: () => "Running",
      metadata: { labels: { app: "api", env: "prod" }},
    },
    {
      getStatusMessage: () => "Pending",
      metadata: { labels: { app: "batch", env: "dev" }},
    },
    {
      getStatusMessage: () => "Failed",
      metadata: { labels: { app: "worker", env: "test" }},
    },
  ] as any[];

  // NovaKube (default theme) renders the quick filters behind a menu trigger.
  const openMenu = (result: ReturnType<typeof render>) => {
    fireEvent.click(result.getByTestId("quick-filters-menu-trigger"));
  };

  it("renders status chips with correct counts and toggles them into pageFiltersStore", () => {
    const onExportCsv = jest.fn();

    const result = render((
      <KubeQuickFilters
        rawItems={fakePods}
        resourceKind="Pod"
        onExportCsv={onExportCsv}
      />
    ));

    openMenu(result);

    const runningChip = result.getByTestId("quick-filter-chip-running");

    expect(runningChip).toBeInTheDocument();
    expect(runningChip).toHaveTextContent("Running (2)");

    const pendingChip = result.getByTestId("quick-filter-chip-pending");

    expect(pendingChip).toHaveTextContent("Pending (1)");

    const failedChip = result.getByTestId("quick-filter-chip-failed");

    expect(failedChip).toHaveTextContent("Failed (1)");

    // Click Running chip -> activates status filter in store
    fireEvent.click(runningChip);
    expect(pageFiltersStore.getValues(FilterType.STATUS)).toEqual(["Running"]);
    expect(runningChip).toHaveClass("active");
    expect(runningChip).toHaveAttribute("aria-pressed", "true");

    // Click Pending chip -> now both Running and Pending are active
    fireEvent.click(pendingChip);
    expect(pageFiltersStore.getValues(FilterType.STATUS)).toEqual(["Running", "Pending"]);
    expect(pendingChip).toHaveClass("active");
    expect(pendingChip).toHaveAttribute("aria-pressed", "true");

    // Click Running again -> toggles off Running
    fireEvent.click(runningChip);
    expect(pageFiltersStore.getValues(FilterType.STATUS)).toEqual(["Pending"]);
    expect(runningChip).not.toHaveClass("active");
    expect(runningChip).toHaveAttribute("aria-pressed", "false");
  });

  it("adds label filter and clears all filters", () => {
    const result = render((
      <KubeQuickFilters
        rawItems={fakePods}
        resourceKind="Pod"
      />
    ));

    openMenu(result);

    const input = result.getByTestId("quick-filter-label-input");
    const addBtn = result.getByTestId("quick-filter-add-label-btn");

    fireEvent.change(input, { target: { value: "app=web" }});
    fireEvent.click(addBtn);

    expect(pageFiltersStore.getValues(FilterType.LABEL)).toEqual(["app=web"]);

    // "Clear filters" button must appear when filters are active
    const clearBtn = result.getByTestId("quick-filter-clear-all-btn");

    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);

    expect(pageFiltersStore.getValues(FilterType.LABEL)).toEqual([]);
    expect(result.queryByTestId("quick-filter-clear-all-btn")).not.toBeInTheDocument();
  });

  it("triggers onExportCsv callback when Export CSV button is clicked", () => {
    const onExportCsv = jest.fn();

    const result = render((
      <KubeQuickFilters
        rawItems={fakePods}
        resourceKind="Pod"
        onExportCsv={onExportCsv}
      />
    ));

    openMenu(result);

    const exportBtn = result.getByTestId("export-csv-btn");

    fireEvent.click(exportBtn);

    expect(onExportCsv).toHaveBeenCalledTimes(1);
  });

  it("shows the active filter count on the menu trigger and closes the menu with Escape", () => {
    const result = render(<KubeQuickFilters rawItems={fakePods} resourceKind="Pod" />);

    openMenu(result);
    fireEvent.click(result.getByTestId("quick-filter-chip-running"));
    expect(result.getByTestId("quick-filters-active-count")).toHaveTextContent("1");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(result.queryByTestId("quick-filters-menu")).not.toBeInTheDocument();
    expect(result.getByTestId("quick-filters-menu-trigger")).toHaveAttribute("aria-expanded", "false");
  });
});
