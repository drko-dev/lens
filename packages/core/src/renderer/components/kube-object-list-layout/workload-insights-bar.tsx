/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./workload-insights-bar.scss";

import React from "react";
import { observer } from "mobx-react";
import { cssNames } from "@openlens/utilities";
import { Icon } from "../icon";
import type { PageFiltersStore } from "../item-object-list/page-filters/store";
import { FilterType } from "../item-object-list/page-filters/store";
import { withInjectables } from "@ogre-tools/injectable-react";
import pageFiltersStoreInjectable from "../item-object-list/page-filters/store.injectable";
import type { KubeObject } from "@openlens/kube-object";

export interface WorkloadInsightsBarProps<K extends KubeObject = KubeObject> {
  rawItems: K[];
  resourceKind?: string;
}

interface Dependencies {
  pageFiltersStore: PageFiltersStore;
}

const NonInjectedWorkloadInsightsBar = observer(<K extends KubeObject>({
  rawItems,
  resourceKind = "Workload",
  pageFiltersStore,
}: WorkloadInsightsBarProps<K> & Dependencies) => {
  const activeStatusValues = new Set(
    pageFiltersStore.getValues(FilterType.STATUS).map(s => s.toLowerCase()),
  );
  const isHealthyActive = activeStatusValues.has("running");
  const isDegradedActive = activeStatusValues.has("failed") || activeStatusValues.has("degraded");

  let healthyCount = 0;
  let degradedCount = 0;
  const namespacesSet = new Set<string>();

  for (const item of rawItems) {
    const anyItem = item as any;
    const ns = item.getNs?.() || anyItem.metadata?.namespace;

    if (ns) {
      namespacesSet.add(ns);
    }

    if (resourceKind === "Pod" || resourceKind === "Pods") {
      const status = (
        typeof anyItem.getStatusMessage === "function"
          ? anyItem.getStatusMessage()
          : anyItem.status?.phase
      ) || "";
      const lower = status.toLowerCase();

      if (lower === "running" || lower === "succeeded") {
        healthyCount++;
      } else {
        degradedCount++;
      }
    } else if (resourceKind === "Deployment" || resourceKind === "Deployments") {
      const replicas = anyItem.status?.replicas ?? 0;
      const availableReplicas = anyItem.status?.availableReplicas ?? 0;

      if (replicas > 0 && availableReplicas >= replicas) {
        healthyCount++;
      } else if (replicas > 0 && availableReplicas < replicas) {
        degradedCount++;
      } else {
        healthyCount++;
      }
    } else {
      const status = (
        typeof anyItem.getStatusMessage === "function"
          ? anyItem.getStatusMessage()
          : anyItem.status?.phase
      ) || "";
      const lower = status.toLowerCase();

      if (lower.includes("fail") || lower.includes("error") || lower.includes("degraded")) {
        degradedCount++;
      } else {
        healthyCount++;
      }
    }
  }

  const toggleHealthyFilter = () => {
    if (isHealthyActive) {
      pageFiltersStore.removeFilter({ type: FilterType.STATUS, value: "Running" });
    } else {
      pageFiltersStore.addFilter({ type: FilterType.STATUS, value: "Running" });
    }
  };

  const toggleDegradedFilter = () => {
    if (isDegradedActive) {
      pageFiltersStore.removeFilter({ type: FilterType.STATUS, value: "Failed" });
    } else {
      pageFiltersStore.addFilter({ type: FilterType.STATUS, value: "Failed" });
    }
  };

  const resetFilters = () => {
    pageFiltersStore.reset();
  };

  return (
    <div className="WorkloadInsightsBar" data-testid="workload-insights-bar">
      <div
        className="insight-card total clickable"
        onClick={resetFilters}
        data-testid="insight-card-total"
        title="Click to reset filters and view all workloads"
      >
        <div className="card-top">
          <span className="card-label">
            Total
            {resourceKind}
            s
          </span>
          <Icon material="widgets" className="card-icon" />
        </div>
        <div className="card-value">{rawItems.length}</div>
        <div className="card-sub">All monitored</div>
      </div>

      <div
        className={cssNames("insight-card healthy clickable", { active: isHealthyActive })}
        onClick={toggleHealthyFilter}
        data-testid="insight-card-healthy"
        title="Click to filter by healthy/running workloads"
      >
        <div className="card-top">
          <span className="card-label">Healthy / Ready</span>
          <Icon material="check_circle" className="card-icon" />
        </div>
        <div className="card-value">{healthyCount}</div>
        <div className="card-sub">Operating normally</div>
      </div>

      <div
        className={cssNames("insight-card warning clickable", { active: isDegradedActive })}
        onClick={toggleDegradedFilter}
        data-testid="insight-card-degraded"
        title="Click to filter degraded or failing workloads"
      >
        <div className="card-top">
          <span className="card-label">Degraded / Issues</span>
          <Icon material="warning" className="card-icon" />
        </div>
        <div className="card-value">{degradedCount}</div>
        <div className="card-sub">Needs attention</div>
      </div>

      <div
        className="insight-card namespaces"
        data-testid="insight-card-namespaces"
      >
        <div className="card-top">
          <span className="card-label">Namespaces</span>
          <Icon material="layers" className="card-icon" />
        </div>
        <div className="card-value">{namespacesSet.size}</div>
        <div className="card-sub">Active scopes</div>
      </div>
    </div>
  );
});

export const WorkloadInsightsBar = withInjectables<Dependencies, WorkloadInsightsBarProps<KubeObject>>(
  NonInjectedWorkloadInsightsBar,
  {
    getProps: (di, props) => ({
      ...props,
      pageFiltersStore: di.inject(pageFiltersStoreInjectable),
    }),
  },
) as <K extends KubeObject>(props: WorkloadInsightsBarProps<K>) => React.ReactElement;
