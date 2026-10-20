/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./costs.scss";

import React from "react";
import { observer } from "mobx-react";
import { observable, makeObservable, computed } from "mobx";
import { ItemListLayout } from "../item-object-list";
import type { ItemListStore } from "../item-object-list/list-layout";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { NamespaceSelectBadge } from "../namespaces/namespace-select-badge";
import { Badge } from "../badge";
import { Tabs, Tab } from "../tabs";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { DeploymentStore } from "../workloads-deployments/store";
import type { PodStore } from "../workloads-pods/store";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import podStoreInjectable from "../workloads-pods/store.injectable";
import type { ItemObject } from "@openlens/list-layout";
import {
  computeWorkloadCostAllocations,
  DEFAULT_COST_RATES,
  COST_ASSUMPTIONS_DECLARATION,
  NamespaceCostAllocation,
  WorkloadCostAllocation,
} from "../../../common/k8s-api/endpoints/cost-observability";

export enum CostsTab {
  NAMESPACE_COSTS = "namespace-costs",
  WORKLOAD_COSTS = "workload-costs",
  ASSUMPTIONS = "assumptions",
}

export class NamespaceCostItem implements ItemObject {
  constructor(public readonly alloc: NamespaceCostAllocation) {}

  getId(): string {
    return this.alloc.id;
  }

  getName(): string {
    return this.alloc.namespace;
  }

  getWorkloadCount(): number {
    return this.alloc.workloadCount;
  }

  getCpuCores(): number {
    return this.alloc.cpuCoresRequested;
  }

  getRamGb(): number {
    return this.alloc.ramGbRequested;
  }

  getDailyCost(): string {
    return `$${this.alloc.dailyCost.toFixed(2)}`;
  }

  getMonthlyCost(): string {
    return `$${this.alloc.monthlyCost.toFixed(2)}`;
  }

  getPercentage(): string {
    return `${this.alloc.percentageOfCluster.toFixed(1)}%`;
  }

  getSearchFields(): string[] {
    return [
      this.alloc.namespace,
      this.getDailyCost(),
      this.getMonthlyCost(),
      this.getPercentage(),
    ];
  }
}

export class WorkloadCostItem implements ItemObject {
  constructor(public readonly alloc: WorkloadCostAllocation) {}

  getId(): string {
    return this.alloc.id;
  }

  getName(): string {
    return this.alloc.name;
  }

  getKind(): string {
    return this.alloc.kind;
  }

  getNs(): string {
    return this.alloc.namespace;
  }

  getCpuCores(): number {
    return this.alloc.cpuCoresRequested;
  }

  getRamGb(): number {
    return this.alloc.ramGbRequested;
  }

  getDailyCost(): string {
    return `$${this.alloc.dailyCost.toFixed(2)}`;
  }

  getMonthlyCost(): string {
    return `$${this.alloc.monthlyCost.toFixed(2)}`;
  }

  getSearchFields(): string[] {
    return [
      this.alloc.name,
      this.alloc.kind,
      this.alloc.namespace,
      this.getDailyCost(),
      this.getMonthlyCost(),
    ];
  }
}

enum NsColumnId {
  namespace = "namespace",
  workloads = "workloads",
  cpu = "cpu",
  ram = "ram",
  daily = "daily",
  monthly = "monthly",
  share = "share",
}

enum WorkloadColumnId {
  name = "name",
  kind = "kind",
  namespace = "namespace",
  cpu = "cpu",
  ram = "ram",
  daily = "daily",
  monthly = "monthly",
}

interface Dependencies {
  deploymentStore: DeploymentStore;
  podStore: PodStore;
}

function createReadOnlyListStore<I extends ItemObject>(getItems: () => I[]): ItemListStore<I, false> {
  return {
    isLoaded: true,
    failedLoading: false,
    getTotalCount: () => getItems().length,
    isSelected: () => false,
    toggleSelection: () => {},
    isSelectedAll: () => false,
    toggleSelectionAll: () => {},
    pickOnlySelected: () => [],
    selectedItems: [],
    removeItems: async () => {},
  };
}

@observer
class NonInjectedCosts extends React.Component<Dependencies> {
  @observable activeTab: CostsTab = CostsTab.NAMESPACE_COSTS;

  private namespaceStore = createReadOnlyListStore(() => this.namespaceCostItems);
  private workloadStore = createReadOnlyListStore(() => this.workloadCostItems);

  constructor(props: Dependencies) {
    super(props);
    makeObservable(this);
  }

