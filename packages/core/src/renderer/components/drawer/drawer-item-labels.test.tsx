/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import { DrawerItemLabels } from "./drawer-item-labels";

describe("DrawerItemLabels", () => {
  const labels = { app: "webhook", tier: "backend" };

  it("collapses to a Lens-style count and expands on toggle", () => {
    const result = renderFor(getDiForUnitTesting())(<DrawerItemLabels name="Labels" labels={labels} collapsible />);

    expect(result.getByText("2 Labels")).toBeInTheDocument();
    expect(result.queryByText("app=webhook")).not.toBeInTheDocument();

    fireEvent.click(result.getByTestId("drawer-item-labels-toggle"));

    expect(result.getByText("app=webhook")).toBeInTheDocument();
    expect(result.getByTestId("drawer-item-labels-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps showing every badge when not collapsible", () => {
    const result = renderFor(getDiForUnitTesting())(<DrawerItemLabels name="Finalizers" labels={["a", "b"]} />);

    expect(result.getByText("a")).toBeInTheDocument();
    expect(result.getByText("b")).toBeInTheDocument();
  });
});
