/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./pods.scss";

import React, { useEffect } from "react";
import { observer } from "mobx-react";
import { KubeObjectListLayout } from "../kube-object-list-layout";
import { SiblingsInTabLayout } from "../layout/siblings-in-tab-layout";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { EventStore } from "../events/store";
import type { PodStore } from "./store";
import eventStoreInjectable from "../events/store.injectable";
import podStoreInjectable from "./store.injectable";
import type { SpecificKubeListLayoutColumn } from "@openlens/list-layout";
import { podListLayoutColumnInjectionToken } from "@openlens/list-layout";
import type { Pod } from "@openlens/kube-object";
import { bytesToUnits } from "@openlens/utilities";
import type { IComputedValue } from "mobx";
import type { LensTheme } from "../../themes/lens-theme";
import activeThemeInjectable from "../../themes/active.injectable";
import { novakubeThemeName } from "../../themes/novakube.injectable";

interface Dependencies {
  eventStore: EventStore;
  podStore: PodStore;
  columns: SpecificKubeListLayoutColumn<Pod>[];
  activeTheme: IComputedValue<LensTheme>;
}

const NonInjectedPods = observer((props: Dependencies) => {
  const {
    columns,
    eventStore,
    podStore,
    activeTheme,
  } = props;

  const lensVisualParity = activeTheme.get().name === novakubeThemeName;

  // Only the NovaKube Pods view polls the Kubernetes metrics API. This is
  // read-only and reuses the existing PodStore implementation for all pods.
  useEffect(() => {
    if (!lensVisualParity) return;

    void podStore.loadKubeMetrics();
    const timer = setInterval(() => { void podStore.loadKubeMetrics(); }, 60_000);

    return () => clearInterval(timer);
  }, [lensVisualParity, podStore]);

  const currentMetrics = (pod: Pod) => {
    const hasMetrics = podStore.kubeMetrics.some(metric => (
      metric.getName() === pod.getName() && metric.getNs() === pod.getNs()
    ));

    return hasMetrics ? podStore.getPodKubeMetrics(pod) : undefined;
  };

  const lensMetricsColumns: SpecificKubeListLayoutColumn<Pod>[] = [
    {
      id: "cpu",
      priority: 85,
      header: { title: "CPU", className: "cpu", sortBy: "cpu", id: "cpu" },
      content: pod => currentMetrics(pod)?.cpu.toFixed(3) ?? "N/A",
      sortingCallBack: pod => currentMetrics(pod)?.cpu ?? -1,
    },
    {
      id: "memory",
      priority: 84,
      header: { title: "Memory", className: "memory", sortBy: "memory", id: "memory" },
      content: pod => {
        const metric = currentMetrics(pod);

        return metric ? bytesToUnits(metric.memory, { precision: 1 }) : "N/A";
      },
      sortingCallBack: pod => currentMetrics(pod)?.memory ?? -1,
    },
  ];

  const displayedColumns = lensVisualParity
    ? [
      ...columns.map(column => (
        column.id === "status" ? { ...column, priority: 35 } : column
      )),
      ...lensMetricsColumns,
    ]
    : columns;

  return (
    <SiblingsInTabLayout>
      <KubeObjectListLayout
        className="Pods"
        store={podStore}
        dependentStores={[eventStore]} // status icon component uses event store
        tableId="workloads_pods"
        isConfigurable
        searchFilters={[
          pod => pod.getSearchFields(),
          pod => pod.getStatusMessage(),
          pod => pod.status?.podIP,
          pod => pod.getNodeName(),
        ]}
        renderHeaderTitle="Pods"
        renderTableHeader={[]}
        renderTableContents={() => []}
        columns={displayedColumns}
      />
    </SiblingsInTabLayout>
  );
});

export const Pods = withInjectables<Dependencies>(NonInjectedPods, {
  getProps: (di, props) => ({
    ...props,
    eventStore: di.inject(eventStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    columns: di.injectMany(podListLayoutColumnInjectionToken),
    activeTheme: di.inject(activeThemeInjectable),
  }),
});
