/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./kube-object-list-layout.scss";

import React from "react";
import { action, computed, makeObservable, observable, reaction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import type { Disposer } from "@openlens/utilities";
import { hasTypedProperty, isObject, isString, cssNames, isDefined } from "@openlens/utilities";
import type { KubeJsonApiDataFor, KubeObject } from "@openlens/kube-object";
import type { ItemListLayoutProps, ItemListStore, NonInjectedItemListLayout } from "../item-object-list/list-layout";
import { ItemListLayout } from "../item-object-list/list-layout";
import { KubeObjectMenu } from "../kube-object-menu";
import { NamespaceSelectFilter } from "../namespaces/namespace-select-filter";
import { ResourceKindMap, ResourceNames } from "../../utils/rbac";
import { Icon } from "../icon";
import { TooltipPosition } from "@openlens/tooltip";
import { withInjectables } from "@ogre-tools/injectable-react";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import type { SubscribableStore, SubscribeStores } from "../../kube-watch-api/kube-watch-api";
import type { KubeApi } from "../../../common/k8s-api/kube-api";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import type { PageParam } from "../../navigation/page-param";
import type { ToggleKubeDetailsPane } from "../kube-detail-params/toggle-details.injectable";
import kubeSelectedUrlParamInjectable from "../kube-detail-params/kube-selected-url.injectable";
import toggleKubeDetailsPaneInjectable from "../kube-detail-params/toggle-details.injectable";
import type { ClusterContext } from "../../cluster-frame-context/cluster-frame-context";
import type { GeneralKubeObjectListLayoutColumn, SpecificKubeListLayoutColumn } from "@openlens/list-layout";
import { kubeObjectListLayoutColumnInjectionToken } from "@openlens/list-layout";
import { sortBy } from "lodash";
import { KubeQuickFilters } from "./kube-quick-filters";
import { CsvExportDialog } from "./csv-export-dialog";
import { resolveExportColumns } from "./kube-csv-extractor";
import { getSorted } from "../table/sorting";
import type { TableModel } from "../table/table-model/table-model";
import tableModelInjectable from "../table/table-model/table-model.injectable";
import type { IsTableColumnHidden } from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import isTableColumnHiddenInjectable from "../../../features/user-preferences/common/is-table-column-hidden.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import type { Cluster } from "../../../common/cluster/cluster";

export type KubeItemListStore<K extends KubeObject> = ItemListStore<K, false> & SubscribableStore & {
  getByPath: (path: string) => K | undefined;
  readonly contextItems: K[];
};

export interface KubeObjectListLayoutProps<
  K extends KubeObject,
  // eslint-disable-next-line unused-imports/no-unused-vars-ts, @typescript-eslint/no-unused-vars
  A extends KubeApi<K, D>,
  D extends KubeJsonApiDataFor<K>,
> extends Omit<ItemListLayoutProps<K, false>, "getItems" | "dependentStores" | "preloadStores"> {
  items?: K[];
  getItems?: () => K[];
  store: KubeItemListStore<K>;
  dependentStores?: SubscribableStore[];
  subscribeStores?: boolean;

  /**
   * Customize resource name for e.g. search input ("Search <ResourceName>..."")
   * If not provided, ResourceNames is used instead with a fallback to resource kind.
   */
  resourceName?: string;
  columns?: SpecificKubeListLayoutColumn<K>[];
}

interface Dependencies {
  clusterFrameContext: ClusterContext;
  subscribeToStores: SubscribeStores;
  kubeSelectedUrlParam: PageParam<string>;
  toggleKubeDetailsPane: ToggleKubeDetailsPane;
  generalColumns: GeneralKubeObjectListLayoutColumn[];
  tableModel: TableModel;
  isTableColumnHidden: IsTableColumnHidden;
  hostedCluster?: Cluster;
}

const matchesApiFor = (api: SubscribableStore["api"]) => (column: GeneralKubeObjectListLayoutColumn) => (
  column.kind === api.kind
  && (
    isString(api.apiVersionWithGroup)
      ? [column.apiVersion].flat().includes(api.apiVersionWithGroup)
      : true
  )
);

const getLoadErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.cause) {
      return `${error.message}: ${getLoadErrorMessage(error.cause)}`;
    }

    return error.message;
  }

  if (isObject(error) && hasTypedProperty(error, "message", isString)) {
    return error.message;
  }

  return `${String(error)}`;
};

@observer
class NonInjectedKubeObjectListLayout<
  K extends KubeObject,
  A extends KubeApi<K, D>,
  D extends KubeJsonApiDataFor<K>,
