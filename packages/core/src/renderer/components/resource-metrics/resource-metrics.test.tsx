/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React, { useContext } from "react";
import { fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import type { DiRender } from "../test-utils/renderFor";
import { renderFor } from "../test-utils/renderFor";
import { ResourceMetrics, ResourceMetricsContext } from "./resource-metrics";
import { DetailsMetricsContainer } from "../kube-object-details/kube-object-detail-items/metrics/details-metrics-container";
import { computed } from "mobx";

const ActiveTab = () => <span data-testid="active-tab">{useContext(ResourceMetricsContext)?.tab}</span>;

describe("ResourceMetrics toggles", () => {
  let render: DiRender;

  beforeEach(() => {
    render = renderFor(getDiForUnitTesting());
  });

  it("renders icon toggles with aria-pressed that switch the tab, without a range select", () => {
    const { getByTestId, queryByRole, container } = render(
      <ResourceMetrics tabs={["CPU", "Memory", "Network", "Filesystem"]} object={{} as any} metrics={{}}>
        <ActiveTab />
      </ResourceMetrics>,
    );

    expect(getByTestId("metric-toggle-CPU").getAttribute("aria-pressed")).toBe("true");
    expect(getByTestId("metric-toggle-Memory").getAttribute("aria-label")).toBe("Memory");
    fireEvent.click(getByTestId("metric-toggle-Filesystem"));
    expect(getByTestId("active-tab").textContent).toBe("Filesystem");
    expect(getByTestId("metric-toggle-Filesystem").getAttribute("aria-pressed")).toBe("true");
    expect(getByTestId("metric-toggle-CPU").getAttribute("aria-pressed")).toBe("false");
    expect(queryByRole("combobox")).toBeNull();
    expect(container.textContent).not.toContain("Displaying metrics from");
  });

  it("renders a Metrics heading above the metrics block", () => {
    const metrics = computed(() => [{ id: "m", Component: () => <i data-testid="m" /> }]) as any;
    const { getByText } = render(<DetailsMetricsContainer metrics={metrics} object={{} as any} />);

    expect(getByText("Metrics").tagName).toBe("H2");
  });
});
