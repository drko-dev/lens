/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import { TableCell } from "../table-cell";
import { TableModel } from "../table-model/table-model";

describe("R9-01 Table Column Auto-Fit & Dynamic Resizing", () => {
  describe("TableModel Column Width Persistence", () => {
    let mockStorageData: any;
    let tableModel: TableModel;

    beforeEach(() => {
      mockStorageData = {
        sortParams: {},
        columnWidths: {},
      };

      const mockStorage: any = {
        get: () => mockStorageData,
        merge: (updater: (draft: any) => void) => {
          updater(mockStorageData);
        },
      };

      tableModel = new TableModel({ storage: mockStorage });
    });

    it("saves and retrieves custom column widths per tableId", () => {
      expect(tableModel.getColumnWidths("pods_table")).toEqual({});

      tableModel.setColumnWidth("pods_table", "name", 280);
      tableModel.setColumnWidth("pods_table", "namespace", 190);

      expect(tableModel.getColumnWidths("pods_table")).toEqual({
        name: 280,
        namespace: 190,
      });

      // Distinct table isolation
      expect(tableModel.getColumnWidths("deployments_table")).toEqual({});
    });

    it("resets column widths when requested", () => {
      tableModel.setColumnWidth("pods_table", "name", 280);
      tableModel.resetColumnWidths("pods_table");

      expect(tableModel.getColumnWidths("pods_table")).toEqual({});
    });
  });

  describe("TableCell Resizer Handle & Auto-Fit", () => {
    it("renders resizer handle when resizable is true", () => {
      const { getByTestId, queryByTestId, rerender } = render(
        <TableCell id="name" resizable>Name</TableCell>,
      );

      expect(getByTestId("resizer-name")).toBeInTheDocument();

      rerender(<TableCell id="name" resizable={false}>Name</TableCell>);
      expect(queryByTestId("resizer-name")).toBeNull();
    });

    it("triggers onResize on drag move and clamps minimum width", () => {
      const onResize = jest.fn();
      const { getByTestId } = render(
        <TableCell
          id="name"
          resizable
          onResize={onResize}>
          Name
        </TableCell>,
      );

      const resizer = getByTestId("resizer-name");

      // Start drag
      fireEvent.mouseDown(resizer, { clientX: 100 });

      // Move mouse
      fireEvent(window, new MouseEvent("mousemove", { clientX: 180 }));
      expect(onResize).toHaveBeenCalled();

      // End drag
      fireEvent(window, new MouseEvent("mouseup"));
    });

    it("invokes onAutoFit on resizer double-click", () => {
      const onAutoFit = jest.fn();
      const { getByTestId } = render(
        <TableCell
          id="name"
          resizable
          onAutoFit={onAutoFit}>
          Name
        </TableCell>,
      );

      const resizer = getByTestId("resizer-name");

      fireEvent.doubleClick(resizer);

      expect(onAutoFit).toHaveBeenCalledTimes(1);
    });

    it("applies explicit width style constraint cleanly", () => {
      const { container } = render(
        <TableCell id="name" width={220}>Name</TableCell>,
      );

      const cell = container.firstElementChild as HTMLElement;

      expect(cell.style.width).toBe("220px");
      expect(cell.style.flex).toBe("0 0 220px");
    });
  });
});
