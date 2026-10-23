/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DeploymentApi } from "./deployment.api";

describe("DeploymentApi.setPaused", () => {
  it("uses UID and resourceVersion JSON Patch preconditions", async () => {
    const api = Object.create(DeploymentApi.prototype) as DeploymentApi;
    const patch = jest.spyOn(api, "patch").mockResolvedValue({} as never);

    await api.setPaused(
      { name: "web", namespace: "default" },
      true,
      { uid: "deployment-uid", resourceVersion: "42" },
    );

    expect(patch).toHaveBeenCalledWith(
      { name: "web", namespace: "default" },
      [
        { op: "test", path: "/metadata/uid", value: "deployment-uid" },
        { op: "test", path: "/metadata/resourceVersion", value: "42" },
        { op: "add", path: "/spec/paused", value: true },
      ],
      "json",
    );
  });

  it("rejects missing preconditions", () => {
    const api = Object.create(DeploymentApi.prototype) as DeploymentApi;
    const patch = jest.spyOn(api, "patch");

    expect(() => api.setPaused(
      { name: "web", namespace: "default" },
      false,
      { uid: "", resourceVersion: "42" },
    )).toThrow("requires its current UID and resourceVersion");
    expect(patch).not.toHaveBeenCalled();
  });
});
