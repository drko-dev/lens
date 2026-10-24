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
import type { GatewayClassStore } from "./gateway-class-store";
import type { HTTPRouteStore } from "./http-route-store";
import type { GRPCRouteStore } from "./grpc-route-store";
import type { TLSRouteStore } from "./tls-route-store";
import type { ReferenceGrantStore } from "./reference-grant-store";

import gatewayStoreInjectable from "./gateway-store.injectable";
import gatewayClassStoreInjectable from "./gateway-class-store.injectable";
import httpRouteStoreInjectable from "./http-route-store.injectable";
import grpcRouteStoreInjectable from "./grpc-route-store.injectable";
import tlsRouteStoreInjectable from "./tls-route-store.injectable";
import referenceGrantStoreInjectable from "./reference-grant-store.injectable";

export enum GatewayTab {
  GATEWAYS = "gateways",
  GATEWAY_CLASSES = "gateway-classes",
  HTTP_ROUTES = "http-routes",
  GRPC_ROUTES = "grpc-routes",
  TLS_ROUTES = "tls-routes",
  REFERENCE_GRANTS = "reference-grants",
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

enum GatewayClassColumnId {
  name = "name",
  controller = "controller",
  description = "description",
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

enum GRPCRouteColumnId {
  name = "name",
  namespace = "namespace",
  hostnames = "hostnames",
  gateways = "gateways",
  services = "services",
  backends = "backends",
  age = "age",
}

enum TLSRouteColumnId {
  name = "name",
  namespace = "namespace",
  hostnames = "hostnames",
  gateways = "gateways",
  backends = "backends",
  age = "age",
}

enum ReferenceGrantColumnId {
  name = "name",
  namespace = "namespace",
  from = "from",
  to = "to",
  age = "age",
}

interface Dependencies {
  gatewayStore: GatewayStore;
  gatewayClassStore: GatewayClassStore;
  httpRouteStore: HTTPRouteStore;
  grpcRouteStore: GRPCRouteStore;
  tlsRouteStore: TLSRouteStore;
  referenceGrantStore: ReferenceGrantStore;
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

