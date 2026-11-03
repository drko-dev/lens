/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable } from "mobx";
import type { Cluster } from "../../common/cluster/cluster";
import { createClusterPrometheusHandler } from "../cluster/prometheus-handler/prometheus-handler";

// H7.6.2: a metrics request that outlives Disconnect must not start the cluster proxy again
// (loading the proxy kubeconfig is what starts lens-k8s-proxy).
describe("prometheus handler after Disconnect", () => {
  const setup = (disconnected: boolean) => {
    const loadProxyKubeconfig = jest.fn(async () => {
      throw new Error("proxy kubeconfig requested");
    });
    const cluster = { id: "c1", disconnected: observable.box(disconnected), preferences: {}} as unknown as Cluster;
    const handler = createClusterPrometheusHandler({
      loadProxyKubeconfig,
      getPrometheusProviderByKind: jest.fn(),
      prometheusProviders: { get: () => [] },
      logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), silly: jest.fn() },
    } as any, cluster);

    return { handler, loadProxyKubeconfig };
  };

  it("refuses to detect Prometheus for a disconnected cluster without touching its proxy", async () => {
    const { handler, loadProxyKubeconfig } = setup(true);

    await expect(handler.getPrometheusDetails()).rejects.toThrow("disconnected");
    expect(loadProxyKubeconfig).not.toHaveBeenCalled();
  });

  it("still uses the proxy of a connected cluster", async () => {
    const { handler, loadProxyKubeconfig } = setup(false);

    await expect(handler.getPrometheusDetails()).rejects.toThrow("proxy kubeconfig requested");
    expect(loadProxyKubeconfig).toHaveBeenCalledTimes(1);
  });
});
