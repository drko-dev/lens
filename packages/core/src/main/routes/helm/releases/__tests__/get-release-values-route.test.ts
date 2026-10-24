/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import type { Cluster } from "../../../../../common/cluster/cluster";
import type { GetHelmReleaseValuesData } from "../../../../helm/get-helm-release-values.injectable";
import getClusterHelmReleaseValuesInjectable from "../../../../helm/helm-service/get-helm-release-values.injectable";
import getReleaseRouteValuesInjectable from "../get-release-values-route.injectable";

describe("get release values route revision query", () => {
  let getValues: jest.MockedFunction<(cluster: Cluster, data: GetHelmReleaseValuesData) => Promise<string>>;
  let handler: ReturnType<typeof getReleaseRouteValuesInjectable.instantiate>;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    getValues = jest.fn().mockResolvedValue("replicas: 2\n");
    di.override(getClusterHelmReleaseValuesInjectable, () => getValues);
    di.permitSideEffects(getReleaseRouteValuesInjectable);
    handler = di.inject(getReleaseRouteValuesInjectable) as never;
  });

  it("rejects malformed revisions instead of silently requesting the current revision", async () => {
    const result = await handler.handler({
      cluster: {} as never,
      params: { namespace: "default", name: "release" },
      query: new URLSearchParams("revision=2junk"),
    } as never);

    expect(result).toEqual({ statusCode: 400, error: "revision must be a positive safe integer" });
    expect(getValues).not.toHaveBeenCalled();
  });

  it("passes a valid revision through to Helm", async () => {
    await handler.handler({
      cluster: {} as never,
      params: { namespace: "default", name: "release" },
      query: new URLSearchParams("all=true&revision=4"),
    } as never);

    expect(getValues).toHaveBeenCalledWith(expect.anything(), {
      name: "release",
      namespace: "default",
      all: true,
      revision: 4,
    });
  });
});
