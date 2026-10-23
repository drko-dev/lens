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

  it("navigates to next and previous rows with ArrowDown and ArrowUp", () => {
    const { getAllByRole } = render(
      <div>
        <TableRow
          tabIndex={0}
          role="row"
          testId="row-1"
          onClick={jest.fn()} />
        <TableRow
          tabIndex={0}
          role="row"
          testId="row-2"
          onClick={jest.fn()} />
      </div>,
    );
    const rows = getAllByRole("row");
    const row1 = rows[0];
    const row2 = rows[1];

    row1.focus();
    expect(document.activeElement).toBe(row1);

    fireEvent.keyDown(row1, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row2);

    fireEvent.keyDown(row2, { key: "ArrowUp" });
    expect(document.activeElement).toBe(row1);
  });

  it("navigates within a .Table container without leaking to other tables", () => {
    const { getByTestId } = render(
      <div>
        <div className="Table table-1">
          <div>
            <TableRow
              tabIndex={0}
              role="row"
              testId="t1-row-1"
              onClick={jest.fn()} />
          </div>
          <div>
            <TableRow
              tabIndex={0}
              role="row"
              testId="t1-row-2"
              onClick={jest.fn()} />
          </div>
        </div>
        <div className="Table table-2">
          <div>
            <TableRow
              tabIndex={0}
              role="row"
              testId="t2-row-1"
              onClick={jest.fn()} />
          </div>
        </div>
      </div>,
    );
    const t1Row1 = getByTestId("t1-row-1");
    const t1Row2 = getByTestId("t1-row-2");
    const t2Row1 = getByTestId("t2-row-1");

    t1Row1.focus();
    expect(document.activeElement).toBe(t1Row1);

    // ArrowDown in table 1 moves to row 2
    fireEvent.keyDown(t1Row1, { key: "ArrowDown" });
    expect(document.activeElement).toBe(t1Row2);

    // ArrowDown at end of table 1 does not leak into table 2
    fireEvent.keyDown(t1Row2, { key: "ArrowDown" });
    expect(document.activeElement).toBe(t1Row2);
    expect(document.activeElement).not.toBe(t2Row1);

    // ArrowUp returns to row 1
    fireEvent.keyDown(t1Row2, { key: "ArrowUp" });
    expect(document.activeElement).toBe(t1Row1);

    // ArrowUp at top does not leak
    fireEvent.keyDown(t1Row1, { key: "ArrowUp" });
    expect(document.activeElement).toBe(t1Row1);
  });
});
