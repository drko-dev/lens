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
import type { ResourceClaimTemplateStore } from "./resource-claim-template-store";
import type { ResourceSliceStore } from "./resource-slice-store";

import deviceClassStoreInjectable from "./device-class-store.injectable";
import resourceClaimStoreInjectable from "./resource-claim-store.injectable";
import resourceClaimTemplateStoreInjectable from "./resource-claim-template-store.injectable";
import resourceSliceStoreInjectable from "./resource-slice-store.injectable";

export enum DRATab {
  DEVICE_CLASSES = "device-classes",
  RESOURCE_CLAIMS = "resource-claims",
  CLAIM_TEMPLATES = "claim-templates",
  RESOURCE_SLICES = "resource-slices",
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

enum ResourceClaimTemplateColumnId {
  name = "name",
  namespace = "namespace",
  deviceClass = "deviceClass",
  age = "age",
}

enum ResourceSliceColumnId {
  name = "name",
  nodeName = "nodeName",
  driver = "driver",
  pool = "pool",
  devices = "devices",
  age = "age",
}

interface Dependencies {
  deviceClassStore: DeviceClassStore;
  resourceClaimStore: ResourceClaimStore;
  resourceClaimTemplateStore: ResourceClaimTemplateStore;
  resourceSliceStore: ResourceSliceStore;
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
          <span
            key="selectors"
            className="text-secondary"
            style={{ fontFamily: "var(--font-monospace)" }}>
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

  private renderClaimTemplates() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="cluster_dra_resource_claim_templates"
        className="ResourceClaimTemplates"
        store={this.props.resourceClaimTemplateStore}
        sortingCallbacks={{
          [ResourceClaimTemplateColumnId.name]: rct => rct.getName(),
          [ResourceClaimTemplateColumnId.namespace]: rct => rct.getNs(),
          [ResourceClaimTemplateColumnId.age]: rct => -rct.getCreationTimestamp(),
        }}
        searchFilters={[
          rct => rct.getSearchFields(),
          rct => rct.getRequestedDeviceClasses(),
        ]}
        renderHeaderTitle="Resource Claim Templates"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: ResourceClaimTemplateColumnId.name, id: ResourceClaimTemplateColumnId.name },
          { className: "warning", showWithColumn: ResourceClaimTemplateColumnId.name },
          { title: "Namespace", className: "namespace", sortBy: ResourceClaimTemplateColumnId.namespace, id: ResourceClaimTemplateColumnId.namespace },
          { title: "Requested Class", className: "deviceClass", id: ResourceClaimTemplateColumnId.deviceClass },
          { title: "Age", className: "age", sortBy: ResourceClaimTemplateColumnId.age, id: ResourceClaimTemplateColumnId.age },
        ]}
        renderTableContents={rct => [
          rct.getName(),
          <KubeObjectStatusIcon key="icon" object={rct} />,
          <NamespaceSelectBadge key="namespace" namespace={rct.getNs()} />,
          rct.getRequestedDeviceClasses().map(cls => <Badge key={cls} label={cls} />),
          <KubeObjectAge key="age" object={rct} />,
        ]}
      />
    );
  }

  private renderResourceSlices() {
    return (
      <KubeObjectListLayout
        isConfigurable
        tableId="cluster_dra_resource_slices"
        className="ResourceSlices"
        store={this.props.resourceSliceStore}
        sortingCallbacks={{
          [ResourceSliceColumnId.name]: rs => rs.getName(),
          [ResourceSliceColumnId.nodeName]: rs => rs.getNodeName(),
          [ResourceSliceColumnId.driver]: rs => rs.getDriverName(),
          [ResourceSliceColumnId.age]: rs => -rs.getCreationTimestamp(),
        }}
        searchFilters={[
          rs => rs.getSearchFields(),
          rs => rs.getNodeName(),
          rs => rs.getDriverName(),
          rs => rs.getPoolName(),
        ]}
        renderHeaderTitle="Resource Slices"
        renderTableHeader={[
          { title: "Name", className: "name", sortBy: ResourceSliceColumnId.name, id: ResourceSliceColumnId.name },
          { className: "warning", showWithColumn: ResourceSliceColumnId.name },
          { title: "Node", className: "nodeName", sortBy: ResourceSliceColumnId.nodeName, id: ResourceSliceColumnId.nodeName },
          { title: "Driver", className: "driver", sortBy: ResourceSliceColumnId.driver, id: ResourceSliceColumnId.driver },
          { title: "Pool", className: "pool", id: ResourceSliceColumnId.pool },
          { title: "Devices", className: "devices", id: ResourceSliceColumnId.devices },
          { title: "Age", className: "age", sortBy: ResourceSliceColumnId.age, id: ResourceSliceColumnId.age },
        ]}
        renderTableContents={rs => [
          rs.getName(),
          <KubeObjectStatusIcon key="icon" object={rs} />,
          rs.getNodeName(),
          <Badge key="driver" label={rs.getDriverName()} />,
          rs.getPoolName() || "-",
          <span key="devices" className="text-secondary">
            {rs.getDevicesCount()}
            {" "}
            device(s)
          </span>,
          <KubeObjectAge key="age" object={rs} />,
        ]}
      />
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="DynamicResourceAllocationView" data-testid="dra-view">
          <div className="readonly-notice" data-testid="dra-readonly-notice">
            <strong>Dynamic Resource Allocation (DRA):</strong>
            {" "}
            Manages non-standard devices (GPUs, FPGAs, DPUs) natively via the
            <code>resource.k8s.io</code>
            {" "}
            API.
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
            <Tab
              value={DRATab.CLAIM_TEMPLATES}
              label="Claim Templates"
              id="tab-claim-templates"
            />
            <Tab
              value={DRATab.RESOURCE_SLICES}
              label="Resource Slices"
              id="tab-resource-slices"
            />
          </Tabs>

          {this.activeTab === DRATab.DEVICE_CLASSES && this.renderDeviceClasses()}
          {this.activeTab === DRATab.RESOURCE_CLAIMS && this.renderResourceClaims()}
          {this.activeTab === DRATab.CLAIM_TEMPLATES && this.renderClaimTemplates()}
          {this.activeTab === DRATab.RESOURCE_SLICES && this.renderResourceSlices()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const DynamicResourceAllocation = withInjectables<Dependencies>(NonInjectedDynamicResourceAllocation, {
  getProps: (di) => ({
    deviceClassStore: di.inject(deviceClassStoreInjectable),
    resourceClaimStore: di.inject(resourceClaimStoreInjectable),
    resourceClaimTemplateStore: di.inject(resourceClaimTemplateStoreInjectable),
    resourceSliceStore: di.inject(resourceSliceStoreInjectable),
  }),
});
