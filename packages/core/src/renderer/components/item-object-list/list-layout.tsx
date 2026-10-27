/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./item-list-layout.scss";

import React from "react";
import type { IComputedValue } from "mobx";
import { computed, makeObservable, untracked } from "mobx";
import type { ConfirmDialogParams } from "../confirm-dialog";
import type { TableProps, TableRowProps, TableSortCallbacks } from "../table";
import type { IClassName, StrictReactNode, SingleOrMany } from "@openlens/utilities";
import { cssNames, noop } from "@openlens/utilities";
import type { AddRemoveButtonsProps } from "../add-remove-buttons";
import type { ItemObject, TableCellProps } from "@openlens/list-layout";
import type { SearchInputUrlProps } from "../input";
import type { PageFiltersStore } from "./page-filters/store";
import { FilterType } from "./page-filters/store";
import { PageFiltersList } from "./page-filters/list";
import { withInjectables } from "@ogre-tools/injectable-react";
import itemListLayoutStorageInjectable from "./storage.injectable";
import { ItemListLayoutContent } from "./content";
import { ItemListLayoutHeader } from "./header";
import groupBy from "lodash/groupBy";
import { ItemListLayoutFilters } from "./filters";
import { observer } from "mobx-react";
import type { Primitive } from "type-fest";
import type { SubscribableStore } from "../../kube-watch-api/kube-watch-api";
import selectedFilterNamespacesInjectable from "../../../common/k8s-api/selected-filter-namespaces.injectable";
import pageFiltersStoreInjectable from "./page-filters/store.injectable";
import type { StorageLayer } from "../../utils/storage-helper";
import autoBindReact from "auto-bind/react";
import { isWorkloadHealthy, isWorkloadDegraded } from "../kube-object-list-layout/workload-insights-bar";

export type SearchFilter<I extends ItemObject> = (item: I) => SingleOrMany<string | number | undefined | null>;
export type SearchFilters<I extends ItemObject> = Record<string, SearchFilter<I>>;
export type ItemsFilter<I extends ItemObject> = (items: I[]) => I[];
export type ItemsFilters<I extends ItemObject> = Record<string, ItemsFilter<I>>;

export interface HeaderPlaceholders {
  title?: StrictReactNode;
  searchProps?: SearchInputUrlProps;
  filters?: StrictReactNode;
  info?: StrictReactNode;
}

function normalizeText(value: Primitive) {
  return String(value).toLowerCase();
}

export type ItemListStore<I extends ItemObject, PreLoadStores extends boolean> = {
  readonly isLoaded: boolean;
  readonly failedLoading: boolean;
  getTotalCount: () => number;
  isSelected: (item: I) => boolean;
  toggleSelection: (item: I) => void;
  isSelectedAll: (items: I[]) => boolean;
  toggleSelectionAll: (enabledItems: I[]) => void;
  pickOnlySelected: (items: I[]) => I[];
} & ({
  removeItems: (selectedItems: I[]) => Promise<void>;
  readonly selectedItems: I[];
  removeSelectedItems?: unknown;
} | {
  removeSelectedItems: () => Promise<void>;
  selectedItems?: unknown;
  removeItems?: unknown;
}) & (
  PreLoadStores extends true
    ? {
      loadAll: (selectedNamespaces: readonly string[]) => Promise<void>;
    }
    : {
      loadAll?: unknown;
    }
);

export type RenderHeaderTitle<
  Item extends ItemObject,
  PreLoadStores extends boolean,
> = StrictReactNode | ((parent: NonInjectedItemListLayout<Item, PreLoadStores>) => StrictReactNode);

