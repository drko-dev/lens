/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { CoreV1Api } from "@kubernetes/client-node";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import helmPrometheusProviderInjectable from "./helm-provider.injectable";

describe("helm prometheus provider auto-detection", () => {
  const clientReturning = (labelsWithService: string) => {
    const selectors: string[] = [];
    const client = {
      listServiceForAllNamespaces: async (_a: unknown, _b: unknown, _c: unknown, selector: string) => {
        selectors.push(selector);

        return {
          body: {
            items: selector === labelsWithService
              ? [{ metadata: { namespace: "observability", name: "prometheus-server" }, spec: { ports: [{ port: 80 }] }}]
              : [],
          },
        };
      },
    } as unknown as CoreV1Api;

    return { client, selectors };
  };

  it("finds a prometheus-community chart service that only has app.kubernetes.io labels", async () => {
    const provider = getDiForUnitTesting().inject(helmPrometheusProviderInjectable);
    const { client, selectors } = clientReturning("app.kubernetes.io/name=prometheus,app.kubernetes.io/component=server");

    await expect(provider.getPrometheusService(client)).resolves.toMatchObject({
      namespace: "observability",
      service: "prometheus-server",
      port: 80,
    });
    expect(selectors[0]).toBe("app=prometheus,component=server,heritage=Helm");
  });

  it("still prefers the legacy Helm labels", async () => {
    const provider = getDiForUnitTesting().inject(helmPrometheusProviderInjectable);
    const { client, selectors } = clientReturning("app=prometheus,component=server,heritage=Helm");

    await expect(provider.getPrometheusService(client)).resolves.toMatchObject({ service: "prometheus-server" });
    expect(selectors).toEqual(["app=prometheus,component=server,heritage=Helm"]);
  });
});
