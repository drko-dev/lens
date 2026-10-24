/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./table-cell.scss";

import React from "react";
import { cssNames, stopPropagation } from "@openlens/utilities";
import { Icon } from "../icon";
import { Checkbox } from "../checkbox";
import autoBindReact from "auto-bind/react";
import type { TableCellProps as BaseTableCellProps } from "@openlens/list-layout";

export interface TableCellProps extends BaseTableCellProps {
  width?: number | string;
  resizable?: boolean;
  onResize?: (width: number) => void;
  onAutoFit?: () => void;
  draggableColumn?: boolean;
  onColumnDragStart?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragOver?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragLeave?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragEnd?: (evt: React.DragEvent<HTMLDivElement>) => void;
  onColumnDrop?: (evt: React.DragEvent<HTMLDivElement>) => void;
  filterable?: boolean;
  renderFilter?: () => React.ReactNode;
  style?: React.CSSProperties;
}

export type TableCellElem = React.ReactElement<TableCellProps>;

export class TableCell extends React.Component<TableCellProps> {
  private cellRef = React.createRef<HTMLDivElement>();

  constructor(props: TableCellProps) {
    super(props);
    autoBindReact(this);
  }

  onClick(evt: React.MouseEvent<HTMLDivElement>) {
    const { _sort, sortBy, onClick } = this.props;

    onClick?.(evt);

    if (_sort && typeof sortBy === "string") {
      _sort(sortBy);
    }
  }

  private onResizerMouseDown(evt: React.MouseEvent<HTMLDivElement>) {
    evt.preventDefault();
    evt.stopPropagation();

    const startX = evt.clientX;
    const currentElement = this.cellRef.current;

    if (!currentElement) {
      return;
    }

    const startWidth = currentElement.getBoundingClientRect().width;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX;
      const newWidth = Math.max(50, Math.min(1200, Math.round(startWidth + delta)));

      if (this.props.onResize) {
        this.props.onResize(newWidth);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  private onResizerDoubleClick(evt: React.MouseEvent<HTMLDivElement>) {
    evt.preventDefault();
    evt.stopPropagation();

    if (this.props.onAutoFit) {
      this.props.onAutoFit();

      return;
    }

    const columnId = this.props.id;

    if (!columnId) {
      return;
    }

    const tableRoot = this.cellRef.current?.closest(".Table");

    if (!tableRoot) {
      return;
    }

    const cells = tableRoot.querySelectorAll(`[data-column-id="${columnId}"]`);
    let maxContentWidth = 60;

    cells.forEach((cell) => {
      maxContentWidth = Math.max(maxContentWidth, cell.scrollWidth + 24);
    });

    if (this.cellRef.current) {
      maxContentWidth = Math.max(maxContentWidth, this.cellRef.current.scrollWidth + 30);
    }

    const finalWidth = Math.min(800, maxContentWidth);

    if (this.props.onResize) {
      this.props.onResize(finalWidth);
    }
  }

  renderSortIcon() {
    const { sortBy, _sorting } = this.props;

    if (!_sorting || !sortBy) {
      return null;
    }

    const sortActive = _sorting.sortBy === sortBy;
    const sortIconName = (!sortActive || _sorting.orderBy === "desc")
      ? "arrow_drop_down"
      : "arrow_drop_up";

    return (
      <Icon
        className={cssNames("sortIcon", { enabled: sortActive })}
        material={sortIconName}
      />
    );
  }

  renderCheckbox() {
    const { checkbox, isChecked } = this.props;
    const showCheckbox = isChecked !== undefined;

    if (checkbox && showCheckbox) {
      return <Checkbox value={isChecked} />;
    }

    return null;
  }

  renderFilter() {
    const { renderFilter } = this.props;

    if (!renderFilter) {
      return null;
    }

    return (
      <div
        className="filter-trigger"
        onClick={stopPropagation}
        onMouseDown={stopPropagation}
      >
        {renderFilter()}
      </div>
    );
  }

  renderResizer() {
    if (!this.props.resizable) {
      return null;
    }

    return (
      <div
        className="resizer"
        data-testid={`resizer-${this.props.id || "col"}`}
        onMouseDown={this.onResizerMouseDown}
        onDoubleClick={this.onResizerDoubleClick}
        onClick={stopPropagation}
      />
    );
  }

  render() {
    const {
      className,
      checkbox,
      isChecked,
      scrollable,
      sortBy,
      _sort,
      _sorting,
      _nowrap,
      children,
      title,
      showWithColumn,
      width,
      resizable,
      onResize,
      onAutoFit,
      draggableColumn,
      onColumnDragStart,
      onColumnDragOver,
      onColumnDragLeave,
      onColumnDragEnd,
      onColumnDrop,
      filterable,
      renderFilter,
      style,
      id,
      ...cellProps
    } = this.props;

    const classNames = cssNames("TableCell", className, {
      checkbox,
      scrollable,
      nowrap: _nowrap,
      sorting: _sort && typeof sortBy === "string",
      resizable,
      draggable: draggableColumn,
    });
    const content = title || children;

    const customStyle: React.CSSProperties = {
      ...style,
      ...(width !== undefined ? {
        flex: `0 0 ${typeof width === "number" ? `${width}px` : width}`,
        width: typeof width === "number" ? `${width}px` : width,
        maxWidth: typeof width === "number" ? `${width}px` : width,
      } : {}),
    };

    return (
      <div
        ref={this.cellRef}
        {...cellProps}
        id={id}
        data-column-id={id}
        style={customStyle}
        className={classNames}
        onClick={this.onClick}
        draggable={draggableColumn}
        onDragStart={onColumnDragStart}
        onDragOver={onColumnDragOver}
        onDragLeave={onColumnDragLeave}
        onDragEnd={onColumnDragEnd}
        onDrop={onColumnDrop}
      >
        {this.renderCheckbox()}
        {_nowrap ? <div className="content">{content}</div> : content}
        {this.renderSortIcon()}
        {this.renderFilter()}
        {this.renderResizer()}
      </div>
    );
  }
}
