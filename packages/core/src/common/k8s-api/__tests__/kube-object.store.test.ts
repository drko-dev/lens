/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { noop } from "@openlens/utilities";
import type { KubeApi } from "../kube-api";
import { KubeObject } from "@openlens/kube-object";
import type { KubeObjectStoreLoadingParams } from "../kube-object.store";
import { KubeObjectStore } from "../kube-object.store";

class FakeKubeObjectStore extends KubeObjectStore<KubeObject> {
  constructor(private readonly _loadItems: (params: KubeObjectStoreLoadingParams) => KubeObject[], api: Partial<KubeApi<KubeObject>>) {
    super({
      context: {
        allNamespaces: [],
        contextNamespaces: [],
        hasSelectedAll: false,
        isGlobalWatchEnabled: () => true,
        isLoadingAll: () => true,
      },
      logger: {
        debug: noop,
        error: noop,
        info: noop,
        silly: noop,
        warn: noop,
      },
    }, api as KubeApi<KubeObject>);
  }

  async loadItems(params: KubeObjectStoreLoadingParams) {
    return Promise.resolve(this._loadItems(params));
  }
}

describe("KubeObjectStore", () => {
  it("should remove an object from the list of items after it is not returned from listing the same namespace again", async () => {
    const loadItems = jest.fn();
    const obj = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "some-obj-name",
        resourceVersion: "1",
        uid: "some-uid",
        namespace: "default",
        selfLink: "/some/self/link",
      },
    });
    const store = new FakeKubeObjectStore(loadItems, {
      isNamespaced: true,
    });

    loadItems.mockImplementationOnce(() => [obj]);

    await store.loadAll({
      namespaces: ["default"],
    });

    expect(store.items).toContain(obj);

    loadItems.mockImplementationOnce(() => []);

    await store.loadAll({
      namespaces: ["default"],
    });

    expect(store.items).not.toContain(obj);
  });

  it("should not remove an object that is not returned, if it is in a different namespace", async () => {
    const loadItems = jest.fn();
    const objInDefaultNamespace = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "some-obj-name",
        resourceVersion: "1",
        uid: "some-uid",
        namespace: "default",
        selfLink: "/some/self/link",
      },
    });
    const objNotInDefaultNamespace = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "some-obj-name",
        resourceVersion: "1",
        uid: "some-uid",
        namespace: "not-default",
        selfLink: "/some/self/link",
      },
    });
    const store = new FakeKubeObjectStore(loadItems, {
      isNamespaced: true,
    });

    loadItems.mockImplementationOnce(() => [objInDefaultNamespace]);

    await store.loadAll({
      namespaces: ["default"],
    });

    expect(store.items).toContain(objInDefaultNamespace);

    loadItems.mockImplementationOnce(() => [objNotInDefaultNamespace]);

    await store.loadAll({
      namespaces: ["not-default"],
    });

    expect(store.items).toContain(objInDefaultNamespace);
  });

  it("should remove all objects not returned if the api is cluster-scoped", async () => {
    const loadItems = jest.fn();
    const clusterScopedObject1 = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "some-obj-name",
        resourceVersion: "1",
        uid: "some-uid",
        selfLink: "/some/self/link",
      },
    });
    const clusterScopedObject2 = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "some-obj-name",
        resourceVersion: "1",
        uid: "some-uid",
        namespace: "not-default",
        selfLink: "/some/self/link",
      },
    });
    const store = new FakeKubeObjectStore(loadItems, {
      isNamespaced: false,
    });

    loadItems.mockImplementationOnce(() => [clusterScopedObject1]);

    await store.loadAll({});

    expect(store.items).toContain(clusterScopedObject1);

    loadItems.mockImplementationOnce(() => [clusterScopedObject2]);

    await store.loadAll({});

    expect(store.items).not.toContain(clusterScopedObject1);
  });

  it("preserves existing loaded items when a subsequent reload fails transiently", async () => {
    const loadItems = jest.fn();
    const existingObj = new KubeObject({
      apiVersion: "v1",
      kind: "Foo",
      metadata: {
        name: "existing-obj",
        resourceVersion: "10",
        uid: "uid-10",
        namespace: "default",
        selfLink: "/api/v1/namespaces/default/foos/existing-obj",
      },
    });
    const store = new FakeKubeObjectStore(loadItems, {
      isNamespaced: true,
    });

    loadItems.mockImplementationOnce(() => [existingObj]);
    await store.loadAll({ namespaces: ["default"] });
    expect(store.items).toContain(existingObj);
    expect(store.isLoaded).toBe(true);

    loadItems.mockImplementationOnce(() => {
      throw new Error("Transient 502 Bad Gateway from proxy");
    });

    await store.loadAll({ namespaces: ["default"] });

    expect(store.items).toContain(existingObj);
    expect(store.isLoaded).toBe(true);
    expect(store.failedLoading).toBe(true);
  });

  it("computes exponential watch retry delay with jitter and upper bound", () => {
    const store = new FakeKubeObjectStore(() => [], {
      isNamespaced: true,
    });

    const d0 = store.computeWatchRetryDelay(0, 1000, 30_000);
    const d1 = store.computeWatchRetryDelay(1, 1000, 30_000);
    const d2 = store.computeWatchRetryDelay(2, 1000, 30_000);
    const d10 = store.computeWatchRetryDelay(10, 1000, 30_000);

    expect(d0).toBeGreaterThanOrEqual(1000);
    expect(d0).toBeLessThan(1250);
    expect(d1).toBeGreaterThanOrEqual(2000);
    expect(d1).toBeLessThan(2500);
    expect(d2).toBeGreaterThanOrEqual(4000);
    expect(d2).toBeLessThan(5000);
    expect(d10).toBeGreaterThanOrEqual(30_000);
    expect(d10).toBeLessThan(37_500);
  });
});


