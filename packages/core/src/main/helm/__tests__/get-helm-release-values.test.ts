/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import execHelmInjectable from "../exec-helm/exec-helm.injectable";
import getHelmReleaseValuesInjectable from "../get-helm-release-values.injectable";
import type { ExecHelm } from "../exec-helm/exec-helm.injectable";
import type { GetHelmReleaseValues } from "../get-helm-release-values.injectable";

describe("getHelmReleaseValues", () => {
  let execHelmMock: jest.MockedFunction<ExecHelm>;
  let getHelmReleaseValues: GetHelmReleaseValues;

  beforeEach(() => {
    const di = getDiForUnitTesting();

    execHelmMock = jest.fn().mockResolvedValue({
      callWasSuccessful: true,
      response: "replicaCount: 1\n",
    });

    di.override(execHelmInjectable, () => execHelmMock);
    di.permitSideEffects(getHelmReleaseValuesInjectable);

    getHelmReleaseValues = di.inject(getHelmReleaseValuesInjectable);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("reads the values of the current revision when no revision is requested", async () => {
    const result = await getHelmReleaseValues("/kubeconfig", {
      name: "my-release",
      namespace: "default",
    });

    expect(result).toBe("replicaCount: 1\n");
    expect(execHelmMock).toHaveBeenCalledTimes(1);

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toEqual([
      "get",
      "values",
      "my-release",
      "--output",
      "yaml",
      "--namespace",
      "default",
      "--kubeconfig",
      "/kubeconfig",
    ]);
    expect(args).not.toContain("--revision");
  });

  it("keeps the previous behaviour when only the defaults flag is requested", async () => {
    await getHelmReleaseValues("/kubeconfig", {
      name: "my-release",
      namespace: "default",
      all: true,
    });

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toEqual([
      "get",
      "values",
      "my-release",
      "--all",
      "--output",
      "yaml",
      "--namespace",
      "default",
      "--kubeconfig",
      "/kubeconfig",
    ]);
  });

  it("requests a specific revision when one is provided", async () => {
    await getHelmReleaseValues("/kubeconfig", {
      name: "my-release",
      namespace: "default",
      revision: 7,
    });

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toEqual([
      "get",
      "values",
      "my-release",
      "--revision",
      "7",
      "--output",
      "yaml",
      "--namespace",
      "default",
      "--kubeconfig",
      "/kubeconfig",
    ]);
  });

  it("combines the defaults flag and a revision", async () => {
    await getHelmReleaseValues("/kubeconfig", {
      name: "my-release",
      namespace: "default",
      all: true,
      revision: 3,
    });

    const args = execHelmMock.mock.calls[0][0];

    expect(args).toContain("--all");
    expect(args).toContain("--revision");
    expect(args[args.indexOf("--revision") + 1]).toBe("3");
  });

  it("propagates the failure of the helm invocation", async () => {
    const error = new Error("release: not found");

    execHelmMock.mockResolvedValue({
      callWasSuccessful: false,
      error: error as never,
    });

    await expect(getHelmReleaseValues("/kubeconfig", {
      name: "missing",
      namespace: "default",
      revision: 2,
    })).rejects.toThrow("release: not found");
  });
});
