/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { CoreV1Api } from "@kubernetes/client-node";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import victoriaMetricsPrometheusProviderInjectable from "./victoria-metrics-provider.injectable";

describe("victoria-metrics prometheus provider auto-detection", () => {
  const clientReturning = (matchingSelector: string) => {
    const selectors: string[] = [];
    const client = {
      listServiceForAllNamespaces: jest.fn(async (_a: unknown, _b: unknown, _c: unknown, labelSelector: string) => {
        selectors.push(labelSelector);

        return {
          body: {
            items: labelSelector === matchingSelector
              ? [{ metadata: { namespace: "monitoring", name: "vmsingle-victoria-metrics" }, spec: { ports: [{ port: 8429 }] } }]
              : [],
          },
        };
      }),
    } as unknown as CoreV1Api;

    return { client, selectors };
  };

  it("auto-detects VictoriaMetrics single/cluster services across supported selectors", async () => {
    const di = getDiForUnitTesting();
    const provider = di.inject(victoriaMetricsPrometheusProviderInjectable);

    expect(provider.kind).toBe("victoriametrics");

    for (const selector of [
      "app.kubernetes.io/name=victoria-metrics",
      "app=victoria-metrics-single",
      "app=vmselect",
      "app=vmsingle",
      "app=victoria-metrics-k8s-stack",
      "app.kubernetes.io/instance=victoria-metrics",
    ]) {
      const { client } = clientReturning(selector);

      await expect(provider.getPrometheusService(client)).resolves.toMatchObject({
        namespace: "monitoring",
        service: "vmsingle-victoria-metrics",
        port: 8429,
      });
    }
  });
});
