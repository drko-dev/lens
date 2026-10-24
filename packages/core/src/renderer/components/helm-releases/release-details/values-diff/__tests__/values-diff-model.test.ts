/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable } from "mobx";
import { ValuesDiffModel } from "../values-diff-model.injectable";

function createRevisionHistory(revisionA: number | undefined, revisionB: number | undefined) {
  const selectedRevisionA = observable.box<number | undefined>(revisionA);
  const selectedRevisionB = observable.box<number | undefined>(revisionB);

  return {
    selectedRevisionA,
    selectedRevisionB,
    get canCompare() {
      const a = selectedRevisionA.get();
      const b = selectedRevisionB.get();

      return a !== undefined && b !== undefined && a !== b;
    },
  };
}

describe("ValuesDiffModel", () => {
  function createModel(options: {
    revisionA?: number;
    revisionB?: number;
    request?: (name: string, namespace: string, all: boolean, revision?: number) => Promise<string>;
    clusterId?: string;
    getCurrentClusterId?: () => string | undefined;
  } = {}) {
    const requests: { name: string; namespace: string; all: boolean; revision?: number }[] = [];
    const revisionHistory = createRevisionHistory(options.revisionA, options.revisionB);

    const model = new ValuesDiffModel({
      targetRelease: { name: "my-release", namespace: "default" },
      clusterId: options.clusterId ?? "cluster-a",
      requestHelmReleaseConfiguration: async (name, namespace, all, revision) => {
        requests.push({ name, namespace, all, revision });

        return options.request
          ? options.request(name, namespace, all, revision)
          : `values of revision ${revision}`;
      },
      revisionHistory: revisionHistory as never,
      getCurrentClusterId: options.getCurrentClusterId ?? (() => options.clusterId ?? "cluster-a"),
      isClusterDisconnected: () => false,
    });

    return { model, requests, revisionHistory };
  }

  it("does nothing while no two revisions are selected", async () => {
    const { model, requests } = createModel({ revisionA: 1 });

    await model.load();

    expect(requests).toHaveLength(0);
    expect(model.valuesA.get()).toBeUndefined();
    expect(model.valuesB.get()).toBeUndefined();
    expect(model.hasSelection).toBe(false);
  });

  it("requests the values of both selected revisions", async () => {
    const { model, requests } = createModel({ revisionA: 3, revisionB: 1 });

    await model.load();

    expect(requests).toEqual([
      { name: "my-release", namespace: "default", all: false, revision: 3 },
      { name: "my-release", namespace: "default", all: false, revision: 1 },
    ]);
    expect(model.valuesA.get()).toBe("values of revision 3");
    expect(model.valuesB.get()).toBe("values of revision 1");
    expect(model.isReady).toBe(true);
  });

  it("requests the values including the defaults when the mode changes", async () => {
    const { model, requests } = createModel({ revisionA: 2, revisionB: 1 });

    model.setMode("with-defaults");

    await model.load();

    expect(requests.every(request => request.all)).toBe(true);
  });

  it("keeps the user supplied mode by default", async () => {
    const { model, requests } = createModel({ revisionA: 2, revisionB: 1 });

    await model.load();

    expect(requests.every(request => !request.all)).toBe(true);
    expect(model.mode.get()).toBe("user-supplied");
  });

  it("reports an error when the values cannot be loaded", async () => {
    const { model } = createModel({
      revisionA: 2,
      revisionB: 1,
      request: async () => {
        throw new Error("release: not found");
      },
    });

    await model.load();

    expect(model.error.get()).toBe("release: not found");
    expect(model.isReady).toBe(false);
  });

  it("reports an error when one of the selected revisions does not exist", async () => {
    const { model } = createModel({
      revisionA: 9,
      revisionB: 1,
      request: async (_name, _namespace, _all, revision) => {
        if (revision === 9) {
          throw new Error("Error: release: not found revision 9");
        }

        return "values of revision 1";
      },
    });

    await model.load();

    expect(model.error.get()).toContain("revision 9");
    expect(model.valuesA.get()).toBeUndefined();
    expect(model.valuesB.get()).toBeUndefined();
    expect(model.isReady).toBe(false);
  });

  it("discards a response that arrives after the selection changed", async () => {
    let resolveRequest: (value: string) => void = () => undefined;
    const pending = new Promise<string>(resolve => {
      resolveRequest = resolve;
    });

    const { model, revisionHistory } = createModel({
      revisionA: 2,
      revisionB: 1,
      request: async () => pending,
    });

    const loading = model.load();

    // The operator selects another revision while the request is in flight
    revisionHistory.selectedRevisionA.set(5);
    resolveRequest("values of revision 2");
    await loading;

    expect(model.valuesA.get()).toBeUndefined();
    expect(model.valuesB.get()).toBeUndefined();
  });

  it("discards a response that arrives after the cluster changed", async () => {
    let resolveRequest: (value: string) => void = () => undefined;
    const pending = new Promise<string>(resolve => {
      resolveRequest = resolve;
    });

    let currentClusterId = "cluster-a";

    const { model } = createModel({
      revisionA: 2,
      revisionB: 1,
      request: async () => pending,
      getCurrentClusterId: () => currentClusterId,
    });

    const loading = model.load();

    currentClusterId = "cluster-b";
    resolveRequest("values of revision 2");
    await loading;

    expect(model.valuesA.get()).toBeUndefined();
  });

  it("clears the previous values as soon as a new selection starts loading", async () => {
    let resolveRequest: (value: string) => void = () => undefined;
    const pending = new Promise<string>(resolve => {
      resolveRequest = resolve;
    });

    const { model, revisionHistory } = createModel({
      revisionA: 2,
      revisionB: 1,
      request: async () => pending,
    });

    const loading = model.load();

    // While the new request is in flight the previous values are not shown
    expect(model.valuesA.get()).toBeUndefined();
    expect(model.valuesB.get()).toBeUndefined();

    resolveRequest("fresh");
    await loading;

    expect(model.valuesA.get()).toBe("fresh");
    expect(revisionHistory.selectedRevisionA.get()).toBe(2);
  });

  it("clears values and discards in-flight responses when the comparison is closed", async () => {
    let requestCount = 0;
    let resolveRequest: (value: string) => void = () => undefined;
    const pending = new Promise<string>(resolve => {
      resolveRequest = resolve;
    });
    const { model } = createModel({
      revisionA: 2,
      revisionB: 1,
      request: async () => requestCount++ < 2 ? "previous values" : pending,
    });

    await model.load();
    expect(model.valuesA.get()).toBe("previous values");

    const loading = model.load();

    expect(model.valuesA.get()).toBeUndefined();

    model.clear();
    resolveRequest("late values");
    await loading;

    expect(model.isLoading.get()).toBe(false);
    expect(model.valuesA.get()).toBeUndefined();
    expect(model.valuesB.get()).toBeUndefined();
  });

  it("keeps the models of two releases isolated from each other", async () => {
    let resolveA: (value: string) => void = () => undefined;

    const pendingA = new Promise<string>(resolve => {
      resolveA = resolve;
    });

    const request = (name: string) => (
      name === "release-a" ? pendingA : Promise.resolve(`values of ${name}`)
    );

    const modelA = new ValuesDiffModel({
      targetRelease: { name: "release-a", namespace: "default" },
      clusterId: "cluster-a",
      requestHelmReleaseConfiguration: async (name) => request(name),
      revisionHistory: createRevisionHistory(2, 1) as never,
      getCurrentClusterId: () => "cluster-a",
      isClusterDisconnected: () => false,
    });

    const modelB = new ValuesDiffModel({
      targetRelease: { name: "release-b", namespace: "default" },
      clusterId: "cluster-a",
      requestHelmReleaseConfiguration: async (name) => request(name),
      revisionHistory: createRevisionHistory(2, 1) as never,
      getCurrentClusterId: () => "cluster-a",
      isClusterDisconnected: () => false,
    });

    const loadingA = modelA.load();

    await modelB.load();

    // The values of release B are not affected by the pending request of release A
    expect(modelB.valuesA.get()).toBe("values of release-b");
    expect(modelA.valuesA.get()).toBeUndefined();

    resolveA("values of release-a");
    await loadingA;

    expect(modelA.valuesA.get()).toBe("values of release-a");
    expect(modelB.valuesA.get()).toBe("values of release-b");
  });

  it("keeps the models of two namespaces isolated from each other", async () => {
    const buildModel = (namespace: string) => new ValuesDiffModel({
      targetRelease: { name: "same-name", namespace },
      clusterId: "cluster-a",
      requestHelmReleaseConfiguration: async (_name, ns) => `values of ${ns}`,
      revisionHistory: createRevisionHistory(2, 1) as never,
      getCurrentClusterId: () => "cluster-a",
      isClusterDisconnected: () => false,
    });

    const modelProd = buildModel("prod");
    const modelDev = buildModel("dev");

    await modelProd.load();
    await modelDev.load();

    expect(modelProd.valuesA.get()).toBe("values of prod");
    expect(modelDev.valuesA.get()).toBe("values of dev");
  });

  it("exposes the selected revisions", () => {
    const { model } = createModel({ revisionA: 4, revisionB: 2 });

    expect(model.revisionA).toBe(4);
    expect(model.revisionB).toBe(2);
  });
});
