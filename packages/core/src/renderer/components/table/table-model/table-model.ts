/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { StorageLayer } from "../../../utils/storage-helper";
import type { TableSortParams } from "../table";

export interface TableStorageModel {
  sortParams: {
    [tableId: string]: Partial<TableSortParams>;
  };
  columnWidths?: {
    [tableId: string]: Record<string, number>;
  };
  columnOrders?: {
    [tableId: string]: string[];
  };
}

interface Dependencies {
  storage: StorageLayer<TableStorageModel>;
}

export class TableModel {
  constructor(private dependencies: Dependencies) {}

  getSortParams = (tableId: string): Partial<TableSortParams> =>
    this.dependencies.storage.get().sortParams[tableId];

  setSortParams = (
    tableId: string,
    sortParams: Partial<TableSortParams>,
  ): void => {
    this.dependencies.storage.merge((draft) => {
      draft.sortParams[tableId] = sortParams;
    });
  };

  getColumnWidths = (tableId: string): Record<string, number> =>
    this.dependencies.storage.get().columnWidths?.[tableId] || {};

  setColumnWidth = (tableId: string, columnId: string, width: number): void => {
    this.dependencies.storage.merge((draft) => {
      if (!draft.columnWidths) {
        draft.columnWidths = {};
      }

      if (!draft.columnWidths[tableId]) {
        draft.columnWidths[tableId] = {};
      }

      draft.columnWidths[tableId][columnId] = Math.round(width);
    });
  };

  resetColumnWidths = (tableId: string): void => {
    this.dependencies.storage.merge((draft) => {
      if (draft.columnWidths) {
        delete draft.columnWidths[tableId];
      }
    });
  };

  getColumnOrder = (tableId: string): string[] | undefined =>
    this.dependencies.storage.get().columnOrders?.[tableId];

  setColumnOrder = (tableId: string, columnOrder: string[]): void => {
    this.dependencies.storage.merge((draft) => {
      if (!draft.columnOrders) {
        draft.columnOrders = {};
      }

      draft.columnOrders[tableId] = columnOrder;
    });
  };

  resetColumnOrder = (tableId: string): void => {
    this.dependencies.storage.merge((draft) => {
      if (draft.columnOrders) {
        delete draft.columnOrders[tableId];
      }
    });
  };
}
