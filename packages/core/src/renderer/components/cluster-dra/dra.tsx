/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./dra.scss";

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
import type { DeviceClassStore } from "./device-class-store";
import type { ResourceClaimStore } from "./resource-claim-store";
import deviceClassStoreInjectable from "./device-class-store.injectable";
import resourceClaimStoreInjectable from "./resource-claim-store.injectable";

export enum DRATab {
  DEVICE_CLASSES = "device-classes",
  RESOURCE_CLAIMS = "resource-claims",
}

enum DeviceClassColumnId {
  name = "name",
  selectors = "selectors",
  age = "age",
}

enum ResourceClaimColumnId {
  name = "name",
  namespace = "namespace",
  deviceClass = "deviceClass",
  allocation = "allocation",
  reservedFor = "reservedFor",
  age = "age",
}

interface Dependencies {
  deviceClassStore: DeviceClassStore;
  resourceClaimStore: ResourceClaimStore;
}

@observer
class NonInjectedDynamicResourceAllocation extends React.Component<Dependencies> {
  @observable activeTab: DRATab = DRATab.DEVICE_CLASSES;

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: DRATab) => {
    this.activeTab = tab;
  };

  private renderDeviceClasses() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="cluster_dra_device_classes"
        className="DeviceClasses"
        store={this.props.deviceClassStore}
        sortingCallbacks={{
          [DeviceClassColumnId.name]: dc => dc.getName(),
          [DeviceClassColumnId.age]: dc => -dc.getCreationTimestamp(),
        }}
        searchFilters={[
          dc => dc.getSearchFields(),
          dc => dc.getSelectors(),
        ]}
        renderHeaderTitle="Device Classes"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: DeviceClassColumnId.name, id: DeviceClassColumnId.name },
          { className: "warning", showWithColumn: DeviceClassColumnId.name },
          { title: "Selectors (CEL)", className: "selectors", id: DeviceClassColumnId.selectors },
          { title: "Age", className: "age", sortBy: DeviceClassColumnId.age, id: DeviceClassColumnId.age },
        ]}
        renderTableContents={dc => [
          dc.getName(),
          <KubeObjectStatusIcon key="icon" object={dc} />,
          <span key="selectors" className="text-secondary" style={{ fontFamily: "var(--font-monospace)" }}>
            {dc.getSelectorsSummary()}
          </span>,
          <KubeObjectAge key="age" object={dc} />,
        ]}
      />
    );
  }

  private renderResourceClaims() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="cluster_dra_resource_claims"
        className="ResourceClaims"
        store={this.props.resourceClaimStore}
        sortingCallbacks={{
          [ResourceClaimColumnId.name]: rc => rc.getName(),
          [ResourceClaimColumnId.namespace]: rc => rc.getNs(),
          [ResourceClaimColumnId.age]: rc => -rc.getCreationTimestamp(),
        }}
        searchFilters={[
          rc => rc.getSearchFields(),
          rc => rc.getRequestedDeviceClasses(),
          rc => rc.getAllocationSummary(),
        ]}
        renderHeaderTitle="Resource Claims"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: ResourceClaimColumnId.name, id: ResourceClaimColumnId.name },
          { className: "warning", showWithColumn: ResourceClaimColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: ResourceClaimColumnId.namespace, id: ResourceClaimColumnId.namespace },
          { title: "Requested Class", className: "deviceClass", id: ResourceClaimColumnId.deviceClass },
          { title: "Allocation", className: "allocation", id: ResourceClaimColumnId.allocation },
          { title: "Reserved For", className: "reservedFor", id: ResourceClaimColumnId.reservedFor },
          { title: "Age", className: "age", sortBy: ResourceClaimColumnId.age, id: ResourceClaimColumnId.age },
        ]}
        renderTableContents={rc => [
          rc.getName(),
          <KubeObjectStatusIcon key="icon" object={rc} />,
          <NamespaceSelectBadge key="namespace" namespace={rc.getNs()} />,
          rc.getRequestedDeviceClasses().map(cls => <Badge key={cls} label={cls} />),
          <Badge
            key="allocation"
            label={rc.getAllocationSummary()}
            className={rc.isAllocated() ? "badge-success" : "badge-warning"}
          />,
          rc.getReservedForSummary(),
          <KubeObjectAge key="age" object={rc} />,
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="DynamicResourceAllocationView" data-testid="dra-view">
          <div className="readonly-notice" data-testid="dra-readonly-notice">
            <strong>Dynamic Resource Allocation (DRA):</strong> Manages non-standard devices (GPUs, FPGAs, DPUs) natively via the <code>resource.k8s.io</code> API. Read-only viewer.
          </div>

          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={DRATab.DEVICE_CLASSES}
              label="Device Classes"
              id="tab-device-classes"
            />
            <Tab
              value={DRATab.RESOURCE_CLAIMS}
              label="Resource Claims"
              id="tab-resource-claims"
            />
          </Tabs>

          {this.activeTab === DRATab.DEVICE_CLASSES && this.renderDeviceClasses()}
          {this.activeTab === DRATab.RESOURCE_CLAIMS && this.renderResourceClaims()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const DynamicResourceAllocation = withInjectables<Dependencies>(NonInjectedDynamicResourceAllocation, {
  getProps: (di) => ({
    deviceClassStore: di.inject(deviceClassStoreInjectable),
    resourceClaimStore: di.inject(resourceClaimStoreInjectable),
  }),
});
