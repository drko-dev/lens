/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./item-list-layout.scss";

import React from "react";
import type { IComputedValue } from "mobx";
import { computed, makeObservable, observable } from "mobx";
import { Observer, observer } from "mobx-react";
import type { ConfirmDialogParams } from "../confirm-dialog";
import type { TableProps, TableRowProps, TableSortCallbacks, TableCellProps } from "../table";
import { Table, TableCell, TableHead, TableRow } from "../table";
import type { IClassName, StrictReactNode } from "@openlens/utilities";
import { cssNames, isDefined, isReactNode, noop, prevDefault, stopPropagation } from "@openlens/utilities";
import type { AddRemoveButtonsProps } from "../add-remove-buttons";
import { AddRemoveButtons } from "../add-remove-buttons";
import { NoItems } from "../no-items";
import { Spinner } from "../spinner";
import type { ItemObject } from "@openlens/list-layout";
import type { Filter, PageFiltersStore } from "./page-filters/store";
import { FilterType } from "./page-filters/store";
import { ColumnFilterPopover } from "../table/column-filter-popover";
import type { LensTheme } from "../../themes/lens-theme";
import { MenuActions } from "../menu/menu-actions";
import { MenuItem } from "../menu";
import { Checkbox } from "../checkbox";
import type { ItemListStore } from "./list-layout";
import { withInjectables } from "@ogre-tools/injectable-react";
import pageFiltersStoreInjectable from "./page-filters/store.injectable";
import type { OpenConfirmDialog } from "../confirm-dialog/open.injectable";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import activeThemeInjectable from "../../themes/active.injectable";
import autoBindReact from "auto-bind/react";
import type { ToggleTableColumnVisibility } from "../../../features/user-preferences/common/toggle-table-column-visibility.injectable";
import toggleTableColumnVisibilityInjectable from "../../../features/user-preferences/common/toggle-table-column-visibility.injectable";
import type { IsTableColumnHidden } from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import type { TableModel } from "../table/table-model/table-model";
import tableModelInjectable from "../table/table-model/table-model.injectable";

export interface ItemListLayoutContentProps<Item extends ItemObject, PreLoadStores extends boolean> {
  getFilters: () => Filter[];
  tableId?: string;
  className: IClassName;
  getItems: () => Item[];
  store: ItemListStore<Item, PreLoadStores>;
  getIsReady: () => boolean; // show loading indicator while not ready
  isSelectable?: boolean; // show checkbox in rows for selecting items
  isConfigurable?: boolean;
  copyClassNameFromHeadCells?: boolean;
  sortingCallbacks?: TableSortCallbacks<Item>;
  tableProps?: Partial<TableProps<Item>>; // low-level table configuration
  renderTableHeader?: (TableCellProps | undefined | null)[];
  renderTableContents: (item: Item) => (StrictReactNode | TableCellProps)[];
  renderItemMenu?: (item: Item, store: ItemListStore<Item, PreLoadStores>) => StrictReactNode;
  customizeTableRowProps?: (item: Item) => Partial<TableRowProps<Item>>;
  addRemoveButtons?: Partial<AddRemoveButtonsProps>;
  virtual?: boolean;

  // item details view
  hasDetailsView?: boolean;
  detailsItem?: Item;
  onDetails?: (item: Item) => void;

  // other
  customizeRemoveDialog?: (selectedItems: Item[]) => Partial<ConfirmDialogParams>;

  spinnerTestId?: string;

  /**
   * Message to display when a store failed to load
   *
   * @default "Failed to load items"
   */
  failedToLoadMessage?: StrictReactNode;
}

interface Dependencies {
  activeTheme: IComputedValue<LensTheme>;
  pageFiltersStore: PageFiltersStore;
  openConfirmDialog: OpenConfirmDialog;
  toggleTableColumnVisibility: ToggleTableColumnVisibility;
  isTableColumnHidden: IsTableColumnHidden;
  tableModel?: TableModel;
}

@observer
class NonInjectedItemListLayoutContent<
  Item extends ItemObject,
  PreLoadStores extends boolean,
