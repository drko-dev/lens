/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { KubeObjectDetailMetrics } from "@openlens/metrics";
import type { IComputedValue } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import "../../../resource-metrics/resource-metrics.scss";
import type { KubeObject } from "@openlens/kube-object";

export interface DetailsMetricsContainerProps<K extends KubeObject> {
  metrics: IComputedValue<KubeObjectDetailMetrics<K>[]>;
  object?: K;
}

function NonObservingDetailsMetricsContainer<K extends KubeObject>({ metrics, object }: DetailsMetricsContainerProps<K>) {
  if (!object) {
    return null;
  }

  return (
    <>
      <h2 className="DrawerSectionTitle">Metrics</h2>
      {metrics.get().map((metrics) => (
        <metrics.Component object={object} key={metrics.id} />
      ))}
    </>
  );
}

export const DetailsMetricsContainer = observer(NonObservingDetailsMetricsContainer);