> extends React.Component<KubeObjectListLayoutProps<K, A, D> & Dependencies> {
  static defaultProps = {
    subscribeStores: true,
  };

  constructor(props: KubeObjectListLayoutProps<K, A, D> & Dependencies) {
    super(props);
    makeObservable(this);
  }

  private readonly loadErrors = observable.array<string>();
  @observable isCsvDialogOpen = false;
  private itemListRef: NonInjectedItemListLayout<K, false> | null = null;

  @action
    openCsvDialog = () => {
      this.isCsvDialogOpen = true;
    };

  @action
    closeCsvDialog = () => {
      this.isCsvDialogOpen = false;
    };

  renderQuickFilters = (itemList: NonInjectedItemListLayout<K, false>) => {
    this.itemListRef = itemList;
    const rawItems = this.props.items || this.props.store.contextItems;
    const kind = this.props.store.api.kind;
    return (
      <div className="quick-filters-row">
        <KubeQuickFilters
          rawItems={rawItems}
          resourceKind={kind}
        />
      </div>
    );
  };

  @computed get selectedItem() {
    return this.props.store.getByPath(this.props.kubeSelectedUrlParam.get());
  }

  componentDidMount() {
    const { store, dependentStores = [], subscribeStores } = this.props;
    const stores = Array.from(new Set([store, ...dependentStores]));
    const reactions: Disposer[] = [
      reaction(() => this.props.clusterFrameContext.contextNamespaces.slice(), () => {
        // clear load errors
        this.loadErrors.length = 0;
      }),
    ];

    if (subscribeStores) {
      reactions.push(
        this.props.subscribeToStores(stores, {
          onLoadFailure: error => {
            this.loadErrors.push(getLoadErrorMessage(error));
          },
        }),
      );
    }

    disposeOnUnmount(this, reactions);
  }

  renderLoadErrors() {
    if (this.loadErrors.length === 0) {
      return null;
    }

    return (
      <Icon
        material="warning"
        className="load-error"
        tooltip={{
          children: (
            <>
              {this.loadErrors.map((error, index) => <p key={index}>{error}</p>)}
            </>
          ),
          preferredPositions: TooltipPosition.BOTTOM,
        }}
      />
    );
  }

  renderFailedToLoadMessage() {
    if (this.props.failedToLoadMessage) {
      return this.props.failedToLoadMessage;
    }

    const { store } = this.props;
    const error: any = (store as any).lastError;
    const statusCode = error?.statusCode ?? error?.status ?? error?.code;
    const errorMsg = String(error?.message || error || "");

    if (statusCode === 403 || errorMsg.includes("403") || errorMsg.toLowerCase().includes("forbidden")) {
      return (
        <div data-testid="kube-list-error-403">
          <p><strong>Access Denied (403 Forbidden)</strong></p>
          <p style={{ marginTop: 4 }}>
            Your account does not have sufficient RBAC permissions to list 
            {" "}
            {this.props.resourceName || store.api.kind}
            {" "}
            in the selected namespace(s).
          </p>
        </div>
      );
    }

    if (statusCode === 404 || errorMsg.includes("404") || errorMsg.includes("Can't find working API")) {
      return (
        <div data-testid="kube-list-error-404">
          <p><strong>Resource API Not Found (404)</strong></p>
          <p style={{ marginTop: 4 }}>
            The API for 
            {" "}
            {this.props.resourceName || store.api.kind}
            {" "}
            is not available on this cluster. It may not be installed or was removed in this Kubernetes version.
          </p>
        </div>
      );
    }

    return "Failed to load items";
  }

  render() {
    const {
      className,
      customizeHeader,
      store,
      items,
      dependentStores,
      toggleKubeDetailsPane: toggleDetails,
      onDetails,
      renderTableContents,
      renderTableHeader,
      columns,
      generalColumns,
      sortingCallbacks = {},
      ...layoutProps
    } = this.props;
    const resourceName = this.props.resourceName || ResourceNames[ResourceKindMap[store.api.kind]] || store.api.kind;
    const targetColumns = [
      ...(columns ?? []),
      ...generalColumns.filter(matchesApiFor(store.api)),
    ];

    void items;
    void dependentStores;

    targetColumns.forEach((col) => {
      if (col.sortingCallBack) {
        sortingCallbacks[col.id] = col.sortingCallBack;
      }
    });

    const headers = sortBy([
      ...(renderTableHeader || []).map((header, index) => ({ priority: (20 - index), header })),
      ...targetColumns,
    ], (v) => -v.priority).map((col) => col.header);

    const clusterName = this.props.hostedCluster?.name.get() || "cluster";
    const rawFilteredItems = this.itemListRef ? this.itemListRef.items : (this.props.items || store.contextItems);
    const sortParams = this.props.tableId && this.props.tableModel ? this.props.tableModel.getSortParams(this.props.tableId) : {};
    const sortedFilteredItems = (sortParams?.sortBy && sortingCallbacks[sortParams.sortBy])
      ? getSorted(rawFilteredItems, sortingCallbacks[sortParams.sortBy], sortParams.orderBy || "asc")
      : rawFilteredItems;
    const selectedItems = store.pickOnlySelected(sortedFilteredItems);
    const exportColumns = resolveExportColumns(
      this.props.tableId,
      headers,
      targetColumns,
      this.props.isTableColumnHidden,
      sortingCallbacks,
      store.api.kind === "Secret",
    );

    return (
      <>
        <ItemListLayout<K, false>
          className={cssNames("KubeObjectListLayout", className)}
          store={store}
          getItems={() => this.props.items || store.contextItems}
          preloadStores={false} // loading handled in kubeWatchApi.subscribeStores()
          detailsItem={this.selectedItem}
          failedToLoadMessage={this.renderFailedToLoadMessage()}
          renderQuickFilters={this.renderQuickFilters}
          customizeHeader={[
            ({ filters, searchProps, info, ...headerPlaceHolders }) => ({
              filters: (
                <>
                  {filters}
                  {store.api.isNamespaced && <NamespaceSelectFilter id="kube-object-list-layout-namespace-select-input" />}
                  <button
                    type="button"
                    className="export-csv-button"
                    onClick={this.openCsvDialog}
                    data-testid="kube-list-export-csv-btn"
                    title="Export current table to CSV"
                  >
                    <Icon material="file_download" small />
                    <span>Export CSV</span>
                  </button>
                </>
              ),
              searchProps: {
                ...searchProps,
                placeholder: `Search ${resourceName}...`,
              },
              info: (
                <>
                  {info}
                  {this.renderLoadErrors()}
                </>
              ),
              ...headerPlaceHolders,
            }),
            ...[customizeHeader].filter(isDefined).flat(),
          ]}
          renderItemMenu={item => <KubeObjectMenu object={item} />}
          onDetails={onDetails ?? ((item) => toggleDetails(item.selfLink))}
          sortingCallbacks={sortingCallbacks}
          renderTableHeader={headers}
          renderTableContents={(item) => (
            sortBy(
              [
                ...(renderTableContents(item).map((content, index) => ({ priority: (20 - index), content }))),
                ...targetColumns.map((col) => ({ priority: col.priority, content: col.content(item) })),
              ],
              (item) => -item.priority,
            )
              .map((value) => value.content)
          )}
          spinnerTestId="kube-object-list-layout-spinner"
          {...layoutProps}
        />
        <CsvExportDialog
          isOpen={this.isCsvDialogOpen}
          close={this.closeCsvDialog}
          clusterName={clusterName}
          resourceKind={resourceName}
          filteredItems={sortedFilteredItems}
          selectedItems={selectedItems}
          columns={exportColumns}
          isSecret={store.api.kind === "Secret"}
        />
      </>
    );
  }
}

export const KubeObjectListLayout = withInjectables<
  Dependencies,
  KubeObjectListLayoutProps<KubeObject, KubeApi<KubeObject, KubeJsonApiDataFor<KubeObject>>, KubeJsonApiDataFor<KubeObject>>
>(NonInjectedKubeObjectListLayout, {
  getProps: (di, props) => ({
    ...props,
    clusterFrameContext: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
    subscribeToStores: di.inject(subscribeStoresInjectable),
    kubeSelectedUrlParam: di.inject(kubeSelectedUrlParamInjectable),
    toggleKubeDetailsPane: di.inject(toggleKubeDetailsPaneInjectable),
    generalColumns: di.injectMany(kubeObjectListLayoutColumnInjectionToken),
    tableModel: di.inject(tableModelInjectable),
    isTableColumnHidden: di.inject(isTableColumnHiddenInjectable),
    hostedCluster: di.inject(hostedClusterInjectable),
  }),
}) as <
  K extends KubeObject,
  A extends KubeApi<K, D>,
  D extends KubeJsonApiDataFor<K> = KubeJsonApiDataFor<K>,
>(props: KubeObjectListLayoutProps<K, A, D>) => React.ReactElement;
