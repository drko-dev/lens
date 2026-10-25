/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import { ColumnFilterPopover } from "../column-filter-popover";
import { TableCell } from "../table-cell";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import type { DiRender } from "../../test-utils/renderFor";
import type { DiContainer } from "@ogre-tools/injectable";

describe("R9-03 In-Header Column Filter Popovers", () => {
  let di: DiContainer;
  let render: DiRender;

  const defaultProps = {
    columnId: "namespace",
    columnTitle: "Namespace",
    values: ["default", "kube-system", "monitoring"],
    selectedValues: [],
    onSelect: jest.fn(),
  };

  beforeEach(() => {
    di = getDiForUnitTesting();
    render = renderFor(di);
    jest.clearAllMocks();
  });

  it("renders filter trigger icon with inactive state initially", () => {
    const { getByTestId } = render(<ColumnFilterPopover {...defaultProps} />);
    const triggerIcon = getByTestId("column-filter-namespace");

    expect(triggerIcon).toBeInTheDocument();
    expect(triggerIcon).not.toHaveClass("active");
  });

  it("renders active state and badge when filters are applied", () => {
    const { getByTestId, getByText } = render(
      <ColumnFilterPopover
        {...defaultProps}
        selectedValues={["kube-system"]}
      />,
    );
    const triggerIcon = getByTestId("column-filter-namespace");

    expect(triggerIcon).toHaveClass("active");

    // Open menu to see active badge
    fireEvent.click(triggerIcon);
    expect(getByText(/1 active/i)).toBeInTheDocument();
  });

  it("toggles value on checkbox item click", () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <ColumnFilterPopover
        {...defaultProps}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getByTestId("column-filter-namespace"));

    const item = getByText("kube-system");

    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith(["kube-system"]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("toggles value exactly once when clicking directly on checkbox input without double toggle", () => {
    const onSelect = jest.fn();
    const { getByTestId, getAllByRole } = render(
      <ColumnFilterPopover
        {...defaultProps}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getByTestId("column-filter-namespace"));

    const checkboxes = getAllByRole("checkbox");

    expect(checkboxes.length).toBeGreaterThan(0);

    fireEvent.click(checkboxes[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(["default"]);
  });

  it("selects all values on Select All click", () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <ColumnFilterPopover
        {...defaultProps}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getByTestId("column-filter-namespace"));
    fireEvent.click(getByText("Select all"));

    expect(onSelect).toHaveBeenCalledWith(["default", "kube-system", "monitoring"]);
  });

  it("clears selections on Clear click", () => {
    const onSelect = jest.fn();
    const { getByTestId, getByText } = render(
      <ColumnFilterPopover
        {...defaultProps}
        selectedValues={["kube-system"]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(getByTestId("column-filter-namespace"));
    fireEvent.click(getByText("Clear"));

    expect(onSelect).toHaveBeenCalledWith([]);
  });

  it("TableCell renders filter trigger when renderFilter is provided", () => {
    const renderFilter = () => <span data-testid="custom-filter">Filter</span>;
    const { getByTestId } = render(
      <TableCell
        id="ns"
        renderFilter={renderFilter}
      >
        Namespace
      </TableCell>,
    );

    expect(getByTestId("custom-filter")).toBeInTheDocument();
  });
});
