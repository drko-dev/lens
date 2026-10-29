/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { observable } from "mobx";
import type { Logger } from "@openlens/logger";
import type { ClusterContext } from "../../cluster-frame-context/cluster-frame-context";
import { KubeWatchApi } from "../kube-watch-api";
import type { SubscribableStore } from "../kube-watch-api";

describe("KubeWatchApi shared store subscriptions", () => {
  const createFixture = (clusterContextOverrides: Partial<ClusterContext> = {}) => {
    const cleanup = jest.fn();
    const store: SubscribableStore = {
      api: { isNamespaced: true, apiBase: "roles", kind: "Role" },
      loadAll: jest.fn().mockResolvedValue([]),
      subscribe: jest.fn().mockReturnValue(cleanup),
    };
    const clusterContext = observable({
      allNamespaces: ["qa"],
      contextNamespaces: ["qa"],
      hasSelectedAll: false,
      isLoadingAll: jest.fn(() => false),
      isGlobalWatchEnabled: jest.fn(() => true),
      ...clusterContextOverrides,
    }) as unknown as ClusterContext;
    const logger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    return { store, cleanup, clusterContext, watch: new KubeWatchApi({ clusterContext, logger }) };
  };

  it("keeps the shared watcher alive when its first owner unmounts", async () => {
    const { store, cleanup, watch } = createFixture();
    const unmountFirst = watch.subscribeStores([store]);
    const unmountSecond = watch.subscribeStores([store]);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(store.loadAll).toHaveBeenCalledTimes(1);
    expect(store.subscribe).toHaveBeenCalledTimes(1);

    const { abortController } = (store.subscribe as jest.Mock).mock.calls[0][0];

    expect(abortController.signal.aborted).toBe(false);

    unmountFirst();
    expect(abortController.signal.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();

    unmountSecond();
    expect(abortController.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps the shared watcher alive when its second owner unmounts first", async () => {
    const { store, cleanup, watch } = createFixture();
    const unmountFirst = watch.subscribeStores([store]);
    const unmountSecond = watch.subscribeStores([store]);

    await new Promise(resolve => setTimeout(resolve, 0));

    const { abortController } = (store.subscribe as jest.Mock).mock.calls[0][0];

    unmountSecond();
    expect(abortController.signal.aborted).toBe(false);
    expect(cleanup).not.toHaveBeenCalled();

    unmountFirst();
    expect(abortController.signal.aborted).toBe(true);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(store.loadAll).toHaveBeenCalledTimes(1);
    expect(store.subscribe).toHaveBeenCalledTimes(1);
  });

  it("loads the selected namespace scope and follows later filter changes", async () => {
    const allNamespaces = ["default", "kube-node-lease", "kube-public", "kube-system", "qa"];
    const { store, watch, clusterContext } = createFixture({
      allNamespaces,
      contextNamespaces: allNamespaces,
      hasSelectedAll: true,
      isLoadingAll: namespaces => namespaces.length === allNamespaces.length,
    });

    const unmount = watch.subscribeStores([store]);

    await Promise.resolve();
    await Promise.resolve();

    expect(store.loadAll).toHaveBeenCalledWith(expect.objectContaining({
      namespaces: allNamespaces,
    }));

    (clusterContext as any).contextNamespaces = ["qa"];
    (clusterContext as any).hasSelectedAll = false;
    await Promise.resolve();
    await Promise.resolve();

    expect(store.loadAll).toHaveBeenCalledTimes(2);
    expect(store.loadAll).toHaveBeenLastCalledWith(expect.objectContaining({
      namespaces: ["qa"],
    }));
    unmount();
  });
});
