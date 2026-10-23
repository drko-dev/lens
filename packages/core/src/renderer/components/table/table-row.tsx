/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./table-row.scss";

import type { CSSProperties } from "react";
import React from "react";
import { cssNames } from "@openlens/utilities";

export type TableRowElem<Item> = React.ReactElement<TableRowProps<Item>>;

export interface TableRowProps<Item> extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  selected?: boolean;
  style?: CSSProperties;
  /**
   * Should the inner `<TableCell>` be aligned to one line
   * `white-space: nowrap`
   */
  nowrap?: boolean;
  /**
   * data for sorting callback in `<Table sortable={}></Table>`
   */
  sortItem?: Item;
  /**
   * data for searching filters in `<Table searchable={}></Table>`
   */
  searchItem?: Item;
  disabled?: boolean;
  testId?: string;
}

export class TableRow<Item> extends React.Component<TableRowProps<Item>> {
  render() {
    const { className, nowrap, selected, disabled, children, sortItem, searchItem, testId, onKeyDown, ...rowProps } = this.props;
    const classNames = cssNames("TableRow", className, { selected, nowrap, disabled });

    return (
      <div
        className={classNames}
        data-testid={testId}
        tabIndex={rowProps.onClick || rowProps.onContextMenu ? 0 : undefined}
        onKeyDown={event => {
          if (rowProps.onClick && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            if (event.key === " ") event.preventDefault();
            rowProps.onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
          } else if (event.key === "ArrowDown" && event.target === event.currentTarget) {
            const table = event.currentTarget.closest(".Table");
            if (table) {
              const rows = Array.from(table.querySelectorAll<HTMLElement>(".TableRow[tabindex='0']"));
              const currentIndex = rows.indexOf(event.currentTarget);
              if (currentIndex >= 0 && currentIndex < rows.length - 1) {
                rows[currentIndex + 1].focus();
                event.preventDefault();
              }
            } else {
              const nextRow = event.currentTarget.nextElementSibling as HTMLElement | null;
              if (nextRow && (nextRow.classList.contains("TableRow") || nextRow.getAttribute("tabindex") === "0")) {
                nextRow.focus();
                event.preventDefault();
              }
            }
          } else if (event.key === "ArrowUp" && event.target === event.currentTarget) {
            const table = event.currentTarget.closest(".Table");
            if (table) {
              const rows = Array.from(table.querySelectorAll<HTMLElement>(".TableRow[tabindex='0']"));
              const currentIndex = rows.indexOf(event.currentTarget);
              if (currentIndex > 0) {
                rows[currentIndex - 1].focus();
                event.preventDefault();
              }
            } else {
              const prevRow = event.currentTarget.previousElementSibling as HTMLElement | null;
              if (prevRow && (prevRow.classList.contains("TableRow") || prevRow.getAttribute("tabindex") === "0")) {
                prevRow.focus();
                event.preventDefault();
              }
            }
          }
          onKeyDown?.(event);
        }}
        {...rowProps}>
        {children}
      </div>
    );
  }
}
