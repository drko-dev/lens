/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { StrictReactNode, SingleOrMany } from "@openlens/utilities";

export interface ItemObject {
  getId: () => string;
  getName: () => string;
}

export type TableSortBy = string;
export type TableOrderBy = "asc" | "desc";
export interface TableSortParams {
  sortBy: TableSortBy;
  orderBy: TableOrderBy;
}

export type TableSortCallback<Item> = (data: Item) => undefined | string | number | (string | number)[];
export type TableSortCallbacks<Item> = Record<string, TableSortCallback<Item>>;

export type SearchFilter<I extends ItemObject> = (item: I) => SingleOrMany<string | number | undefined | null>;

export interface TableCellProps extends React.DOMAttributes<HTMLDivElement> {
  /**
   * used for configuration visibility of columns
   */
  id?: string;

  /**
   * Any css class names for this table cell. Only used if `title` is a "simple" react node
   */
  className?: string;

  /**
   * The actual value of the cell
   */
  title?: StrictReactNode;

  /**
   * content inside could be scrolled
   */
  scrollable?: boolean;

  /**
   * render cell with a checkbox
   */
  checkbox?: boolean;

  /**
   * mark checkbox as checked or not
   */
  isChecked?: boolean;

  /**
   * column name, must be same as key in sortable object `<Table sortable={}></Table>`
   */
  sortBy?: TableSortBy;

  /**
   * id of the column which follow same visibility rules
   */
  showWithColumn?: string;

  /**
   * @internal
   */
  _sorting?: Partial<TableSortParams>;

  /**
   * @internal
   */
  _sort?(sortBy: TableSortBy): void;

  /**
   * @internal
   * indicator, might come from parent <TableHead>, don't use this prop outside (!)
   */
  _nowrap?: boolean;

  /**
   * For passing in the testid
   */
  "data-testid"?: string;

  /**
   * Column width in pixels or CSS width string
   */
  width?: number | string;

  /**
   * Whether the column can be resized via resizer handle
   */
  resizable?: boolean;

  /**
   * Callback invoked when the column is resized
   */
  onResize?: (width: number) => void;

  /**
   * Callback invoked when column separator is double-clicked for auto-fit
   */
  onAutoFit?: () => void;

  /**
   * Whether the column header can be reordered by drag and drop
   */
  draggableColumn?: boolean;

  /**
   * Drag-and-drop callbacks for column reordering
   */
  onColumnDragStart?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragOver?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDrop?: (evt: React.DragEvent<HTMLDivElement>) => void;
}
