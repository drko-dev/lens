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
import { WorkloadInsightsBar } from "./workload-insights-bar";
import pageFiltersStoreInjectable from "../item-object-list/page-filters/store.injectable";
import { FilterType } from "../item-object-list/page-filters/store";
import type { PageFiltersStore } from "../item-object-list/page-filters/store";

describe("R9-04 Workload Insights Summary Bar", () => {
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
      getNs: () => "default",
      getStatusMessage: () => "Running",
      metadata: { namespace: "default" },
    },
    {
      getNs: () => "default",
      getStatusMessage: () => "Running",
      metadata: { namespace: "default" },
    },
    {
      getNs: () => "kube-system",
      getStatusMessage: () => "CrashLoopBackOff",
      metadata: { namespace: "kube-system" },
    },
    {
      getNs: () => "monitoring",
      getStatusMessage: () => "Failed",
      metadata: { namespace: "monitoring" },
    },
  ] as any[];

  const fakeDeployments = [
    {
      getNs: () => "default",
      status: { replicas: 3, availableReplicas: 3 },
      metadata: { namespace: "default" },
    },
    {
      getNs: () => "kube-system",
      status: { replicas: 2, availableReplicas: 1 }, // degraded
      metadata: { namespace: "kube-system" },
    },
  ] as any[];

  it("calculates Pod insights metrics correctly", () => {
    const result = render((
      <WorkloadInsightsBar
        rawItems={fakePods}
        resourceKind="Pod"
      />
    ));

    expect(result.getByTestId("insight-card-total")).toHaveTextContent("4");
    expect(result.getByTestId("insight-card-healthy")).toHaveTextContent("2");
    expect(result.getByTestId("insight-card-degraded")).toHaveTextContent("2");
    expect(result.getByTestId("insight-card-namespaces")).toHaveTextContent("3");
  });

  it("calculates Deployment insights metrics correctly", () => {
    const result = render((
      <WorkloadInsightsBar
        rawItems={fakeDeployments}
        resourceKind="Deployment"
      />
    ));

    expect(result.getByTestId("insight-card-total")).toHaveTextContent("2");
    expect(result.getByTestId("insight-card-healthy")).toHaveTextContent("1");
    expect(result.getByTestId("insight-card-degraded")).toHaveTextContent("1");
    expect(result.getByTestId("insight-card-namespaces")).toHaveTextContent("2");
  });

  it("toggles healthy and degraded filters on click", () => {
    const result = render((
      <WorkloadInsightsBar
        rawItems={fakePods}
        resourceKind="Pod"
      />
    ));

    // Click healthy
    fireEvent.click(result.getByTestId("insight-card-healthy"));
    expect(pageFiltersStore.getValues(FilterType.STATUS)).toContain("Running");

    // Click degraded
    fireEvent.click(result.getByTestId("insight-card-degraded"));
    expect(pageFiltersStore.getValues(FilterType.STATUS)).toContain("Failed");
  });

  it("resets filters on Total card click", () => {
    pageFiltersStore.addFilter({ type: FilterType.STATUS, value: "Running" });
    expect(pageFiltersStore.getValues(FilterType.STATUS).length).toBe(1);

    const result = render((
      <WorkloadInsightsBar
        rawItems={fakePods}
        resourceKind="Pod"
      />
    ));

    fireEvent.click(result.getByTestId("insight-card-total"));
    expect(pageFiltersStore.getValues(FilterType.STATUS).length).toBe(0);
  });
});