  private renderGatewayClasses() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_gateway_classes"
        className="GatewayClasses"
        store={this.props.gatewayClassStore}
        sortingCallbacks={{
          [GatewayClassColumnId.name]: gc => gc.getName(),
          [GatewayClassColumnId.controller]: gc => gc.getControllerName(),
          [GatewayClassColumnId.age]: gc => -gc.getCreationTimestamp(),
        }}
        searchFilters={[
          gc => gc.getSearchFields(),
          gc => gc.getControllerName(),
          gc => gc.getDescription(),
        ]}
        renderHeaderTitle="Gateway Classes"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: GatewayClassColumnId.name, id: GatewayClassColumnId.name },
          { className: "warning", showWithColumn: GatewayClassColumnId.name },
          { title: "Controller", className: "controller", sortBy: GatewayClassColumnId.controller, id: GatewayClassColumnId.controller },
          { title: "Description", className: "description", id: GatewayClassColumnId.description },
          { title: "Status", className: "status", id: GatewayClassColumnId.status },
          { title: "Age", className: "age", sortBy: GatewayClassColumnId.age, id: GatewayClassColumnId.age },
        ]}
        renderTableContents={gc => [
          gc.getName(),
          <KubeObjectStatusIcon key="icon" object={gc} />,
          gc.getControllerName() || "-",
          gc.getDescription() || "-",
          <Badge
            key="status"
            label={gc.isAccepted() ? "Accepted" : "Pending"}
            className={`status-badge status-${gc.isAccepted() ? "accepted" : "pending"}`}
          />,
          <KubeObjectAge key="age" object={gc} />,
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

  private renderGRPCRoutes() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_grpc_routes"
        className="GRPCRoutes"
        store={this.props.grpcRouteStore}
        sortingCallbacks={{
          [GRPCRouteColumnId.name]: route => route.getName(),
          [GRPCRouteColumnId.namespace]: route => route.getNs(),
          [GRPCRouteColumnId.age]: route => -route.getCreationTimestamp(),
        }}
        searchFilters={[
          route => route.getSearchFields(),
          route => route.getHostnames(),
          route => route.getParentGateways(),
          route => route.getBackendServices(),
        ]}
        renderHeaderTitle="gRPC Routes"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: GRPCRouteColumnId.name, id: GRPCRouteColumnId.name },
          { className: "warning", showWithColumn: GRPCRouteColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: GRPCRouteColumnId.namespace, id: GRPCRouteColumnId.namespace },
          { title: "Hostnames", className: "hostnames", id: GRPCRouteColumnId.hostnames },
          { title: "Gateways", className: "gateways", id: GRPCRouteColumnId.gateways },
          { title: "Services / Methods", className: "services", id: GRPCRouteColumnId.services },
          { title: "Backends", className: "backends", id: GRPCRouteColumnId.backends },
          { title: "Age", className: "age", sortBy: GRPCRouteColumnId.age, id: GRPCRouteColumnId.age },
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
          route.getServicesSummary(),
          route.getBackendServices().join(", ") || "-",
          <KubeObjectAge key="age" object={route} />,
        ]}
      />
    );
  }

  private renderTLSRoutes() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_tls_routes"
        className="TLSRoutes"
        store={this.props.tlsRouteStore}
        sortingCallbacks={{
          [TLSRouteColumnId.name]: route => route.getName(),
          [TLSRouteColumnId.namespace]: route => route.getNs(),
          [TLSRouteColumnId.age]: route => -route.getCreationTimestamp(),
        }}
        searchFilters={[
          route => route.getSearchFields(),
          route => route.getHostnames(),
          route => route.getParentGateways(),
          route => route.getBackendServices(),
        ]}
        renderHeaderTitle="TLS Routes"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: TLSRouteColumnId.name, id: TLSRouteColumnId.name },
          { className: "warning", showWithColumn: TLSRouteColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: TLSRouteColumnId.namespace, id: TLSRouteColumnId.namespace },
          { title: "Hostnames", className: "hostnames", id: TLSRouteColumnId.hostnames },
          { title: "Gateways", className: "gateways", id: TLSRouteColumnId.gateways },
          { title: "Backends", className: "backends", id: TLSRouteColumnId.backends },
          { title: "Age", className: "age", sortBy: TLSRouteColumnId.age, id: TLSRouteColumnId.age },
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
          route.getBackendServices().join(", ") || "-",
          <KubeObjectAge key="age" object={route} />,
        ]}
      />
    );
  }

  private renderReferenceGrants() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="network_reference_grants"
        className="ReferenceGrants"
        store={this.props.referenceGrantStore}
        sortingCallbacks={{
          [ReferenceGrantColumnId.name]: rg => rg.getName(),
          [ReferenceGrantColumnId.namespace]: rg => rg.getNs(),
          [ReferenceGrantColumnId.age]: rg => -rg.getCreationTimestamp(),
        }}
        searchFilters={[
          rg => rg.getSearchFields(),
          rg => rg.getFromSummary(),
          rg => rg.getToSummary(),
        ]}
        renderHeaderTitle="Reference Grants"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: ReferenceGrantColumnId.name, id: ReferenceGrantColumnId.name },
          { className: "warning", showWithColumn: ReferenceGrantColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: ReferenceGrantColumnId.namespace, id: ReferenceGrantColumnId.namespace },
          { title: "From (Allowed References)", className: "from", id: ReferenceGrantColumnId.from },
          { title: "To (Target Resources)", className: "to", id: ReferenceGrantColumnId.to },
          { title: "Age", className: "age", sortBy: ReferenceGrantColumnId.age, id: ReferenceGrantColumnId.age },
        ]}
        renderTableContents={rg => [
          rg.getName(),
          <KubeObjectStatusIcon key="icon" object={rg} />,
          <NamespaceSelectBadge
            key="namespace"
            namespace={rg.getNs()}
          />,
          rg.getFromSummary(),
          rg.getToSummary(),
          <KubeObjectAge key="age" object={rg} />,
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
              value={GatewayTab.GATEWAY_CLASSES}
              label="Gateway Classes"
              id="tab-gateway-classes"
            />
            <Tab
              value={GatewayTab.HTTP_ROUTES}
              label="HTTP Routes"
              id="tab-http-routes"
            />
            <Tab
              value={GatewayTab.GRPC_ROUTES}
              label="gRPC Routes"
              id="tab-grpc-routes"
            />
            <Tab
              value={GatewayTab.TLS_ROUTES}
              label="TLS Routes"
              id="tab-tls-routes"
            />
            <Tab
              value={GatewayTab.REFERENCE_GRANTS}
              label="Reference Grants"
              id="tab-reference-grants"
            />
          </Tabs>

          {this.activeTab === GatewayTab.GATEWAYS && this.renderGateways()}
          {this.activeTab === GatewayTab.GATEWAY_CLASSES && this.renderGatewayClasses()}
          {this.activeTab === GatewayTab.HTTP_ROUTES && this.renderHTTPRoutes()}
          {this.activeTab === GatewayTab.GRPC_ROUTES && this.renderGRPCRoutes()}
          {this.activeTab === GatewayTab.TLS_ROUTES && this.renderTLSRoutes()}
          {this.activeTab === GatewayTab.REFERENCE_GRANTS && this.renderReferenceGrants()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const Gateways = withInjectables<Dependencies>(NonInjectedGateways, {
  getProps: (di) => ({
    gatewayStore: di.inject(gatewayStoreInjectable),
    gatewayClassStore: di.inject(gatewayClassStoreInjectable),
    httpRouteStore: di.inject(httpRouteStoreInjectable),
    grpcRouteStore: di.inject(grpcRouteStoreInjectable),
    tlsRouteStore: di.inject(tlsRouteStoreInjectable),
    referenceGrantStore: di.inject(referenceGrantStoreInjectable),
  }),
});
