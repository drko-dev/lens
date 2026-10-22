/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { TableRow } from "../table-row";

describe("<TableRow/>", () => {
  it("forwards context menu, keyboard and a11y props to the row element", () => {
    const onContextMenu = jest.fn();
    const onKeyDown = jest.fn();
    const { getByRole } = render(
      <TableRow
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="row"
        aria-selected={false} />,
    );
    const row = getByRole("row");

    fireEvent.contextMenu(row);
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(row.getAttribute("tabindex")).toBe("0");
  });
});