export type HeaderCustomizer = (placeholders: HeaderPlaceholders) => HeaderPlaceholders;
export type ItemListLayoutProps<Item extends ItemObject, PreLoadStores extends boolean = boolean> = {
  tableId?: string;
  className: IClassName;
  getItems: () => Item[];
  store: ItemListStore<Item, PreLoadStores>;
  dependentStores?: SubscribableStore[];
  preloadStores?: boolean;
  hideFilters?: boolean;
  onClearFilters?: () => void;
  searchFilters?: SearchFilter<Item>[];
  /** @deprecated */
  filterItems?: ItemsFilter<Item>[];

  // header (title, filtering, searching, etc.)
  showHeader?: boolean;
  headerClassName?: IClassName;
  renderHeaderTitle?: RenderHeaderTitle<Item, PreLoadStores>;
  customizeHeader?: HeaderCustomizer | HeaderCustomizer[];

  // items list configuration
  isReady?: boolean; // show loading indicator while not ready
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
  renderQuickFilters?: (parent: NonInjectedItemListLayout<Item, PreLoadStores>) => StrictReactNode;
  customizeRemoveDialog?: (selectedItems: Item[]) => Partial<ConfirmDialogParams>;
  renderFooter?: (parent: NonInjectedItemListLayout<Item, PreLoadStores>) => StrictReactNode;

  spinnerTestId?: string;

  /**
   * Message to display when a store failed to load
   *
   * @default "Failed to load items"
   */
  failedToLoadMessage?: StrictReactNode;

  filterCallbacks?: ItemsFilters<Item>;
  "data-testid"?: string;
} & (
  PreLoadStores extends true
    ? {
      preloadStores?: true;
    }
    : {
      preloadStores: false;
    }
);

const defaultProps: Partial<ItemListLayoutProps<ItemObject, true>> = {
  showHeader: true,
  isSelectable: true,
  isConfigurable: false,
  copyClassNameFromHeadCells: true,
  preloadStores: true,
  dependentStores: [],
  searchFilters: [],
  customizeHeader: [],
  filterItems: [],
  hasDetailsView: true,
  onDetails: noop,
  virtual: true,
  customizeTableRowProps: () => ({}),
  failedToLoadMessage: "Failed to load items",
};

export interface ItemListLayoutStorage {
  showFilters: boolean;
}

interface Dependencies {
  selectedFilterNamespaces: IComputedValue<string[]>;
  itemListLayoutStorage: StorageLayer<ItemListLayoutStorage>;
  pageFiltersStore: PageFiltersStore;
}

@observer
export class NonInjectedItemListLayout<I extends ItemObject, PreLoadStores extends boolean> extends React.Component<ItemListLayoutProps<I, PreLoadStores> & Dependencies> {
  static defaultProps = defaultProps as object;

  constructor(props: ItemListLayoutProps<I, PreLoadStores> & Dependencies) {
    super(props);
    makeObservable(this);
    autoBindReact(this);
  }

  async componentDidMount() {
    const { isConfigurable, tableId, preloadStores } = this.props;

    if (isConfigurable && !tableId) {
      throw new Error("[ItemListLayout]: configurable list require props.tableId to be specified");
    }

    if (preloadStores) {
      const { store, dependentStores = [] } = this.props;
      const stores = Array.from(new Set([store, ...dependentStores])) as ItemListStore<I, true>[];

      stores.forEach(store => store.loadAll(this.props.selectedFilterNamespaces.get()));
    }
  }

  componentWillUnmount() {
    const pageFilters = this.props.pageFiltersStore;
    const statusFilters = pageFilters.getValues(FilterType.STATUS);
    const labelFilters = pageFilters.getValues(FilterType.LABEL);

    statusFilters.forEach(val => pageFilters.removeFilter({ type: FilterType.STATUS, value: val }));
    labelFilters.forEach(val => pageFilters.removeFilter({ type: FilterType.LABEL, value: val }));
  }

  get showFilters(): boolean {
    return this.props.itemListLayoutStorage.get().showFilters;
  }

  set showFilters(showFilters: boolean) {
    this.props.itemListLayoutStorage.merge({ showFilters });
  }

  @computed get filters() {
    let { activeFilters } = this.props.pageFiltersStore;
    const { searchFilters = [] } = this.props;

    if (searchFilters.length === 0) {
      activeFilters = activeFilters.filter(({ type }) => type !== FilterType.SEARCH);
    }

    return activeFilters;
  }

  toggleFilters() {
    this.showFilters = !this.showFilters;
  }

  @computed get isReady() {
    return this.props.isReady ?? this.props.store.isLoaded;
  }