> extends React.Component<ItemListLayoutContentProps<Item, PreLoadStores> & Dependencies> {
  constructor(props: ItemListLayoutContentProps<Item, PreLoadStores> & Dependencies) {
    super(props);
    makeObservable(this);
    autoBindReact(this);
  }

  @observable draggingColumnId: string | null = null;
  @observable dropTargetColumnId: string | null = null;
  @observable dropTargetSide: "left" | "right" | null = null;

  @computed get failedToLoad() {
    return this.props.store.failedLoading;
  }

  private getColumnGroups() {
    const { renderTableHeader } = this.props;

    if (!renderTableHeader || renderTableHeader.length === 0) {
      return [];
    }

    const groups: Array<{ id: string; indices: number[]; primaryIndex: number }> = [];
    const groupById = new Map<string, { id: string; indices: number[]; primaryIndex: number }>();

    renderTableHeader.forEach((col, index) => {
      if (!col) return;

      if (col.showWithColumn && groupById.has(col.showWithColumn)) {
        groupById.get(col.showWithColumn)?.indices.push(index);
      } else {
        const id = col.id ?? `col_${index}`;
        const group = {
          id,
          indices: [index],
          primaryIndex: index,
        };

        groups.push(group);
        groupById.set(id, group);
      }
    });

    return groups;
  }

  private getOrderedColumnGroups() {
    const defaultGroups = this.getColumnGroups();
    const { tableId, tableModel } = this.props;

    if (!tableId || !tableModel) {
      return defaultGroups;
    }

    const savedOrder = tableModel.getColumnOrder(tableId);

    if (!savedOrder || savedOrder.length === 0) {
      return defaultGroups;
    }

    const groupMap = new Map(defaultGroups.map(g => [g.id, g]));
    const ordered: typeof defaultGroups = [];

    for (const id of savedOrder) {
      const group = groupMap.get(id);

      if (group) {
        ordered.push(group);
        groupMap.delete(id);
      }
    }

    for (const group of defaultGroups) {
      if (groupMap.has(group.id)) {
        ordered.push(group);
      }
    }

    return ordered;
  }

  private getEffectiveColumnIndices(): number[] {
    const orderedGroups = this.getOrderedColumnGroups();

    if (orderedGroups.length === 0) {
      const total = this.props.renderTableHeader?.length ?? 0;

      return Array.from({ length: total }, (_, i) => i);
    }

    return orderedGroups.flatMap(g => g.indices);
  }

  private getDistinctColumnValues(colId: string): string[] {
    const items = this.props.getItems();

    if (!items || items.length === 0) {
      return [];
    }

    const valueSet = new Set<string>();

    for (const item of items) {
      const anyItem = item as any;
      let val: string | undefined;

      if (colId === "namespace" || colId === "ns") {
        val = anyItem.getNs?.() || anyItem.metadata?.namespace;
      } else if (colId === "status") {
        val = anyItem.getStatusMessage?.() || anyItem.status?.phase;
      } else if (colId === "type" && typeof anyItem.getType === "function") {
        val = anyItem.getType();
      } else if (colId === "node" && typeof anyItem.getNodeName === "function") {
        val = anyItem.getNodeName();
      }

      if (val && typeof val === "string" && val.trim().length > 0) {
        valueSet.add(val.trim());
      }
    }

    return Array.from(valueSet).sort();
  }

  private onColumnDragStart = (columnId: string) => (evt: React.DragEvent<HTMLDivElement>) => {
    evt.dataTransfer.setData("text/plain", columnId);
    evt.dataTransfer.effectAllowed = "move";
    this.draggingColumnId = columnId;
  };

  private onColumnDragOver = (columnId: string) => (evt: React.DragEvent<HTMLDivElement>) => {
    if (!this.draggingColumnId || this.draggingColumnId === columnId) {
      return;
    }

    evt.preventDefault();
    evt.dataTransfer.dropEffect = "move";

    const targetRect = evt.currentTarget.getBoundingClientRect();
    const midX = targetRect.left + targetRect.width / 2;
    const side = evt.clientX < midX ? "left" : "right";

    if (this.dropTargetColumnId !== columnId || this.dropTargetSide !== side) {
      this.dropTargetColumnId = columnId;
      this.dropTargetSide = side;
    }
  };

  private onColumnDragLeave = (columnId: string) => () => {
    if (this.dropTargetColumnId === columnId) {
      this.dropTargetColumnId = null;
      this.dropTargetSide = null;
    }
  };

  private onColumnDragEnd = () => {
    this.draggingColumnId = null;
    this.dropTargetColumnId = null;
    this.dropTargetSide = null;
  };

  private onColumnDrop = (targetColumnId: string) => (evt: React.DragEvent<HTMLDivElement>) => {
    evt.preventDefault();
    const sourceColumnId = this.draggingColumnId || evt.dataTransfer.getData("text/plain");

    if (!sourceColumnId || sourceColumnId === targetColumnId) {
      this.onColumnDragEnd();

      return;
    }

    const { tableId, tableModel } = this.props;

    if (!tableId || !tableModel) {
      this.onColumnDragEnd();

      return;
    }

    const currentGroups = this.getOrderedColumnGroups();
    const currentIds = currentGroups.map(g => g.id);
    const sourceIndex = currentIds.indexOf(sourceColumnId);
    const targetIndex = currentIds.indexOf(targetColumnId);

    if (sourceIndex === -1 || targetIndex === -1) {
      this.onColumnDragEnd();

      return;
    }

    const newIds = [...currentIds];

    newIds.splice(sourceIndex, 1);

    let insertIndex = newIds.indexOf(targetColumnId);

    if (this.dropTargetSide === "right") {
      insertIndex += 1;
    }

    newIds.splice(insertIndex, 0, sourceColumnId);

    tableModel.setColumnOrder(tableId, newIds);
    this.onColumnDragEnd();
  };

  renderRow(item: Item) {
    return this.getTableRow(item);
  }

  getTableRow(item: Item) {
    const openRowMenu = (evt: React.MouseEvent<HTMLElement>) => {
      // Reuse the row's own menu trigger so the same items, filters and confirmations apply.
      const trigger = evt.currentTarget.querySelector<HTMLElement>(".TableCell.menu .Icon");

      if (trigger) {
        evt.preventDefault();
        trigger.click();
      }
    };

    const {
      isSelectable, renderTableHeader, renderTableContents, renderItemMenu,
      store, hasDetailsView, onDetails,
      copyClassNameFromHeadCells, customizeTableRowProps = () => ({}), detailsItem,
      tableId,
    } = this.props;
    const { isSelected } = store;
    const columnWidths = tableId && this.props.tableModel
      ? this.props.tableModel.getColumnWidths(tableId)
      : {};
    const rowContents = renderTableContents(item);
    const effectiveIndices = this.getEffectiveColumnIndices();

    return (
      <TableRow
        nowrap
        searchItem={item}
        sortItem={item}
        selected={detailsItem && detailsItem.getId() === item.getId()}
        onClick={hasDetailsView ? prevDefault(() => onDetails?.(item)) : undefined}
        onContextMenu={renderItemMenu ? openRowMenu : undefined}
        {...customizeTableRowProps(item)}
      >
        {isSelectable && (
          <TableCell
            checkbox
            isChecked={isSelected(item)}
            onClick={prevDefault(() => store.toggleSelection(item))}
          />
        )}
        {effectiveIndices.map((index) => {
          const content = rowContents[index];
          const cellProps: TableCellProps = isReactNode(content)
            ? { children: content }
            : content;
          const headCell = renderTableHeader?.[index];

          if (copyClassNameFromHeadCells && headCell) {
            cellProps.className = cssNames(
              cellProps.className,
              headCell.className,
            );
          }

          if (!headCell || this.showColumn(headCell)) {
            const colId = headCell?.id ?? String(index);
            const savedWidth = columnWidths[colId];

            return (
              <TableCell
                key={colId}
                id={colId}
                width={savedWidth ?? headCell?.width}
                {...cellProps}
              />
            );
          }

          return null;
        })}
        {renderItemMenu && (
          <TableCell className="menu">
            <div onClick={stopPropagation}>
              {renderItemMenu(item, store)}
            </div>
          </TableCell>
        )}
      </TableRow>
    );
  }

  getRow(uid: string) {
    return (
      <div key={uid}>
        <Observer>
          {() => {
            const item = this.props.getItems().find(item => item.getId() === uid);

            if (!item) return null;

            return this.getTableRow(item);
          }}
        </Observer>
      </div>
    );
  }

  removeItemsDialog(selectedItems: Item[]) {
    const { customizeRemoveDialog, store, openConfirmDialog } = this.props;
    const visibleMaxNamesCount = 5;
    const selectedNames = selectedItems.map(ns => ns.getName()).slice(0, visibleMaxNamesCount).join(", ");
    const dialogCustomProps = customizeRemoveDialog ? customizeRemoveDialog(selectedItems) : {};
    const selectedCount = selectedItems.length;
    const tailCount = selectedCount > visibleMaxNamesCount
      ? selectedCount - visibleMaxNamesCount
      : 0;
    const tail = tailCount > 0
      ? (
        <>
          {", and "}
          <b>{tailCount}</b>
          {" more"}
        </>
      )
      : null;
    const message = selectedCount <= 1
      ? (
        <p>
          {"Remove item "}
          <b>{selectedNames}</b>
          ?
        </p>
      )
      : (
        <p>
          {"Remove "}
          <b>{selectedCount}</b>
          {" items "}
          <b>{selectedNames}</b>
          {tail}
          ?
        </p>
      );
    const { removeSelectedItems, removeItems } = store;
    const onConfirm = typeof removeItems === "function"
      ? () => removeItems.apply(store, [selectedItems])
      : typeof removeSelectedItems === "function"
        ? removeSelectedItems.bind(store)
        : noop;

    openConfirmDialog({
      ok: onConfirm,
      labelOk: "Remove",
      message,
      ...dialogCustomProps,
    });
  }

  renderNoItems() {
    if (this.failedToLoad) {
      return <NoItems>{this.props.failedToLoadMessage}</NoItems>;
    }

    if (!this.props.getIsReady()) {
      return <Spinner center data-testid={this.props.spinnerTestId} />;
    }

    if (this.props.getFilters().length > 0) {
      return (
        <NoItems>
          No items found.
          <p>
            <a onClick={() => this.props.pageFiltersStore.reset()} className="contrast">
              Reset filters?
            </a>
          </p>
        </NoItems>
      );
    }

    return <NoItems />;
  }

  renderItems() {
    if (this.props.virtual) {
      return null;
    }

    return this.props.getItems().map(item => this.getRow(item.getId()));
  }

  renderTableHeader() {
    const { customizeTableRowProps, renderTableHeader, isSelectable, isConfigurable, store, tableId } = this.props;

    if (!renderTableHeader) {
      return null;
    }

    const enabledItems = this.props.getItems().filter(item => !customizeTableRowProps?.(item).disabled);
    const columnWidths = tableId && this.props.tableModel
      ? this.props.tableModel.getColumnWidths(tableId)
      : {};
    const orderedGroups = this.getOrderedColumnGroups();

    return (
      <TableHead showTopLine nowrap>
        {isSelectable && (
          <Observer>
            {() => (
              <TableCell
                checkbox
                isChecked={store.isSelectedAll(enabledItems)}
                onClick={prevDefault(() => store.toggleSelectionAll(enabledItems))}
              />
            )}
          </Observer>
        )}
        {
          orderedGroups.map((group) => (
            group.indices.map((index) => {
              const cellProps = renderTableHeader[index];

              if (!cellProps || !this.showColumn(cellProps)) {
                return null;
              }

              const colId = cellProps.id ?? String(index);
              const savedWidth = columnWidths[colId];
              const isPrimary = index === group.primaryIndex;
              const isDropTarget = isPrimary && this.dropTargetColumnId === group.id;
              const dropIndicatorClass = isDropTarget
                ? (this.dropTargetSide === "left" ? "drop-target-left" : "drop-target-right")
                : undefined;

              const distinctValues = isPrimary ? this.getDistinctColumnValues(colId) : [];
              const shouldRenderFilter = cellProps.renderFilter
                ? true
                : (cellProps.filterable !== false && distinctValues.length > 1);

              const activeColFilters = shouldRenderFilter
                ? this.props.pageFiltersStore
                  .getValues(FilterType.COLUMN)
                  .filter(str => str.startsWith(`${colId}:`))
                  .map(str => str.slice(colId.length + 1))
                : [];

              const defaultFilterRenderer = shouldRenderFilter && !cellProps.renderFilter ? () => (
                <ColumnFilterPopover
                  columnId={colId}
                  columnTitle={typeof cellProps.title === "string" ? cellProps.title : undefined}
                  values={distinctValues}
                  selectedValues={activeColFilters}
                  onSelect={(newSelected: string[]) => {
                    const currentFilters = this.props.pageFiltersStore.getValues(FilterType.COLUMN);

                    for (const f of currentFilters) {
                      if (f.startsWith(`${colId}:`)) {
                        this.props.pageFiltersStore.removeFilter({ type: FilterType.COLUMN, value: f });
                      }
                    }

                    for (const val of newSelected) {
                      this.props.pageFiltersStore.addFilter({
                        type: FilterType.COLUMN,
                        value: `${colId}:${val}`,
                      });
                    }
                  }}
                />
              ) : undefined;

              const renderFilter = cellProps.renderFilter ?? defaultFilterRenderer;

              return (
                <TableCell
                  key={cellProps.id ?? index}
                  className={cssNames(cellProps.className, dropIndicatorClass)}
                  resizable={Boolean(tableId)}
                  draggableColumn={Boolean(tableId && isPrimary)}
                  renderFilter={renderFilter}
                  onColumnDragStart={isPrimary && tableId ? this.onColumnDragStart(group.id) : undefined}
                  onColumnDragOver={isPrimary && tableId ? this.onColumnDragOver(group.id) : undefined}
                  onColumnDragLeave={isPrimary && tableId ? this.onColumnDragLeave(group.id) : undefined}
                  onColumnDragEnd={isPrimary && tableId ? this.onColumnDragEnd : undefined}
                  onColumnDrop={isPrimary && tableId ? this.onColumnDrop(group.id) : undefined}
                  width={savedWidth ?? cellProps.width}
                  onResize={(newWidth: number) => {
                    if (tableId && this.props.tableModel) {
                      this.props.tableModel.setColumnWidth(tableId, colId, newWidth);
                    }
                  }}
                  {...cellProps}
                />
              );
            })
          ))
        }
        <TableCell className="menu">
          {(isConfigurable && tableId)
            ? this.renderColumnVisibilityMenu(tableId)
            : undefined
          }
        </TableCell>
      </TableHead>
    );
  }

  render() {
    const {
      store, hasDetailsView, addRemoveButtons = {}, virtual, sortingCallbacks,
      detailsItem, className, tableProps = {}, tableId, getItems, activeTheme,
    } = this.props;
    const selectedItemId = detailsItem && detailsItem.getId();
    const classNames = cssNames(className, "box", "grow", activeTheme.get().type);
    const items = getItems();
    const selectedItems = store.pickOnlySelected(items);

    return (
      <div className="items box grow flex column">
        <Table
          tableId={tableId}
          virtual={virtual}
          selectable={hasDetailsView}
          sortable={sortingCallbacks}
          getTableRow={this.getRow}
          renderRow={virtual ? undefined : this.renderRow}
          items={items}
          selectedItemId={selectedItemId}
          noItems={this.renderNoItems()}
          className={classNames}
          {...tableProps}
        >
          {this.renderTableHeader()}
          {this.renderItems()}
        </Table>

        <Observer>
          {() => (
            <AddRemoveButtons
              onRemove={
                (store.removeItems || store.removeSelectedItems) && selectedItems.length > 0
                  ? () => this.removeItemsDialog(selectedItems)
                  : undefined
              }
              removeTooltip={`Remove selected items (${selectedItems.length})`}
              {...addRemoveButtons}
            />
          )}
        </Observer>
      </div>
    );
  }

  showColumn({ id: columnId, showWithColumn }: TableCellProps): boolean {
    const { tableId, isConfigurable } = this.props;

    return !isConfigurable || !tableId || !this.props.isTableColumnHidden(tableId, columnId, showWithColumn);
  }

  renderColumnVisibilityMenu(tableId: string) {
    const { renderTableHeader = [] } = this.props;

    return (
      <MenuActions
        id="menu-actions-for-item-object-list-content"
        className="ItemListLayoutVisibilityMenu"
        toolbar={false}
        autoCloseOnSelect={false}
      >
        {
          renderTableHeader
            .filter(isDefined)
            .filter((props): props is TableCellProps & { id: string } => !!props.id)
            .filter(props => !props.showWithColumn)
            .map((cellProps) => (
              <MenuItem key={cellProps.id} className="input">
                <Checkbox
                  label={cellProps.title ?? `<${cellProps.className}>`}
                  value={this.showColumn(cellProps)}
                  onChange={() => this.props.toggleTableColumnVisibility(tableId, cellProps.id)}
                />
              </MenuItem>
            ))
        }
        <MenuItem
          key="reset-layout"
          onClick={() => {
            this.props.tableModel?.resetColumnOrder(tableId);
            this.props.tableModel?.resetColumnWidths(tableId);
          }}
        >
          Reset column layout
        </MenuItem>
      </MenuActions>
    );
  }
}

export const ItemListLayoutContent = withInjectables<Dependencies, ItemListLayoutContentProps<ItemObject, boolean>>(NonInjectedItemListLayoutContent, {
  getProps: (di, props) => ({
    ...props,
    activeTheme: di.inject(activeThemeInjectable),
    pageFiltersStore: di.inject(pageFiltersStoreInjectable),
    openConfirmDialog: di.inject(openConfirmDialogInjectable),
    toggleTableColumnVisibility: di.inject(toggleTableColumnVisibilityInjectable),
    isTableColumnHidden: di.inject(isTableColumnHiddenInjectable),
    tableModel: di.inject(tableModelInjectable),
  }),
}) as <Item extends ItemObject, PreLoadStores extends boolean>(props: ItemListLayoutContentProps<Item, PreLoadStores>) => React.ReactElement;