  private onTabChange = (tab: CostsTab) => {
    this.activeTab = tab;
  };

  @computed get costCalculations() {
    const rawDeployments = (this.props.deploymentStore.items || []).map(d => ({
      kind: "Deployment",
      name: d.getName(),
      namespace: d.getNs(),
      containers: d.spec?.template?.spec?.containers || [],
    }));

    const rawPods = (this.props.podStore.items || []).map(p => ({
      kind: "Pod",
      name: p.getName(),
      namespace: p.getNs(),
      containers: p.spec?.containers || [],
    }));

    return computeWorkloadCostAllocations([...rawDeployments, ...rawPods]);
  }

  @computed get namespaceCostItems(): NamespaceCostItem[] {
    return this.costCalculations.namespaceAllocations.map(a => new NamespaceCostItem(a));
  }

  @computed get workloadCostItems(): WorkloadCostItem[] {
    return this.costCalculations.workloadAllocations.map(a => new WorkloadCostItem(a));
  }

  private renderNamespaceCosts() {
    return (
      <ItemListLayout<NamespaceCostItem, false>
        isConfigurable
        preloadStores={false}
        tableId="namespace_costs_table"
        className="NamespaceCosts"
        store={this.namespaceStore}
        getItems={() => this.namespaceCostItems}
        sortingCallbacks={{
          [NsColumnId.namespace]: item => item.getName(),
          [NsColumnId.workloads]: item => item.getWorkloadCount(),
          [NsColumnId.cpu]: item => item.getCpuCores(),
          [NsColumnId.ram]: item => item.getRamGb(),
          [NsColumnId.daily]: item => item.alloc.dailyCost,
          [NsColumnId.monthly]: item => item.alloc.monthlyCost,
          [NsColumnId.share]: item => item.alloc.percentageOfCluster,
        }}
        searchFilters={[
          item => item.getSearchFields(),
        ]}
        renderHeaderTitle="Namespace Cost Allocations"
        renderTableHeader={[
          { title: "Namespace", className: "namespace", sortBy: NsColumnId.namespace, id: NsColumnId.namespace },
          { title: "Workloads Count", className: "workloads", sortBy: NsColumnId.workloads, id: NsColumnId.workloads },
          { title: "CPU Requested", className: "cpu", sortBy: NsColumnId.cpu, id: NsColumnId.cpu },
          { title: "RAM Requested", className: "ram", sortBy: NsColumnId.ram, id: NsColumnId.ram },
          { title: "Est. Cost / Day", className: "daily", sortBy: NsColumnId.daily, id: NsColumnId.daily },
          { title: "Est. Cost / Month", className: "monthly", sortBy: NsColumnId.monthly, id: NsColumnId.monthly },
          { title: "Cluster Share", className: "share", sortBy: NsColumnId.share, id: NsColumnId.share },
        ]}
        renderTableContents={item => [
          <NamespaceSelectBadge key="ns" namespace={item.getName()} />,
          String(item.getWorkloadCount()),
          `${item.getCpuCores()} cores`,
          `${item.getRamGb()} GB`,
          <Badge key="daily" label={item.getDailyCost()} />,
          <Badge key="monthly" label={item.getMonthlyCost()} className="cost-badge" />,
          <Badge key="share" label={item.getPercentage()} className="cost-share-badge" />,
        ]}
      />
    );
  }

  private renderWorkloadCosts() {
    return (
      <ItemListLayout<WorkloadCostItem, false>
        isConfigurable
        preloadStores={false}
        tableId="workload_costs_table"
        className="WorkloadCosts"
        store={this.workloadStore}
        getItems={() => this.workloadCostItems}
        sortingCallbacks={{
          [WorkloadColumnId.name]: item => item.getName(),
          [WorkloadColumnId.kind]: item => item.getKind(),
          [WorkloadColumnId.namespace]: item => item.getNs(),
          [WorkloadColumnId.cpu]: item => item.getCpuCores(),
          [WorkloadColumnId.ram]: item => item.getRamGb(),
          [WorkloadColumnId.daily]: item => item.alloc.dailyCost,
          [WorkloadColumnId.monthly]: item => item.alloc.monthlyCost,
        }}
        searchFilters={[
          item => item.getSearchFields(),
        ]}
        renderHeaderTitle="Workload Cost Allocations"
        renderTableHeader={[
          { title: "Workload", className: "name", sortBy: WorkloadColumnId.name, id: WorkloadColumnId.name },
          { title: "Kind", className: "kind", sortBy: WorkloadColumnId.kind, id: WorkloadColumnId.kind },
          { title: "Namespace", className: "namespace", sortBy: WorkloadColumnId.namespace, id: WorkloadColumnId.namespace },
          { title: "CPU Requested", className: "cpu", sortBy: WorkloadColumnId.cpu, id: WorkloadColumnId.cpu },
          { title: "RAM Requested", className: "ram", sortBy: WorkloadColumnId.ram, id: WorkloadColumnId.ram },
          { title: "Est. Cost / Day", className: "daily", sortBy: WorkloadColumnId.daily, id: WorkloadColumnId.daily },
          { title: "Est. Cost / Month", className: "monthly", sortBy: WorkloadColumnId.monthly, id: WorkloadColumnId.monthly },
        ]}
        renderTableContents={item => [
          item.getName(),
          item.getKind(),
          <NamespaceSelectBadge key="ns" namespace={item.getNs()} />,
          `${item.getCpuCores()} cores`,
          `${item.getRamGb()} GB`,
          <Badge key="daily" label={item.getDailyCost()} />,
          <Badge key="monthly" label={item.getMonthlyCost()} className="cost-badge" />,
        ]}
      />
    );
  }

