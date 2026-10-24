/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";
import { TableCell } from "../table-cell";
import { TableModel } from "../table-model/table-model";

describe("R9-02 Table Column Drag-and-Drop Reordering", () => {
  describe("TableModel Column Order Persistence", () => {
    let mockStorageData: any;
    let tableModel: TableModel;

    beforeEach(() => {
      mockStorageData = {
        sortParams: {},
        columnWidths: {},
        columnOrders: {},
      };

      const mockStorage: any = {
        get: () => mockStorageData,
        merge: (updater: (draft: any) => void) => {
          updater(mockStorageData);
        },
      };

      tableModel = new TableModel({ storage: mockStorage });
    });

    it("saves and retrieves reordered column IDs per tableId", () => {
      expect(tableModel.getColumnOrder("pods_table")).toBeUndefined();

      tableModel.setColumnOrder("pods_table", ["namespace", "name", "status", "age"]);
      expect(tableModel.getColumnOrder("pods_table")).toEqual([
        "namespace",
        "name",
        "status",
        "age",
      ]);

      // Isolation between distinct tables
      expect(tableModel.getColumnOrder("services_table")).toBeUndefined();
    });

    it("resets column order when requested", () => {
      tableModel.setColumnOrder("pods_table", ["namespace", "name"]);
      expect(tableModel.getColumnOrder("pods_table")).toBeDefined();

      tableModel.resetColumnOrder("pods_table");
      expect(tableModel.getColumnOrder("pods_table")).toBeUndefined();
    });
  });

  describe("TableCell Drag-and-Drop Events & Classes", () => {
    it("renders draggable cell with proper class and attribute", () => {
      const { getByTestId, rerender } = render(
        <TableCell
          id="col-name"
          data-testid="col-name"
          draggableColumn
        >
          Name
        </TableCell>,
      );

      const cell = getByTestId("col-name");

      expect(cell).toHaveClass("draggable");
      expect(cell).toHaveAttribute("draggable", "true");

      rerender(
        <TableCell
          id="col-name"
          data-testid="col-name"
          draggableColumn={false}
        >
          Name
        </TableCell>,
      );
      expect(cell).not.toHaveClass("draggable");
      expect(cell).not.toHaveAttribute("draggable", "true");
    });

    it("handles drag start, drag over, drag leave, and drop events", () => {
      const onColumnDragStart = jest.fn();
      const onColumnDragOver = jest.fn();
      const onColumnDragLeave = jest.fn();
      const onColumnDrop = jest.fn();
      const onColumnDragEnd = jest.fn();

      const { getByTestId } = render(
        <TableCell
          id="col-name"
          data-testid="col-name"
          draggableColumn
          onColumnDragStart={onColumnDragStart}
          onColumnDragOver={onColumnDragOver}
          onColumnDragLeave={onColumnDragLeave}
          onColumnDrop={onColumnDrop}
          onColumnDragEnd={onColumnDragEnd}
        >
          Name
        </TableCell>,
      );

      const cell = getByTestId("col-name");

      fireEvent.dragStart(cell);
      expect(onColumnDragStart).toHaveBeenCalledTimes(1);

      fireEvent.dragOver(cell);
      expect(onColumnDragOver).toHaveBeenCalledTimes(1);

      fireEvent.dragLeave(cell);
      expect(onColumnDragLeave).toHaveBeenCalledTimes(1);

      fireEvent.drop(cell);
      expect(onColumnDrop).toHaveBeenCalledTimes(1);

      fireEvent.dragEnd(cell);
      expect(onColumnDragEnd).toHaveBeenCalledTimes(1);
    });

    it("applies drop indicator classes cleanly", () => {
      const { getByTestId, rerender } = render(
        <TableCell
          id="col-name"
          data-testid="col-name"
          className="drop-target-left"
        >
          Name
        </TableCell>,
      );

      expect(getByTestId("col-name")).toHaveClass("drop-target-left");

      rerender(
        <TableCell
          id="col-name"
          data-testid="col-name"
          className="drop-target-right"
        >
          Name
        </TableCell>,
      );
      expect(getByTestId("col-name")).toHaveClass("drop-target-right");
    });
  });
});
