/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createPrometheusProvider, findFirstNamespacedService, prometheusProviderInjectionToken } from "./provider";
import { getOperatorLikeQueryFor } from "./operator-provider.injectable.ts";
import { getInjectable } from "@ogre-tools/injectable";

const victoriaMetricsPrometheusProviderInjectable = getInjectable({
  id: "victoria-metrics-prometheus-provider",
  instantiate: () => createPrometheusProvider({
    kind: "victoriametrics",
    name: "VictoriaMetrics",
    isConfigurable: true,
    getService: (client) => findFirstNamespacedService(
      client,
      "app.kubernetes.io/name=victoria-metrics",
      "app=victoria-metrics-single",
      "app=vmselect",
      "app=vmsingle",
      "app=victoria-metrics-k8s-stack",
      "app.kubernetes.io/instance=victoria-metrics",
    ),
    getQuery: getOperatorLikeQueryFor({ rateAccuracy: "1m" }),
  }),
  injectionToken: prometheusProviderInjectionToken,
});

export default victoriaMetricsPrometheusProviderInjectable;