  private renderAssumptions() {
    return (
      <div className="assumptions-panel" data-testid="cost-assumptions-panel">
        <h3>Declared Cost Calculation Assumptions & Rates</h3>
        <ul>
          {COST_ASSUMPTIONS_DECLARATION.map((text, idx) => (
            <li key={idx}>{text}</li>
          ))}
        </ul>

        <div className="rates-grid">
          <div className="rate-card">
            <div className="rate-title">vCPU Hourly Rate</div>
            <div className="rate-value">${DEFAULT_COST_RATES.cpuCorePerHour.toFixed(4)}</div>
            <div className="rate-desc">Per vCPU-hour (~$23.08 / month)</div>
          </div>
          <div className="rate-card">
            <div className="rate-title">RAM Hourly Rate</div>
            <div className="rate-value">${DEFAULT_COST_RATES.ramGbPerHour.toFixed(4)}</div>
            <div className="rate-desc">Per GB-hour (~$3.09 / month)</div>
          </div>
          <div className="rate-card">
            <div className="rate-title">Storage Hourly Rate</div>
            <div className="rate-value">${DEFAULT_COST_RATES.storageGbPerHour.toFixed(6)}</div>
            <div className="rate-desc">Per GB-hour (~$0.10 / month)</div>
          </div>
          <div className="rate-card">
            <div className="rate-title">Cluster Monthly Run-rate</div>
            <div className="rate-value">${this.costCalculations.clusterSummary.totalMonthlyCost.toFixed(2)}</div>
            <div className="rate-desc">Total across {this.costCalculations.namespaceAllocations.length} namespaces</div>
          </div>
        </div>
      </div>
    );
  }

  render() {
    return (
      <SiblingsInTabLayout>
        <div className="CostsView" data-testid="costs-view">
          <div className="readonly-notice" data-testid="opencost-assumptions-notice">
            <strong>Cluster Cost Observability:</strong> Local cost estimates calculated from resource requests/usage and baseline node rates ($0.0316/vCPU-h, $0.0042/GB-h). OpenCost service discovery (port 9003) is supported without external SaaS dependencies. Estimates are advisory and do not represent exact cloud provider billing.
          </div>

          <Tabs
            className="view-tabs"
            value={this.activeTab}
            onChange={this.onTabChange}
          >
            <Tab
              value={CostsTab.NAMESPACE_COSTS}
              label="Namespace Allocations"
              id="tab-namespace-costs"
            />
            <Tab
              value={CostsTab.WORKLOAD_COSTS}
              label="Workload Allocations"
              id="tab-workload-costs"
            />
            <Tab
              value={CostsTab.ASSUMPTIONS}
              label="Cost Model & Assumptions"
              id="tab-cost-assumptions"
            />
          </Tabs>

          {this.activeTab === CostsTab.NAMESPACE_COSTS && this.renderNamespaceCosts()}
          {this.activeTab === CostsTab.WORKLOAD_COSTS && this.renderWorkloadCosts()}
          {this.activeTab === CostsTab.ASSUMPTIONS && this.renderAssumptions()}
        </div>
      </SiblingsInTabLayout>
    );
  }
}

export const Costs = withInjectables<Dependencies>(NonInjectedCosts, {
  getProps: (di) => ({
    deploymentStore: di.inject(deploymentStoreInjectable),
    podStore: di.inject(podStoreInjectable),
  }),
});
