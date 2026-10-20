/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./endpoint-slices.scss";

import React from "react";
import { observer } from "mobx-react";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { KubeObjectStatusIcon } from "../kube-object-status-icon";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { KubeObjectAge } from "../kube-object/age";
import type { EndpointSliceStore } from "./store";
import { withInjectables } from "@ogre-tools/injectable-react";
import endpointSliceStoreInjectable from "./store.injectable";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";
import { Badge } from "../badge";

enum columnId {
  name = "name",
  namespace = "namespace",
  service = "service",
  addressType = "addressType",
  ports = "ports",
  endpoints = "endpoints",
  age = "age",
}

interface Dependencies {
  endpointSliceStore: EndpointSliceStore;
}

@observer
class NonInjectedEndpointSlices extends React.Component<Dependencies> {
  render() {
    return (
      <SiblingsInTabLayout>
        <KubeObjectListLayout
          isConfigurable
          tableId="network_endpoint_slices"
          className="EndpointSlices"
          store={this.props.endpointSliceStore}
          sortingCallbacks={{
            [columnId.name]: slice => slice.getName(),
            [columnId.namespace]: slice => slice.getNs(),
            [columnId.service]: slice => slice.getServiceName(),
            [columnId.addressType]: slice => slice.getAddressType(),
            [columnId.age]: slice => -slice.getCreationTimestamp(),
          }}
          searchFilters={[
            slice => slice.getSearchFields(),
            slice => slice.getServiceName(),
            slice => slice.getAddressType(),
            slice => slice.getEndpoints().flatMap(ep => ep.addresses),
          ]}
          renderHeaderTitle="Endpoint Slices"
          renderTableHeader={[
            { title: "Name", className: "name", sortBy: columnId.name, id: columnId.name },
            { className: "warning", showWithColumn: columnId.name },
            { title: "Namespace", className: "namespace", sortBy: columnId.namespace, id: columnId.namespace },
            { title: "Service", className: "service", sortBy: columnId.service, id: columnId.service },
            { title: "Type", className: "addressType", sortBy: columnId.addressType, id: columnId.addressType },
            { title: "Ports", className: "ports", id: columnId.ports },
            { title: "Endpoints", className: "endpoints", id: columnId.endpoints },
            { title: "Age", className: "age", sortBy: columnId.age, id: columnId.age },
          ]}
          renderTableContents={slice => [
            slice.getName(),
            <KubeObjectStatusIcon key="icon" object={slice} />,
            <NamespaceSelectBadge
              key="namespace"
              namespace={slice.getNs()}
            />,
            slice.getServiceName() ? (
              <Badge key="service" label={slice.getServiceName()} />
            ) : "-",
            slice.getAddressType(),
            slice.getPortsSummary(),
            slice.getEndpointsSummary(),
            <KubeObjectAge key="age" object={slice} />,
          ]}
        />
      </SiblingsInTabLayout>
    );
  }
}

export const EndpointSlices = withInjectables<Dependencies>(NonInjectedEndpointSlices, {
  getProps: (di) => ({
    endpointSliceStore: di.inject(endpointSliceStoreInjectable),
  }),
});