  renderFilters() {
    const { hideFilters } = this.props;
    const { isReady, filters } = this;

    if (!isReady || !filters.length || hideFilters || !this.showFilters) {
      return null;
    }

    return <PageFiltersList filters={filters} />;
  }

  private filterCallbacks: ItemsFilters<I> = {
    [FilterType.SEARCH]: items => {
      const { searchFilters = [] } = this.props;
      const search = this.props.pageFiltersStore.getValues(FilterType.SEARCH)[0] || "";

      if (search && searchFilters.length) {
        const searchTexts = [search].map(normalizeText);

        return items.filter(item => (
          searchFilters.some(getTexts => (
            [getTexts(item)]
              .flat()
              .map(normalizeText)
              .some(source => searchTexts.some(search => source.includes(search)))
          ))
        ));
      }

      return items;
    },
    [FilterType.STATUS]: items => {
      const statusValues = this.props.pageFiltersStore.getValues(FilterType.STATUS);

      if (!statusValues.length) {
        return items;
      }

      const normalized = new Set(statusValues.map(s => s.toLowerCase()));

      return items.filter(item => {
        const anyItem = item as any;
        const status = (
          typeof (item as unknown as { getStatusMessage?: () => string }).getStatusMessage === "function"
            ? (item as unknown as { getStatusMessage: () => string }).getStatusMessage()
            : (item as unknown as { status?: { phase?: string }}).status?.phase
        ) || "";

        if (normalized.has("failed") || normalized.has("degraded")) {
          if (isWorkloadDegraded(item, anyItem?.kind)) {
            return true;
          }
        }

        if (normalized.has("running") || normalized.has("healthy")) {
          if (isWorkloadHealthy(item, anyItem?.kind)) {
            return true;
          }
        }

        return normalized.has(status.toLowerCase());
      });
    },
    [FilterType.LABEL]: items => {
      const labelValues = this.props.pageFiltersStore.getValues(FilterType.LABEL);

      if (!labelValues.length) {
        return items;
      }

      return items.filter(item => {
        const itemLabels: Record<string, string> = (item as unknown as { metadata?: { labels?: Record<string, string> }}).metadata?.labels || {};

        return labelValues.every(filterLabel => {
          if (filterLabel.includes("=")) {
            const [k, ...rest] = filterLabel.split("=");
            const v = rest.join("=");

            return itemLabels[k] === v;
          }

          return Object.prototype.hasOwnProperty.call(itemLabels, filterLabel);
        });
      });
    },
    [FilterType.COLUMN]: items => {
      const colFilters = this.props.pageFiltersStore.getValues(FilterType.COLUMN);

      if (!colFilters.length) {
        return items;
      }

      const filterGroups = new Map<string, Set<string>>();

      for (const filterStr of colFilters) {
        const colonIndex = filterStr.indexOf(":");

        if (colonIndex !== -1) {
          const colId = filterStr.slice(0, colonIndex);
          const val = filterStr.slice(colonIndex + 1).toLowerCase();

          if (!filterGroups.has(colId)) {
            filterGroups.set(colId, new Set());
          }
          filterGroups.get(colId)?.add(val);
        }
      }

      return items.filter(item => {
        const anyItem = item as any;

        for (const [colId, allowedValues] of filterGroups.entries()) {
          let itemVal = "";

          if (colId === "namespace" || colId === "ns") {
            itemVal = (anyItem.getNs?.() || anyItem.metadata?.namespace || "").toLowerCase();
          } else if (colId === "name") {
            itemVal = (item.getName?.() || anyItem.metadata?.name || "").toLowerCase();
          } else if (colId === "status") {
            itemVal = (anyItem.getStatusMessage?.() || anyItem.status?.phase || "").toLowerCase();
          } else if (typeof anyItem[colId] === "string") {
            itemVal = anyItem[colId].toLowerCase();
          } else if (typeof anyItem[colId] === "number") {
            itemVal = String(anyItem[colId]).toLowerCase();
          } else if (typeof anyItem.getSearchFields === "function") {
            const fields: string[] = anyItem.getSearchFields().map((f: any) => String(f).toLowerCase());
            const hasMatch = fields.some(f => Array.from(allowedValues).some(v => f.includes(v)));

            if (!hasMatch) {
              return false;
            }
            continue;
          }

          if (!allowedValues.has(itemVal)) {
            return false;
          }
        }

        return true;
      });
    },
  };

