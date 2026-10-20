/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./gateways.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, makeObservable } from "mobx";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";
import { Badge } from "../badge";
import { Tabs, Tab } from "../tabs";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { GatewayStore } from "./gateway-store";
import type { HTTPRouteStore } from "./http-route-store";
import gatewayStoreInjectable from "./gateway-store.injectable";
import httpRouteStoreInjectable from "./http-route-store.injectable";

export enum GatewayTab {
  GATEWAYS = "gateways",
  HTTP_ROUTES = "http-routes",
}

enum GatewayColumnId {
  name = "name",
  namespace = "namespace",
  className = "className",
  listeners = "listeners",
  addresses = "addresses",
  status = "status",
  age = "age",
}

enum HTTPRouteColumnId {
  name = "name",
  namespace = "namespace",
  hostnames = "hostnames",
  gateways = "gateways",
  rules = "rules",
  backends = "backends",
  age = "age",
}

interface Dependencies {
  gatewayStore: GatewayStore;
  httpRouteStore: HTTPRouteStore;
}

@observer
class NonInjectedGateways extends React.Component<Dependencies> {
  @observable activeTab: GatewayTab = GatewayTab.GATEWAYS;

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: GatewayTab) => {
    this.activeTab = tab;
  };

  private renderGateways() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_gateways"
        className="Gateways"
        store={this.props.gatewayStore}
        sortingCallbacks={{
          [GatewayColumnId.name]: gw => gw.getName(),
          [GatewayColumnId.namespace]: gw => gw.getNs(),
          [GatewayColumnId.className]: gw => gw.getClassName(),
          [GatewayColumnId.status]: gw => gw.getStatusSummary(),
          [GatewayColumnId.age]: gw => -gw.getCreationTimestamp(),
        }}
        searchFilters={[
          gw => gw.getSearchFields(),
          gw => gw.getClassName(),
          gw => gw.getAddresses(),
          gw => gw.getStatusSummary(),
        ]}
        renderHeaderTitle="Gateways"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: GatewayColumnId.name, id: GatewayColumnId.name },
          { className: "warning", showWithColumn: GatewayColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: GatewayColumnId.namespace, id: GatewayColumnId.namespace },
          { title: "Class", className: "className", sortBy: GatewayColumnId.className, id: GatewayColumnId.className },
          { title: "Listeners", className: "listeners", id: GatewayColumnId.listeners },
          { title: "Addresses", className: "addresses", id: GatewayColumnId.addresses },
          { title: "Status", className: "status", sortBy: GatewayColumnId.status, id: GatewayColumnId.status },
          { title: "Age", className: "age", sortBy: GatewayColumnId.age, id: GatewayColumnId.age },
        ]}
        renderTableContents={gw => [
          gw.getName(),
          <KubeObjectStatusIcon key="icon" object={gw} />,
          <NamespaceSelectBadge
            key="namespace"
            namespace={gw.getNs()}
          />,
          gw.getClassName() || "-",
          gw.getListenersSummary(),
          gw.getAddresses().join(", ") || "-",
          <Badge
            key="status"
            label={gw.getStatusSummary()}
            className={`status-badge status-${gw.getStatusSummary().toLowerCase()}`}
          />,
          <KubeObjectAge key="age" object={gw} />,
        ]}
      />
    );
  }

  private renderHTTPRoutes() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_http_routes"
        className="HTTPRoutes"
        store={this.props.httpRouteStore}
        sortingCallbacks={{
          [HTTPRouteColumnId.name]: route => route.getName(),
          [HTTPRouteColumnId.namespace]: route => route.getNs(),
          [HTTPRouteColumnId.age]: route => -route.getCreationTimestamp(),
        }}
        searchFilters={[
          route => route.getSearchFields(),
          route => route.getHostnames(),
          route => route.getParentGateways(),
          route => route.getBackendServices(),
        ]}
        renderHeaderTitle="HTTP Routes"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: HTTPRouteColumnId.name, id: HTTPRouteColumnId.name },
          { className: "warning", showWithColumn: HTTPRouteColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: HTTPRouteColumnId.namespace, id: HTTPRouteColumnId.namespace },
          { title: "Hostnames", className: "hostnames", id: HTTPRouteColumnId.hostnames },
          { title: "Gateways", className: "gateways", id: HTTPRouteColumnId.gateways },
          { title: "Rules / Paths", className: "rules", id: HTTPRouteColumnId.rules },
          { title: "Backends", className: "backends", id: HTTPRouteColumnId.backends },
          { title: "Age", className: "age", sortBy: HTTPRouteColumnId.age, id: HTTPRouteColumnId.age },
        ]}
        renderTableContents={route => [
          route.getName(),
          <KubeObjectStatusIcon key="icon" object={route} />,
          <NamespaceSelectBadge
            key="namespace"
            namespace={route.getNs()}
          />,
          route.getHostnames().join(", ") || "*",
          route.getParentGateways().map(gw => <Badge key={gw} label={gw} />),
          route.getRoutesSummary(),
          route.getBackendServices().join(", ") || "-",
          <KubeObjectAge key="age" object={route} />,
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="GatewaysView" data-testid="gateways-view">
          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={GatewayTab.GATEWAYS}
              label="Gateways"
              id="tab-gateways"
            />
            <Tab
              value={GatewayTab.HTTP_ROUTES}
              label="HTTP Routes"
              id="tab-http-routes"
            />
          </Tabs>

          {this.activeTab === GatewayTab.GATEWAYS && this.renderGateways()}
          {this.activeTab === GatewayTab.HTTP_ROUTES && this.renderHTTPRoutes()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const Gateways = withInjectables<Dependencies>(NonInjectedGateways, {
  getProps: (di) => ({
    gatewayStore: di.inject(gatewayStoreInjectable),
    httpRouteStore: di.inject(httpRouteStoreInjectable),
  }),
});
