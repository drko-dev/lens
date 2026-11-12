/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { observer } from "mobx-react";
import { Select } from "../select";
import { Icon } from "../icon";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { SelectedMetricsType } from "./overview/selected-metrics-type.injectable";
import type { SelectedNodeRoleForMetrics } from "./overview/selected-node-role-for-metrics.injectable";
import selectedMetricsTypeInjectable from "./overview/selected-metrics-type.injectable";
import selectedNodeRoleForMetricsInjectable from "./overview/selected-node-role-for-metrics.injectable";

interface Dependencies {
  selectedMetricsType: SelectedMetricsType;
  selectedNodeRoleForMetrics: SelectedNodeRoleForMetrics;
}

const NonInjectedClusterMetricSwitchers = observer(({
  selectedMetricsType,
  selectedNodeRoleForMetrics,
}: Dependencies) => (
  <div className="flex gaps" style={{ marginBottom: "calc(var(--margin) * 2)" }}>
    <div className="box grow">
      <Select
        id="cluster-metrics-node-role"
        themeName="lens"
        className="theme-toolbar"
        controlShouldRenderValue
        value={selectedNodeRoleForMetrics.value.get()}
        options={[
          { value: "master", label: "Master Nodes", isDisabled: !selectedNodeRoleForMetrics.hasMasterNodes.get() },
          { value: "worker", label: "Worker Nodes", isDisabled: !selectedNodeRoleForMetrics.hasWorkerNodes.get() },
        ]}
        isOptionDisabled={option => Boolean((option as { isDisabled?: boolean }).isDisabled)}
        onChange={option => option && selectedNodeRoleForMetrics.set(option.value as never)}
      />
    </div>
    <div className="box grow" style={{ textAlign: "right" }}>
      <div className="flex gaps justify-flex-end">
        {([
          ["cpu", "memory", "CPU", selectedMetricsType.hasCPUMetrics.get()],
          ["memory", "developer_board", "Memory", selectedMetricsType.hasMemoryMetrics.get()],
        ] as const).map(([value, material, label, enabled]) => (
          <Icon
            key={value}
            material={material}
            tooltip={label}
            interactive={enabled}
            disabled={!enabled}
            className={selectedMetricsType.value.get() === value ? "metric-type-toggle active" : "metric-type-toggle"}
            onClick={() => selectedMetricsType.set(value)}
          />
        ))}
      </div>
    </div>
  </div>
));

export const ClusterMetricSwitchers = withInjectables<Dependencies>(NonInjectedClusterMetricSwitchers, {
  getProps: (di) => ({
    selectedMetricsType: di.inject(selectedMetricsTypeInjectable),
    selectedNodeRoleForMetrics: di.inject(selectedNodeRoleForMetricsInjectable),
  }),
});