  @computed get items() {
    const filterGroups = groupBy(this.filters, ({ type }) => type);
    const filterItems: ItemsFilter<I>[] = [];

    for (const [type, filtersGroup] of Object.entries(filterGroups)) {
      const filterCallback = this.filterCallbacks[type] ?? this.props.filterCallbacks?.[type];

      if (filterCallback && filtersGroup.length > 0) {
        filterItems.push(filterCallback);
      }
    }

    const items = this.props.getItems();

    return applyFilters(filterItems.concat(this.props.filterItems ?? []), items);
  }

  render() {
    const { renderHeaderTitle, "data-testid": dataTestId } = this.props;
    const quickFilters = untracked(() => this.props.renderQuickFilters?.(this));

    return untracked(() => (
      <div
        className={cssNames("ItemListLayout flex column", this.props.className)}
        data-testid={dataTestId}
      >
        <ItemListLayoutHeader
          getItems={() => this.items}
          getFilters={() => this.filters}
          toggleFilters={this.toggleFilters}
          onClearFilters={() => {
            this.props.onClearFilters?.();
            this.props.pageFiltersStore.reset();
          }}
          quickFilters={quickFilters}
          store={this.props.store}
          searchFilters={this.props.searchFilters}
          showHeader={this.props.showHeader}
          headerClassName={this.props.headerClassName}
          renderHeaderTitle={(
            typeof renderHeaderTitle === "function"
              ? () => renderHeaderTitle(this)
              : renderHeaderTitle
          )}
          customizeHeader={this.props.customizeHeader}
        />

        <ItemListLayoutFilters
          getIsReady={() => this.isReady}
          getFilters={() => this.filters}
          getFiltersAreShown={() => this.showFilters}
          hideFilters={this.props.hideFilters ?? false}
        />

        <ItemListLayoutContent<I, PreLoadStores>
          getItems={() => this.items}
          getFilters={() => this.filters}
          tableId={this.props.tableId}
          className={this.props.className}
          store={this.props.store}
          getIsReady={() => this.isReady}
          isSelectable={this.props.isSelectable}
          isConfigurable={this.props.isConfigurable}
          copyClassNameFromHeadCells={this.props.copyClassNameFromHeadCells}
          sortingCallbacks={this.props.sortingCallbacks}
          tableProps={this.props.tableProps}
          renderTableHeader={this.props.renderTableHeader}
          renderTableContents={this.props.renderTableContents}
          renderItemMenu={this.props.renderItemMenu}
          customizeTableRowProps={this.props.customizeTableRowProps}
          addRemoveButtons={this.props.addRemoveButtons}
          virtual={this.props.virtual}
          hasDetailsView={this.props.hasDetailsView}
          detailsItem={this.props.detailsItem}
          onDetails={this.props.onDetails}
          customizeRemoveDialog={this.props.customizeRemoveDialog}
          failedToLoadMessage={this.props.failedToLoadMessage}
          spinnerTestId={this.props.spinnerTestId}
        />

        {this.props.renderFooter?.(this)}
      </div>
    ));
  }
}

export const ItemListLayout = withInjectables<Dependencies, ItemListLayoutProps<ItemObject, boolean>>(NonInjectedItemListLayout, {
  getProps: (di, props) => ({
    ...props,
    selectedFilterNamespaces: di.inject(selectedFilterNamespacesInjectable),
    itemListLayoutStorage: di.inject(itemListLayoutStorageInjectable),
    pageFiltersStore: di.inject(pageFiltersStoreInjectable),
  }),
}) as <I extends ItemObject, PreLoadStores extends boolean = true>(props: ItemListLayoutProps<I, PreLoadStores>) => React.ReactElement;

function applyFilters<I extends ItemObject>(filters: ItemsFilter<I>[], items: I[]): I[] {
  if (!filters || !filters.length) {
    return items;
  }

  return filters.reduce((items, filter) => filter(items), items);
}
